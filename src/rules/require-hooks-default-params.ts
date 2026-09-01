import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { declarationOf, resolveInEnclosingScopes } from '../utils/lexicalScope';

type MessageIds = 'requireDefaultParams';

/** Prettier's default print width, which this repo and agora both format with. */
const PRINT_WIDTH = 80;

/** Prettier's default `tabWidth`, the step it indents a broken group by. */
const INDENT_STEP = '  ';

const DEFAULT_SUFFIX = ' = {}';

/**
 * The statement a formatter measures the signature as part of — for an
 * exported hook the group starts at `export`, for an arrow at `const` — or
 * null where the hook is not its statement's only declaration. A sibling
 * declarator carries its own layout decisions, so a multi-declarator statement
 * is left to the flat append.
 */
function enclosingStatementOf(
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
): TSESTree.Node | null {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    const parent = node.parent;
    return parent &&
      (parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
        parent.type === AST_NODE_TYPES.ExportDefaultDeclaration)
      ? parent
      : node;
  }
  const declarator = node.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator) {
    return null;
  }
  const declaration = declarator.parent;
  if (
    declaration?.type !== AST_NODE_TYPES.VariableDeclaration ||
    declaration.declarations.length !== 1
  ) {
    return null;
  }
  return declaration.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration
    ? declaration.parent
    : declaration;
}

/**
 * The break prettier makes once the appended ` = {}` has pushed the signature
 * past the print width, or null where the flat append is the spelling prettier
 * settles on.
 *
 * The append always LENGTHENS the line by five columns, so a signature that
 * fitted before the fix routinely does not after it, and prettier's answer is
 * to expand the destructuring PATTERN — one property per line at one indent
 * step, trailing comma, the close brace back at the statement's column — while
 * the type annotation and everything after the parameter stay on the closing
 * line (#2132). Leaving that break for the next prettier run churns the file
 * on every pass.
 *
 * Every threshold here is measured against agora's prettier 2.8.8, the binary
 * agora CI runs:
 *
 * - The fitting group is the whole line through the body's `{` (or, for an
 *   expression-bodied arrow or an empty body, through the end of the
 *   statement): at 80 columns the line stays flat, at 81 the pattern expands.
 * - Comments after the body's `{` never count — prettier moves them into the
 *   body — while a comment BEFORE it (between `)` and `{`, or inside the
 *   parameter) occupies columns and moves the answer. After a statement's `;`
 *   a trailing BLOCK comment counts and a trailing LINE comment does not.
 * - When the closing line itself would exceed the width, prettier breaks the
 *   type literal too — a shape only a rebuild of the type's members could
 *   emit, and such a rebuild owns every byte between its braces. The break is
 *   withheld there, exactly as it is wherever the post-break layout cannot be
 *   read off the source: a signature already spanning lines, a second
 *   statement sharing the line, a property too long for its own line. The
 *   measurement can withhold a break, never emit one against a guess.
 *
 * The property spans are SLICED between separators rather than re-printed from
 * the AST, so a comment written beside a property — leading, interior, or
 * trailing — rides along verbatim, which is also where prettier keeps it. The
 * two spans the slicing does not carry are declined instead of guessed at: a
 * comment after a trailing comma, and a comment between the pattern's `}` and
 * the `:` (prettier re-homes that one to the other side of the colon).
 */
function patternBreakFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
  param: TSESTree.ObjectPattern,
): TSESLint.RuleFix | null {
  const typeAnnotation = param.typeAnnotation;
  if (!typeAnnotation || param.properties.length === 0) {
    return null;
  }

  const line = param.loc.end.line;
  if (param.loc.start.line !== line || node.loc.start.line !== line) {
    return null;
  }

  const statement = enclosingStatementOf(node);
  if (!statement || statement.loc.start.line !== line) {
    return null;
  }

  // The break aligns to the line's indent, so the statement must be the first
  // thing on it — a second statement sharing the line is split by prettier
  // before any fitting is measured — and a tab indent breaks the column
  // arithmetic outright.
  const lineText = sourceCode.lines[line - 1] ?? '';
  const indent = /^ */.exec(lineText)?.[0] ?? '';
  if (indent.length !== statement.loc.start.column) {
    return null;
  }

  // Where the measured group ends. For a multi-line block body it is the
  // body's `{`; for everything the statement finishes on this line — an
  // expression-bodied arrow, an empty `{}` body — it is the statement's end,
  // extended through any same-line trailing BLOCK comments, which prettier
  // counts there.
  let measuredEndColumn: number;
  let measuredEndOffset: number;
  /**
   * Set on prettier's head-break arrow shape — the signature line ends with
   * `=>` and the expression body sits on the next line — where expanding the
   * pattern lets prettier pull the body back onto the closing line whenever it
   * fits there.
   */
  let detachedBody: TSESTree.Expression | null = null;
  const body = node.body;
  if (body.type === AST_NODE_TYPES.BlockStatement && body.body.length > 0) {
    const bodyOpen = sourceCode.getFirstToken(body);
    if (!bodyOpen || bodyOpen.loc.end.line !== line) {
      return null;
    }
    const afterOpen = sourceCode.getTokenAfter(bodyOpen);
    if (afterOpen && afterOpen.loc.start.line === line) {
      return null;
    }
    measuredEndColumn = bodyOpen.loc.end.column;
    measuredEndOffset = bodyOpen.range[1];
  } else if (
    body.type !== AST_NODE_TYPES.BlockStatement &&
    body.loc.start.line === line + 1
  ) {
    // The group prettier measures ends at the `=>`: the last token the
    // signature line carries. Comments after it are left uncounted so a
    // comment can never flip the verdict.
    let lastOnLine = sourceCode.getTokenBefore(body);
    while (lastOnLine && lastOnLine.loc.end.line > line) {
      lastOnLine = sourceCode.getTokenBefore(lastOnLine);
    }
    if (
      !lastOnLine ||
      lastOnLine.loc.end.line !== line ||
      lastOnLine.range[0] < param.range[1]
    ) {
      return null;
    }
    measuredEndColumn = lastOnLine.loc.end.column;
    measuredEndOffset = lastOnLine.range[1];
    detachedBody = body;
  } else {
    if (statement.loc.end.line !== line) {
      return null;
    }
    const afterStatement = sourceCode.getTokenAfter(statement);
    if (afterStatement && afterStatement.loc.start.line === line) {
      return null;
    }
    measuredEndColumn = statement.loc.end.column;
    measuredEndOffset = statement.range[1];
    for (const comment of sourceCode.getCommentsAfter(statement)) {
      if (
        comment.loc.start.line !== line ||
        comment.loc.end.line !== line ||
        comment.type === AST_TOKEN_TYPES.Line
      ) {
        break;
      }
      measuredEndColumn = comment.loc.end.column;
      measuredEndOffset = comment.range[1];
    }
  }

  if (measuredEndColumn + DEFAULT_SUFFIX.length <= PRINT_WIDTH) {
    return null;
  }

  const patternOpen = sourceCode.getFirstToken(param);
  const patternClose = sourceCode.getTokenBefore(typeAnnotation);
  if (
    !patternOpen ||
    patternOpen.value !== '{' ||
    !patternClose ||
    patternClose.value !== '}'
  ) {
    return null;
  }
  // Prettier re-homes a comment between the pattern's `}` and the `:` to the
  // other side of the colon — a move this fixer does not own.
  if (sourceCode.getCommentsAfter(patternClose).length > 0) {
    return null;
  }

  const text = sourceCode.getText();
  const slices: string[] = [];
  let pos = patternOpen.range[1];
  for (const property of param.properties) {
    const separator = sourceCode.getTokenAfter(property);
    const isComma =
      separator !== null &&
      separator.value === ',' &&
      separator.range[1] <= patternClose.range[0];
    const end = isComma ? separator.range[0] : patternClose.range[0];
    slices.push(text.slice(pos, end).trim());
    pos = isComma && separator ? separator.range[1] : end;
  }
  // Text between the last separator and the close brace that no slice carries
  // — a comment after a trailing comma — would be deleted by the rebuild.
  if (text.slice(pos, patternClose.range[0]).trim() !== '') {
    return null;
  }
  if (slices.some((slice) => slice.length === 0)) {
    return null;
  }

  const propertyIndent = indent + INDENT_STEP;
  // ", " between properties becomes ",\n", so a property line only ever
  // fits if the slice plus its own comma does.
  if (
    slices.some(
      (slice) => propertyIndent.length + slice.length + 1 > PRINT_WIDTH,
    )
  ) {
    return null;
  }

  // The closing line: pattern close brace, the annotation verbatim, the
  // appended default, and everything through the measured end — a return
  // type, an arrow's expression body, a comment between `)` and `{`.
  const tail = text.slice(patternClose.range[0], param.range[1]);
  const closingWidth =
    indent.length +
    tail.length +
    DEFAULT_SUFFIX.length +
    (measuredEndOffset - param.range[1]);
  if (closingWidth > PRINT_WIDTH) {
    return null;
  }

  const brokenPattern =
    '{\n' +
    slices.map((slice) => `${propertyIndent}${slice},\n`).join('') +
    `${indent}${tail}${DEFAULT_SUFFIX}`;

  // On the head-break shape, prettier pulls the body back onto the closing
  // line once the pattern is expanded — but only when it fits there, and the
  // join is only attempted when every byte between the `=>` and the body is
  // provably whitespace: a comment there would be swallowed by the joined
  // span, so its presence routes to the pattern-only break instead, which
  // carries identical tokens and leaves the comment untouched.
  if (detachedBody) {
    const joinSpan = text.slice(param.range[1], detachedBody.range[0]);
    const joinCore = joinSpan.replace(/\s+$/u, '');
    let bodyMeasuredEnd = statement.range[1];
    for (const comment of sourceCode.getCommentsAfter(statement)) {
      if (
        comment.loc.start.line !== line + 1 ||
        comment.loc.end.line !== line + 1 ||
        comment.type === AST_TOKEN_TYPES.Line
      ) {
        break;
      }
      bodyMeasuredEnd = comment.range[1];
    }
    const afterStatement = sourceCode.getTokenAfter(statement);
    const joinedWidth =
      indent.length +
      tail.length +
      DEFAULT_SUFFIX.length +
      joinCore.length +
      1 +
      (bodyMeasuredEnd - detachedBody.range[0]);
    if (
      statement.loc.end.line === line + 1 &&
      detachedBody.loc.end.line === line + 1 &&
      !(afterStatement && afterStatement.loc.start.line === line + 1) &&
      sourceCode.getCommentsBefore(detachedBody).length === 0 &&
      !joinCore.includes('\n') &&
      joinedWidth <= PRINT_WIDTH
    ) {
      return fixer.replaceTextRange(
        [param.range[0], detachedBody.range[0]],
        `${brokenPattern}${joinCore} `,
      );
    }
  }

  return fixer.replaceText(param, brokenPattern);
}

