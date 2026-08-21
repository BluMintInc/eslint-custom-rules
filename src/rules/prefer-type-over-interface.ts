import { createRule } from '../utils/createRule';
import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils';

/**
 * A module augmentation targets either an external module
 * (`declare module 'pkg'`, whose id is a string literal) or the global scope
 * (`declare global`). Declaration merging is the whole point of such a block
 * and only `interface` can merge, so the `type` rewrite does not merely change
 * style: it drops the augmentation and collides with the original declaration
 * (TS2300 "Duplicate identifier").
 *
 * A plain `namespace X` — including the ambient `declare namespace X`, whose
 * id is an identifier — augments nothing, so interfaces inside it stay
 * reportable and a type alias works there.
 */
function isModuleAugmentation(node: TSESTree.TSModuleDeclaration): boolean {
  if (
    node.id.type === AST_NODE_TYPES.Literal &&
    typeof node.id.value === 'string'
  ) {
    return true;
  }

  // `declare global` carries a dedicated flag, which also covers the bare
  // `global { ... }` form nested inside an ambient module (that form has no
  // `declare` of its own).
  if (node.global === true) {
    return true;
  }

  // Parser versions that predate the `global` flag spell the same block as an
  // ambient module whose id is the `global` keyword. Requiring `declare` keeps
  // an ordinary `namespace global { ... }` reportable.
  return (
    node.declare === true &&
    node.id.type === AST_NODE_TYPES.Identifier &&
    node.id.name === 'global'
  );
}

/**
 * The interface need not be a direct child of the augmentation block; it can
 * sit inside a nested namespace or any other container within it, so the whole
 * ancestor chain is inspected.
 */
function isInsideModuleAugmentation(node: TSESTree.Node): boolean {
  for (
    let ancestor: TSESTree.Node | undefined = node.parent;
    ancestor;
    ancestor = ancestor.parent
  ) {
    if (
      ancestor.type === AST_NODE_TYPES.TSModuleDeclaration &&
      isModuleAugmentation(ancestor)
    ) {
      return true;
    }
  }
  return false;
}

const DEFAULT_INDENT_UNIT = '  ';

/**
 * The whitespace opening the line `offset` sits on. Read from the line start
 * rather than from the node, so a declaration the parent prefixes — `export
 * interface X` — still reports the indentation of its statement rather than an
 * empty string.
 */
function lineIndentAt(sourceCode: TSESLint.SourceCode, offset: number): string {
  const lineStart = sourceCode.text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/.exec(sourceCode.text.slice(lineStart, offset))?.[0] ?? '';
}

/**
 * One level of indentation as the body already spells it, so a source written
 * with four spaces or tabs shifts by its own unit instead of acquiring a second
 * style. A body whose first member is not indented past the declaration says
 * nothing about the unit, so the formatter's default stands in.
 */
function indentUnitOf(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.TSInterfaceDeclaration,
  baseIndent: string,
): string {
  const firstMember = node.body.body[0];
  if (!firstMember) {
    return DEFAULT_INDENT_UNIT;
  }
  const memberIndent = lineIndentAt(sourceCode, firstMember.range[0]);
  return memberIndent.startsWith(baseIndent) &&
    memberIndent.length > baseIndent.length
    ? memberIndent.slice(baseIndent.length)
    : DEFAULT_INDENT_UNIT;
}

/**
 * Prettier realigns the continuation lines of a block comment only when every
 * one of them opens with `*` — the JSDoc shape. Any other block comment keeps
 * its interior byte for byte, and so must the rewrite: those bytes are the
 * author's, and an intersection carrying either form is stable whichever way
 * the interior sits.
 */
function isRealignedBlockComment(value: string): boolean {
  const lines = `*${value}*`.split('\n');
  return lines.length > 1 && lines.every((line) => line.trimStart()[0] === '*');
}

/**
 * Lines whose leading whitespace belongs to a token rather than to the layout:
 * the interior of a multi-line template literal (where an inserted space
 * changes the runtime string), of a string carrying a line continuation, and of
 * a block comment the formatter leaves alone. Shifting those would rewrite text
 * the fixer does not own.
 *
 * Only lines *after* a token's first are protected. A line that merely starts
 * inside a substitution — the `}` closing `${...}` — carries code, not string
 * content, so it indents with the rest.
 */
function tokenInteriorLines(
  sourceCode: TSESLint.SourceCode,
  body: TSESTree.TSInterfaceBody,
): Set<number> {
  const interior = new Set<number>();
  for (const token of sourceCode.getTokens(body, { includeComments: true })) {
    if (token.loc.start.line === token.loc.end.line) {
      continue;
    }
    if (
      token.type === AST_TOKEN_TYPES.Block &&
      isRealignedBlockComment(token.value)
    ) {
      continue;
    }
    for (
      let line = token.loc.start.line + 1;
      line <= token.loc.end.line;
      line++
    ) {
      interior.add(line);
    }
  }
  return interior;
}

