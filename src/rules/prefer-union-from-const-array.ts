import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'preferDerivedUnion';

type Options = [
  {
    printWidth?: number;
  },
];

/**
 * Matches Prettier's own default. The autofix authors a whole statement that a
 * formatter owns, so a line it emits past this width is rewritten on the next
 * `prettier --write` — and fails `prettier --check` in the meantime.
 */
const DEFAULT_PRINT_WIDTH = 80;

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
 * A declaration file is ambient in its entirety, so a declaration in one is
 * subject to the ambient restriction even without an explicit `declare`.
 */
const DECLARATION_FILE = /\.d\.[cm]?ts$/i;

/**
 * An ambient context accepts only a string, numeric or literal-enum `const`
 * initializer (TS1254), so the derived `as const` array cannot be emitted there
 * at all — `as const` or not, an array literal is rejected. Declining is the
 * remedy rather than a different rewrite, because no legal rewrite exists in
 * that position: the rule asks for importable runtime values and an ambient
 * declaration is precisely the promise that no runtime value is emitted.
 *
 * `declare` on the OUTERMOST module declaration makes every level nested below
 * it ambient too, so the whole ancestor chain is walked rather than just the
 * enclosing block. A module named by a string literal (`module 'x' {}`) and a
 * `global {}` augmentation are ambient by construction, with or without the
 * modifier.
 */
function isInAmbientContext(node: TSESTree.Node, filename: string): boolean {
  if (DECLARATION_FILE.test(filename)) {
    return true;
  }
  if (
    node.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
    node.declare === true
  ) {
    return true;
  }
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.TSModuleDeclaration) {
      if (
        current.declare === true ||
        current.global === true ||
        current.id.type === AST_NODE_TYPES.Literal
      ) {
        return true;
      }
    }
    current = current.parent;
  }
  return false;
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

/**
 * The file's own nesting step, taken as the most common indentation increase
 * between consecutive lines. Reading it from the source keeps emitted code in
 * the author's units instead of assuming a two-space, space-indented file.
 */
function indentUnitOf(sourceCode: TSESLint.SourceCode): string {
  const text = sourceCode.getText();
  const blockComments = sourceCode
    .getAllComments()
    .filter((comment) => comment.type === AST_TOKEN_TYPES.Block)
    .map((comment) => comment.range);
  // A block comment's interior lines carry whatever alignment the comment uses
  // — the `*` one column in from its own indentation, or, for commented-out
  // code, the original code's depths. Neither is a nesting step of the file, and
  // counting them makes a JSDoc-heavy file look 1-space indented. Keying on the
  // comment's range rather than a leading `*` also covers a body without them.
  const continuesBlockComment = (offset: number) =>
    blockComments.some(([start, end]) => start < offset && offset < end);

  const frequencies = new Map<string, number>();
  let previous = '';
  let offset = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;
    if (line.trim() === '') {
      continue;
    }
    if (continuesBlockComment(lineStart)) {
      continue;
    }
    const match = /^[ \t]*/.exec(line);
    const indent = match ? match[0] : '';
    if (indent.length > previous.length && indent.startsWith(previous)) {
      const delta = indent.slice(previous.length);
      frequencies.set(delta, (frequencies.get(delta) ?? 0) + 1);
    }
    previous = indent;
  }

  let unit = '  ';
  let best = 0;
  for (const [delta, count] of frequencies) {
    if (count > best) {
      unit = delta;
      best = count;
    }
  }
  return unit;
}

export const preferUnionFromConstArray = createRule<Options, MessageIds>({
  name: 'prefer-union-from-const-array',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Derive string-literal union types from an `as const` array instead of declaring the union inline, so the runtime value set and the type share a single source of truth',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          printWidth: {
            type: 'number',
            minimum: 1,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      preferDerivedUnion:
        'Derive this union from an `as const` array: `const {{constName}} = [...] as const; type {{typeName}} = (typeof {{constName}})[number];`. This tethers the type to importable runtime values and prevents silent drift. Consider also naming each literal as its own exported constant so call sites never repeat magic strings.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const sourceCode = context.getSourceCode();

    const printWidth =
      typeof options.printWidth === 'number' && options.printWidth > 0
        ? options.printWidth
        : DEFAULT_PRINT_WIDTH;

    // Derived once per file rather than per fix: every fix in a file shares the
    // author's nesting step.
    let indentUnit: string | null = null;
    const fileIndentUnit = () => {
      if (indentUnit === null) {
        indentUnit = indentUnitOf(sourceCode);
      }
      return indentUnit;
    };

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

        if (isInAmbientContext(node, context.getFilename())) {
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
            const literals = (members as TSESTree.TSLiteralType[]).map(
              (member) => {
                const literal = member.literal as TSESTree.StringLiteral;
                return literal.raw ?? sourceCode.getText(literal);
              },
            );

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

            // A line break the fixer does not add is one Prettier adds later,
            // so the fix must decide the same way Prettier does: keep the
            // statement on one line while it fits, break it open past the print
            // width. Over-wrapping is not the safe direction here — unlike an
            // object literal, an array Prettier considers short enough is
            // collapsed back onto one line, so a blanket wrap would trade this
            // defect for its mirror image on every short union.
            //
            // The emitted const starts where the replaced node starts, so its
            // column is the exact prefix length; the derived alias is emitted on
            // a fresh line at `indent`.
            const constStartColumn = fixNode.loc.start.column;
            const inlineConst = `${constKeyword} ${constName} = [${literals.join(
              ', ',
            )}] as const;`;

            // A literal whose raw text spans lines (a string written with a
            // backslash line continuation) cannot sit on one line at all, so
            // there is no width to compare — such an array always breaks open.
            // Its raw text is emitted verbatim, leaving the interior line break
            // and everything after it exactly where the author put it: that
            // whitespace is string DATA, not layout.
            const hasMultilineLiteral = literals.some((literal) =>
              /[\r\n]/.test(literal),
            );

            const constDecl =
              !hasMultilineLiteral &&
              constStartColumn + inlineConst.length <= printWidth
                ? inlineConst
                : `${constKeyword} ${constName} = [\n${literals
                    .map((literal) => `${indent}${fileIndentUnit()}${literal},`)
                    .join('\n')}\n${indent}] as const;`;

            const inlineType = `${typeKeyword} ${typeName}${typeParams} = (typeof ${constName})[number];`;
            // Prettier answers an over-long type alias by breaking after the
            // `=`, the only break point the derived form has.
            const typeDecl =
              typeParams.includes('\n') ||
              indent.length + inlineType.length <= printWidth
                ? inlineType
                : `${typeKeyword} ${typeName}${typeParams} =\n${indent}${fileIndentUnit()}(typeof ${constName})[number];`;

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
