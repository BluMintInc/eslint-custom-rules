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
      description: 'Ensures classes read linearly from top to bottom.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      classMethodsReadTopToBottom:
        'Methods should be ordered for top-down readability.',
    },
    fixable: 'code', // To allow ESLint to autofix issues.
  },
  defaultOptions: [],
  create(context) {
    let className: string;
    return {
      ClassDeclaration(node: TSESTree.ClassDeclaration) {
        className = node.id?.name || '';
      },
      'ClassBody:exit'(node: TSESTree.ClassBody) {
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

        // Check if the actual order differs from the sorted order
        const needsReordering = actualOrder.some(
          (name, i) => name !== sortedOrder[i]
        );

        if (needsReordering) {
          const sourceCode = context.getSourceCode();

          // Create a map of all members by name for quick lookup
          const memberMap = new Map(
            node.body.map((member) => [getMemberName(member), member])
          );

          // Build the new class body with minimal formatting
          const newClassBody = sortedOrder
            .map((name) => {
              // Get the member node from our map
              const memberNode = memberMap.get(name);
              if (!memberNode) return ''; // Skip if member not found (shouldn't happen)

              // Get comments before the member
              const comments = sourceCode.getCommentsBefore(memberNode);
              
              // Adjust the range to include comments
              if (comments.length > 0) {
                memberNode.range = [
                  Math.min(
                    memberNode.range[0],
                    Math.min(...comments.map((comment) => comment.range[0])),
                  ),
                  memberNode.range[1],
                ];
              }

              // Get the member text with its comments
              const memberText = sourceCode.getText(memberNode);

              // Remove any leading/trailing whitespace and newlines
              return memberText.trim();
            })
            .filter(Boolean) // Remove any empty strings
            .join('\n'); // Join with single newlines

          return context.report({
            node,
            messageId: 'classMethodsReadTopToBottom',
            fix(fixer) {
              return fixer.replaceTextRange(
                [node.range[0] + 1, node.range[1] - 1], // Exclude the curly braces
                newClassBody
              );
            },
          });
        }
      },
    };
  },
});