/**
 * Prettier breaks an intersection whose last member is an object literal one
 * arm per line and indents the object, however the joined line measures against
 * `printWidth` — that layout is the shape's, not a response to overflow. The
 * break starts at the SECOND arm, so a lone heritage clause stays on the alias
 * line.
 *
 * The object joins that layout only when the formatter expands it, which for a
 * type literal happens exactly when the source put a line break between `{` and
 * the first member. A body the author kept on one line stays hugged, and the
 * joined intersection is what the formatter writes there (#2077).
 */
function needsIntersectionReflow(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.TSInterfaceDeclaration,
  heritage: TSESTree.TSInterfaceHeritage[],
): boolean {
  if (heritage.length < 2) {
    return false;
  }
  const firstMember = node.body.body[0];
  if (!firstMember) {
    return false;
  }
  return sourceCode.text
    .slice(node.body.range[0], firstMember.range[0])
    .includes('\n');
}

type MessageIds = 'preferType' | 'preferTypeDefaultExport';

/**
 * `export default interface X {…}` is the only spelling TypeScript has for a
 * default-exported type: `export default type X = …` is a syntax error in every
 * form, so the keyword swap has no landing site. It lands there anyway because
 * the `TSInterfaceDeclaration`'s range starts at `interface` while
 * `export default` belongs to the parent node, which made `eslint --fix` write
 * a file that no longer parses (#1850).
 *
 * The conversion is still available to the author, as a two-statement
 * restructure a keyword swap cannot express, so the report stands and carries
 * that remedy instead of a fix.
 */
function isDefaultExported(node: TSESTree.TSInterfaceDeclaration): boolean {
  return node.parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration;
}

/**
 * Declaration merging is what `interface` can do and `type` cannot, so a name
 * carrying more than one declaration is not a stylistic choice: rewriting one
 * of the halves emits two declarations of the same name (TS2300) and silently
 * splits the merged shape, so members that used to coexist no longer do.
 *
 * The check keys on the **declaring scope**, not on a count of the name across
 * the file, because merging is a property of the declaration space. Two
 * same-named interfaces in different function bodies or blocks are distinct
 * types that never merge, and each of those still converts cleanly.
 *
 * Any second definition counts, not only another interface. `class A {}` and
 * `enum A {}` occupy the same type-space slot a type alias would claim, so
 * those conversions break the build too; `function A() {}` and
 * `namespace A {}` are value-space only and would survive the rewrite, but
 * they are rare enough that treating every co-declaration as merged costs
 * almost nothing and keeps the rule from having to model TypeScript's merging
 * table.
 */
function isMergedDeclaration(
  context: Readonly<TSESLint.RuleContext<MessageIds, never[]>>,
  node: TSESTree.TSInterfaceDeclaration,
): boolean {
  // The variable is located by the definition that points back at *this*
  // declaration rather than by taking the first entry, so a parser that also
  // surfaces the type parameters here cannot make the count read off the
  // wrong name.
  const declared = context
    .getDeclaredVariables(node)
    .find((variable) =>
      variable.defs.some((definition) => definition.node === node),
    );

  // A scope manager that never registered the name tells us nothing about
  // merging; falling through preserves the report rather than exempting on a
  // missing signal.
  return declared !== undefined && declared.defs.length > 1;
}

