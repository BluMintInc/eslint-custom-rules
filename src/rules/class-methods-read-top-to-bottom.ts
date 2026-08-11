import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ClassGraphBuilder,
  classMemberNameOf,
  Graph,
} from '../utils/graph/ClassGraphBuilder';
import { ASTHelpers } from '../utils/ASTHelpers';

// The source order and the sorted graph are matched by name, so both sides must
// derive names from the same function: any disagreement makes the two arrays
// differ in length and silently skips the whole class body.
const getMemberName = classMemberNameOf;

/**
 * Whether the proposed order still declares every field above the initializer
 * that reads it. Only field-to-field reads constrain the layout: methods (and
 * private methods) are installed before any initializer runs, so relocating one
 * is unobservable.
 */
function initializerReadsPrecedeDeclarations(
  node: TSESTree.ClassBody,
  sortedOrder: string[],
  graph: Graph,
  className: string,
): boolean {
  const positionOf = new Map(sortedOrder.map((name, index) => [name, index]));
  return node.body.every((member) => {
    if (member.type !== 'PropertyDefinition' || !member.value) {
      return true;
    }
    const reader = getMemberName(member);
    const readerPosition = reader === null ? undefined : positionOf.get(reader);
    if (readerPosition === undefined) {
      return true;
    }
    return ASTHelpers.classMemberNamesReadEagerly(member.value, className)
      .filter((name) => graph[name]?.type === 'property' && name !== reader)
      .every((name) => {
        const readPosition = positionOf.get(name);
        return readPosition === undefined || readPosition < readerPosition;
      });
  });
}

export const classMethodsReadTopToBottom: TSESLint.RuleModule<
  'classMethodsReadTopToBottom',
  never[]
> = createRule({
  name: 'class-methods-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforces a top-to-bottom class layout so callers lead into the helpers they rely on.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      classMethodsReadTopToBottom: [
        "What's wrong: In {{className}}, {{actualMember}} appears before {{expectedMember}}.",
        'Why it matters: Top-down flow enables local reasoning: you can verify each caller without scrolling back. Upward jumps make code reviews harder (must verify call chains in reverse), obscure which fields a helper assumes are initialized, and increase the risk of calling helpers before state is ready (leading to null reference errors or accessing uninitialized fields).',
        'How to fix: Move {{expectedMember}} above {{actualMember}} so the class reads top-to-bottom (fields to constructor to callers to helpers).',
      ].join('\n'),
    },
    fixable: 'code', // To allow ESLint to autofix issues.
  },
  defaultOptions: [],
  create(context) {
    const classNames = new WeakMap<TSESTree.ClassBody, string>();
    return {
      ClassDeclaration(node: TSESTree.ClassDeclaration) {
        classNames.set(node.body, node.id?.name || '');
      },
      ClassExpression(node: TSESTree.ClassExpression) {
        classNames.set(node.body, node.id?.name || '');
      },
      'ClassBody:exit'(node: TSESTree.ClassBody) {
        const className = classNames.get(node) || '';
        const graphBuilder = new ClassGraphBuilder(className, node);
        const sortedOrder = graphBuilder.memberNamesSorted;
        const actualOrder = node.body
          .map((member) => getMemberName(member))
          .filter(Boolean) as string[];

        // Check if we have the same number of methods in both arrays
        // This prevents issues with similar method names being treated as duplicates
        if (sortedOrder.length !== actualOrder.length) {
          return; // Skip if the arrays have different lengths (indicates a potential issue)
        }

        // Create a set of unique method names to check for duplicates
        const uniqueMethodNames = new Set(actualOrder);
        if (uniqueMethodNames.size !== actualOrder.length) {
          return; // Skip if there are actual duplicates
        }

        // Defense-in-depth: the fixer overwrites the ENTIRE class body from the
        // tracked members. If any member is not tracked (unknown node type,
        // non-Identifier/computed key, static block, index signature, etc.), it
        // would be silently dropped by the rewrite. Bail rather than emit a body
        // that deletes source the rule does not track.
        const trackedNames = new Set(sortedOrder);
        const allMembersRepresented = node.body.every((member) => {
          const name = getMemberName(member);
          return name !== null && trackedNames.has(name);
        });
        if (!allMembersRepresented) {
          return;
        }

        // Field declaration order is observable where method order is not:
        // methods are installed before any initializer runs, but a field read
        // before its own declaration evaluates to `undefined` under the
        // `private` spelling and throws under the ECMA `#` spelling. Bail
        // rather than emit an order that changes what the class computes.
        if (
          !initializerReadsPrecedeDeclarations(
            node,
            sortedOrder,
            graphBuilder.graph,
            className,
          )
        ) {
          return;
        }

        for (let i = 0; i < actualOrder.length; i++) {
          const actualMember = actualOrder[i];
          const expectedMember = sortedOrder[i];

          if (!actualMember || !expectedMember) {
            throw new Error(
              `class-methods-read-top-to-bottom invariant violated while comparing members in ${
                className || 'an unnamed class'
              } at position ${i}: actualMember=${String(
                actualMember,
              )}, expectedMember=${String(
                expectedMember,
              )}, actualOrder.length=${
                actualOrder.length
              }, sortedOrder.length=${sortedOrder.length}`,
            );
          }

          if (actualMember !== expectedMember) {
            const classNameReport = className || 'this class';
            const sourceCode = context.getSourceCode();
            const sourceText = sourceCode.getText();

            // A member's block spans its leading comments through its own end,
            // so documentation travels with the member it describes. Because
            // every comment in the body is thereby absorbed into some block,
            // the text between two adjacent blocks is pure whitespace.
            const memberBlocks = node.body.map((member) => {
              const comments = sourceCode.getCommentsBefore(member) || [];
              const start = Math.min(
                member.range[0],
                ...comments.map((comment) => comment.range[0]),
              );
              return {
                name: getMemberName(member),
                text: sourceText.slice(start, member.range[1]),
                start,
                end: member.range[1],
              };
            });

            // Reuse those whitespace runs positionally instead of joining with
            // a bare '\n'. The blank lines between members are the part that
            // matters: prettier preserves existing blank lines but never
            // inserts new ones, so collapsing them is irreversible (#1592).
            // Carrying the runs verbatim also reproduces the newline and
            // indentation after `{` and the newline before `}` for free, since
            // every member sits at the same depth.
            const separators = memberBlocks
              .slice(1)
              .map((block, index) =>
                sourceText.slice(memberBlocks[index].end, block.start),
              );
            const prefix = sourceText.slice(
              node.range[0] + 1,
              memberBlocks[0].start,
            );
            const suffix = sourceText.slice(
              memberBlocks[memberBlocks.length - 1].end,
              node.range[1] - 1,
            );

            const newClassBody =
              prefix +
              sortedOrder
                .map((n) => {
                  const block = memberBlocks.find(({ name }) => name === n);
                  return block ? block.text : '';
                })
                .map((text, index) =>
                  index === 0 ? text : separators[index - 1] + text,
                )
                .join('') +
              suffix;

            return context.report({
              node,
              messageId: 'classMethodsReadTopToBottom',
              data: {
                className: classNameReport,
                actualMember,
                expectedMember,
              },
              fix(fixer) {
                return fixer.replaceTextRange(
                  [node.range[0] + 1, node.range[1] - 1], // Exclude the curly braces
                  newClassBody,
                );
              },
            });
          }
        }
      },
    };
  },
});
