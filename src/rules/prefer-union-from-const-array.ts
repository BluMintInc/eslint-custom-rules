import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDerivedUnion';

/**
 * Mechanically derive an UPPER_SNAKE constant base from a PascalCase/camelCase
 * type name by inserting `_` at every lowercase/digit-to-uppercase boundary and
 * uppercasing. `TournamentActionId` -> `TOURNAMENT_ACTION_ID`. Acronym runs stay
 * glued together (`HTTPStatus` -> `HTTPSTATUS`), which is an acceptable simple
 * behavior per the spec since no reliable acronym segmentation exists.
 */
function toUpperSnake(name: string): string {
  return name
    .split(/(?<=[a-z0-9])(?=[A-Z])/)
    .join('_')
    .toUpperCase();
}

/**
 * A union member qualifies only when it is a string-literal type. Numbers,
 * `null`, `undefined`, `string`, template-literal types, and type references
 * all fail this guard and disqualify the entire union (string-literal-only).
 */
function isStringLiteralType(
  member: TSESTree.TypeNode,
): member is TSESTree.TSLiteralType {
  if (member.type !== AST_NODE_TYPES.TSLiteralType) {
    return false;
  }
  const { literal } = member;
  return (
    literal.type === AST_NODE_TYPES.Literal && typeof literal.value === 'string'
  );
}

/**
 * Walk the scope chain upward collecting declared variable names. Used to skip
 * the autofix (report-only) when the derived `{TYPE}_VALUES` name is already
 * bound, so the fix never shadows or duplicates an existing identifier.
 */
function isNameInScope(
  scope: TSESLint.Scope.Scope | null,
  name: string,
): boolean {
  let current: TSESLint.Scope.Scope | null = scope;
  while (current) {
    if (current.variables.some((variable) => variable.name === name)) {
      return true;
    }
    current = current.upper;
  }
  return false;
}

export const preferUnionFromConstArray = createRule<[], MessageIds>({
  name: 'prefer-union-from-const-array',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Derive string-literal union types from an `as const` array instead of declaring the union inline, so the runtime value set and the type share a single source of truth',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferDerivedUnion:
        'Derive this union from an `as const` array: `const {{constName}} = [...] as const; type {{typeName}} = (typeof {{constName}})[number];`. This tethers the type to importable runtime values and prevents silent drift. Consider also naming each literal as its own exported constant so call sites never repeat magic strings.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      TSTypeAliasDeclaration(node) {
        const { typeAnnotation } = node;
        if (typeAnnotation.type !== AST_NODE_TYPES.TSUnionType) {
          return;
        }

        const members = typeAnnotation.types;
        // A single-member "union" is not a TSUnionType, but guard anyway; only
        // multi-member unions are in scope.
        if (members.length < 2) {
          return;
        }

        // Every member must be a string literal; any other member kind
        // (number, null, undefined, string, template literal, type reference)
        // disqualifies the whole union.
        if (!members.every(isStringLiteralType)) {
          return;
        }

        const typeName = node.id.name;
        const constName = `${toUpperSnake(typeName)}_VALUES`;

        // The type alias is exported when wrapped in `export type X = ...`
        // (a local export declaration, not a re-export with a `source`).
        const isExported =
          node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration &&
          !node.parent.source;
        const fixNode = isExported
          ? (node.parent as TSESTree.ExportNamedDeclaration)
          : node;

        // Skip the fix (report-only) when the derived const name already exists
        // in scope, to avoid shadowing/duplicating an existing declaration.
        const hasCollision = isNameInScope(context.getScope(), constName);

        if (hasCollision) {
          context.report({
            node,
            messageId: 'preferDerivedUnion',
            data: { constName, typeName },
          });
          return;
        }

        context.report({
          node,
          messageId: 'preferDerivedUnion',
          data: { constName, typeName },
          fix(fixer) {
            const literals = (members as TSESTree.TSLiteralType[])
              .map((member) => {
                const literal = member.literal as TSESTree.StringLiteral;
                return literal.raw ?? sourceCode.getText(literal);
              })
              .join(', ');

            const typeParams = node.typeParameters
              ? sourceCode.getText(node.typeParameters)
              : '';

            const constKeyword = isExported ? 'export const' : 'const';
            const typeKeyword = isExported ? 'export type' : 'type';

            // Preserve the declaration's own indentation for the second line;
            // the first line reuses the original leading whitespace (untouched
            // because the fix range starts at the `export`/`type` keyword, not
            // at the start of the line — this also leaves leading comments in
            // place).
            const lineText = sourceCode.lines[fixNode.loc.start.line - 1] ?? '';
            const indentMatch = lineText
              .slice(0, fixNode.loc.start.column)
              .match(/^\s*/);
            const indent = indentMatch ? indentMatch[0] : '';

            const constDecl = `${constKeyword} ${constName} = [${literals}] as const;`;
            const typeDecl = `${typeKeyword} ${typeName}${typeParams} = (typeof ${constName})[number];`;

            return fixer.replaceText(
              fixNode,
              `${constDecl}\n${indent}${typeDecl}`,
            );
          },
        });
      },
    };
  },
});

export default preferUnionFromConstArray;