export const preferTypeOverInterface: TSESLint.RuleModule<MessageIds, never[]> =
  createRule({
    name: 'prefer-type-over-interface',
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Prefer using type alias over interface',
        recommended: 'error',
      },
      schema: [],
      messages: {
        preferType:
          'Interface "{{interfaceName}}" should be declared as a type alias. ' +
          'Interfaces can merge across declarations and extend in chains, which fragments the resulting shape across files and makes composition harder to predict and trace. ' +
          'Replace `interface` with `type` and use intersections (for example, `type {{interfaceName}} = Base & { field: string }`) to keep the contract closed and predictable.',
        preferTypeDefaultExport:
          'Interface "{{interfaceName}}" should be declared as a type alias, but a default-exported interface has no in-place conversion, so no autofix is offered here. ' +
          'Interfaces can merge across declarations and extend in chains, which fragments the resulting shape across files and makes composition harder to predict and trace. ' +
          'TypeScript has no default-exported type alias — `export default type {{interfaceName}} = ...` is a syntax error — so the conversion takes two statements: `type {{interfaceName}} = { field: string };` followed by `export type { {{interfaceName}} as default };`, which keeps every existing `import {{interfaceName}} from ...` working. ' +
          'A named `export type {{interfaceName}} = ...` works too, once the import sites are switched to `import type { {{interfaceName}} }`.',
      },
      fixable: 'code',
    },
    defaultOptions: [],

    create(context) {
      return {
        TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
          if (isInsideModuleAugmentation(node)) {
            return;
          }

          // Reporting without a fix would be unactionable here — the author
          // cannot honour it without collapsing the merge by hand — and an
          // unactionable report is what manufactures `eslint-disable` (#1568).
          if (isMergedDeclaration(context, node)) {
            return;
          }

          // Withholding the fix rather than emitting a broken one: every rewrite
          // below assumes the `interface` keyword can become `type` where it
          // stands, and under `export default` that position accepts no
          // declaration at all. The report is kept because the author *can* act
          // on it — unlike a merge, the shape converts by hand — and the remedy
          // travels in the message.
          if (isDefaultExported(node)) {
            context.report({
              node,
              messageId: 'preferTypeDefaultExport',
              data: {
                interfaceName: node.id.name,
              },
            });
            return;
          }

          context.report({
            node,
            messageId: 'preferType',
            data: {
              interfaceName: node.id.name,
            },
            fix(fixer) {
              const sourceCode = context.sourceCode;
              // The `=` must land after the entire declaration header (the
              // name plus any type-parameter list); anchoring on the
              // identifier alone emits unparseable `type Name =<T> {`.
              const header = node.typeParameters ?? node.id;
              const keywordSpan: TSESTree.Range = [
                node.range[0],
                node.id.range[0],
              ];
              // Everything between the header and the opening brace is
              // rewritten wholesale rather than patched token by token: the
              // heritage list needs `,` turned into `&` and the `extends`
              // keyword dropped, and surgical edits leave the separators and
              // the keyword's surrounding whitespace behind. The body starts at
              // the opening brace, so this span cannot swallow a `{` belonging
              // to a heritage type argument or a type-parameter constraint.
              const headerSpan: TSESTree.Range = [
                header.range[1],
                node.body.range[0],
              ];

              // Both rewritten spans are replaced in full, so a comment sitting
              // inside either one would be silently destroyed (and a line
              // comment would even swallow the `=` that follows it). Reporting
              // without a fix preserves the author's prose; the conversion is
              // then made by hand.
              const clobbersComment = sourceCode
                .getAllComments()
                .some((comment) =>
                  [keywordSpan, headerSpan].some(
                    ([start, end]) =>
                      comment.range[0] < end && comment.range[1] > start,
                  ),
                );
              if (clobbersComment) {
                return null;
              }

              const heritage = node.extends ?? [];
              // `getText` round-trips type arguments and qualified names, so
              // `extends ns.B<T>, C` becomes `ns.B<T> & C`.
              const arms = heritage.map((clause) => sourceCode.getText(clause));

              const edits = [fixer.replaceTextRange(keywordSpan, 'type ')];

              if (needsIntersectionReflow(sourceCode, node, heritage)) {
                const baseIndent = lineIndentAt(sourceCode, node.range[0]);
                const unit = indentUnitOf(sourceCode, node, baseIndent);
                const armIndent = `${baseIndent}${unit}`;

                // The object literal lands one level deeper than the alias, so
                // every line the body already occupies moves with it. The body
                // is shifted by inserting the extra level at each line's start
                // rather than by rewriting the body: an insertion cannot drop a
                // comment, a member, or any formatting the author chose.
                edits.push(
                  fixer.replaceTextRange(
                    headerSpan,
                    ` = ${arms.join(` &\n${armIndent}`)} & `,
                  ),
                );

                const protectedLines = tokenInteriorLines(
                  sourceCode,
                  node.body,
                );
                for (
                  let line = node.body.loc.start.line + 1;
                  line <= node.body.loc.end.line;
                  line++
                ) {
                  // A blank line gains trailing whitespace if it is indented,
                  // which is a format failure of its own.
                  if (
                    protectedLines.has(line) ||
                    sourceCode.lines[line - 1].trim() === ''
                  ) {
                    continue;
                  }
                  const lineStart = sourceCode.getIndexFromLoc({
                    line,
                    column: 0,
                  });
                  edits.push(
                    fixer.insertTextBeforeRange([lineStart, lineStart], unit),
                  );
                }
              } else {
                edits.push(
                  fixer.replaceTextRange(
                    headerSpan,
                    arms.length > 0 ? ` = ${arms.join(' & ')} & ` : ' = ',
                  ),
                );
              }

              // Converting a declaration into an assignment changes what ends
              // it: the interface body's `}` closes the declaration on its
              // own, while a type alias needs a statement terminator. ASI
              // covers the omission, so the emission parses and no linter
              // objects — but prettier writes the `;`, and consumers gate on
              // `prettier --check` after this plugin's `--fix`.
              //
              // The token after the body is read rather than assumed: an
              // author who wrote `interface X { … };` already left one there,
              // and `};;` is a prettier failure of its own.
              const tokenAfterBody = sourceCode.getTokenAfter(node.body);
              const isAlreadyTerminated =
                tokenAfterBody?.type === AST_TOKEN_TYPES.Punctuator &&
                tokenAfterBody.value === ';';
              if (!isAlreadyTerminated) {
                edits.push(fixer.insertTextAfter(node.body, ';'));
              }

              return edits;
            },
          });
        },
      };
    },
  });
