import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ClassGraphBuilder } from '../utils/graph/ClassGraphBuilder';

function getMemberName(member: TSESTree.ClassElement): string | null {
  if (
    member.type === 'MethodDefinition' ||
    member.type === 'PropertyDefinition'
  ) {
    return member.key.type === 'Identifier' ? member.key.name : null;
  }
  return null;
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
      recommended: 'warn',
    },
    schema: [],
    messages: {
      classMethodsReadTopToBottom:
        [
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
          .map((member) =>
            member.type === 'MethodDefinition' ||
            member.type === 'PropertyDefinition'
              ? (member.key as TSESTree.Identifier).name
              : null,
          )
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

        for (let i = 0; i < actualOrder.length; i++) {
          const actualMember = actualOrder[i];
          const expectedMember = sortedOrder[i];

          if (!actualMember || !expectedMember) {
            throw new Error(
              `class-methods-read-top-to-bottom invariant violated while comparing members in ${
                className || 'an unnamed class'
              } at position ${i}: actualMember=${String(
                actualMember,
              )}, expectedMember=${String(expectedMember)}, actualOrder.length=${
                actualOrder.length
              }, sortedOrder.length=${sortedOrder.length}`,
            );
          }

          if (actualMember !== expectedMember) {
            const classNameReport = className || 'this class';
            const sourceCode = context.getSourceCode();
            const newClassBody = sortedOrder
              .map((n) => {
                // Fetch the actual AST node corresponding to the name
                const memberNode = node.body.find(
                  (member) => getMemberName(member) === n,
                );
                if (!memberNode) {
                  return '';
                }
                const comments = sourceCode.getCommentsBefore(memberNode) || [];
                const nodeRange = memberNode.range;
                const newRange: [number, number] =
                  comments.length > 0
                    ? [
                        Math.min(
                          nodeRange[0],
                          Math.min(
                            ...comments.map((comment) => comment.range[0]),
                          ),
                        ),
                        Math.max(
                          nodeRange[1],
                          Math.max(
                            ...comments.map((comment) => comment.range[1]),
                          ),
                        ),
                      ]
                    : nodeRange;
                return sourceCode.getText({ ...memberNode, range: newRange });
              })
              .filter(Boolean)
              .join('\n');
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