export const requireHooksDefaultParams = createRule<[], MessageIds>({
  name: 'require-hooks-default-params',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce React hooks with optional parameters to default to an empty object',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireDefaultParams:
        'Hook "{{hookName}}" accepts an options object where every property is optional, but the parameter is not defaulted. When callers omit the argument the hook receives undefined, so destructuring or property access throws even though the fields are optional. Default the parameter to an empty object (e.g., "({ option } = {})") so the hook stays safe to call with no arguments.',
    },
  },
  defaultOptions: [],
  create(context) {
    function isHookName(name: string): boolean {
      return name.startsWith('use') && name[3]?.toUpperCase() === name[3];
    }

    /** The declaration a statement introduces, looking through `export`. */
    function typeDeclarationNamed(
      statement: TSESTree.Node,
      name: string,
    ):
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration
      | undefined {
      const declared = declarationOf(statement);
      if (
        (declared.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          declared.type === AST_NODE_TYPES.TSInterfaceDeclaration) &&
        declared.id.name === name
      ) {
        return declared;
      }
      return undefined;
    }

    /**
     * Lexical resolution of a type name, innermost scope outward.
     *
     * `context.getScope()` returns the scope of the node being visited and
     * `scope.variables` is own-scope-only, so a type declared anywhere above
     * the hook is invisible to it — and when a *value* of the same name is
     * bound nearby, the lookup succeeds with a non-type definition and the
     * whole check is abandoned. Walking the enclosing statement containers
     * answers the question the rule actually asks, and a name that resolves to
     * something other than a type declaration simply keeps searching.
     *
     * The container set comes from the shared helper rather than an inlined
     * list: which containers count is not a per-rule decision, and enumerating
     * them here let the DEPTH of a declaration decide whether the rule can see
     * it — a type written in a class `static {}` block or a `switch` case
     * consequent went unresolved while the identical type one container over
     * resolved fine (#1781).
     */
    function resolveTypeDeclaration(
      from: TSESTree.Node,
      name: string,
    ):
      | TSESTree.TSTypeAliasDeclaration
      | TSESTree.TSInterfaceDeclaration
      | undefined {
      return resolveInEnclosingScopes<
        TSESTree.TSTypeAliasDeclaration | TSESTree.TSInterfaceDeclaration
      >(from, (statements) => {
        for (const statement of statements) {
          const found = typeDeclarationNamed(statement, name);
          if (found) {
            return found;
          }
        }
        return undefined;
      });
    }

    function hasAllOptionalProperties(
      typeNode:
        | TSESTree.TypeNode
        | TSESTree.TSTypeAliasDeclaration
        | TSESTree.TSInterfaceDeclaration,
    ): boolean {
      // Handle type literals directly
      if (typeNode.type === AST_NODE_TYPES.TSTypeLiteral) {
        return typeNode.members.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      // Handle type references
      if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
        const typeName = typeNode.typeName;
        if (typeName.type !== AST_NODE_TYPES.Identifier) {
          return false;
        }

        const declaration = resolveTypeDeclaration(typeNode, typeName.name);
        // An unresolved name is an imported type whose shape is unknowable
        // here, so it is treated as carrying required properties.
        return declaration ? hasAllOptionalProperties(declaration) : false;
      }

      // Handle type alias declarations
      if (typeNode.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
        return hasAllOptionalProperties(typeNode.typeAnnotation);
      }

      // Handle interface declarations
      if (typeNode.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        return typeNode.body.body.every((member) => {
          if (member.type !== AST_NODE_TYPES.TSPropertySignature) {
            return false;
          }
          return member.optional === true;
        });
      }

      return false;
    }

    return {
      'ArrowFunctionExpression, FunctionDeclaration'(
        node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration,
      ): void {
        // Check if it's a hook function
        let isHook = false;
        let hookName: string | undefined;
        if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
          hookName = node.id?.name;
          isHook = hookName ? isHookName(hookName) : false;
        } else {
          const parent = node.parent;
          if (
            parent &&
            parent.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id &&
            parent.id.type === AST_NODE_TYPES.Identifier
          ) {
            hookName = parent.id.name;
            isHook = isHookName(parent.id.name);
          }
        }

        if (!isHook) {
          return;
        }

        const messageData = { hookName: hookName ?? 'this hook' };

        // Check if it has exactly one parameter
        if (node.params.length !== 1) {
          return;
        }

        // Check if the parameter is already an assignment pattern
        const param = node.params[0];
        if (param.type === AST_NODE_TYPES.AssignmentPattern) {
          return;
        }

        // Check if the parameter has a type annotation
        if (
          param.type === AST_NODE_TYPES.ObjectPattern &&
          param.typeAnnotation
        ) {
          const typeAnnotation = param.typeAnnotation.typeAnnotation;
          if (hasAllOptionalProperties(typeAnnotation)) {
            context.report({
              node: param,
              messageId: 'requireDefaultParams',
              data: messageData,
              fix(fixer) {
                const sourceCode = context.getSourceCode();
                const broken = patternBreakFix(fixer, sourceCode, node, param);
                if (broken) {
                  return broken;
                }
                const paramText = sourceCode.getText(param);
                return fixer.replaceText(
                  param,
                  `${paramText}${DEFAULT_SUFFIX}`,
                );
              },
            });
          }
        }
      },
    };
  },
});
