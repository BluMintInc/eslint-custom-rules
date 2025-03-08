import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`,
);

/**
 * Rule to detect and remove unused useState hooks in React components
 * This rule identifies cases where the state variable from useState is ignored (e.g., replaced with _)
 */
export const noUnusedUseState = createRule({
  name: 'no-unused-usestate',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unused useState hooks',
      recommended: 'error',
    },
    fixable: 'code',
    messages: {
      unusedUseState:
        'The state variable is ignored. Remove the unused useState hook.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      // Look for variable declarations that destructure from useState
      VariableDeclarator(node) {
        // Check if it's an array pattern (destructuring)
        if (
          node.id.type === TSESTree.AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === TSESTree.AST_NODE_TYPES.CallExpression
        ) {
          const callExpression = node.init;

          // Check if the call is to useState
          if (
            callExpression.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
            callExpression.callee.name === 'useState'
          ) {
            const arrayPattern = node.id;

            // Check if the first element is ignored (named _ or unused)
            if (
              arrayPattern.elements.length > 0 &&
              arrayPattern.elements[0] &&
              arrayPattern.elements[0].type ===
                TSESTree.AST_NODE_TYPES.Identifier &&
              (arrayPattern.elements[0].name === '_' ||
                arrayPattern.elements[0].name.startsWith('_'))
            ) {
              context.report({
                node,
                messageId: 'unusedUseState',
                fix: (fixer) => {
                  // Remove the entire useState declaration
                  const sourceCode = context.getSourceCode();
                  const parentStatement = node.parent;

                  if (
                    parentStatement &&
                    parentStatement.type ===
                      TSESTree.AST_NODE_TYPES.VariableDeclaration
                  ) {
                    // If this is the only declarator, remove the entire statement and any extra whitespace
                    if (parentStatement.declarations.length === 1) {
                      // Get the next token after the statement to handle whitespace properly
                      const nextToken = sourceCode.getTokenAfter(
                        parentStatement,
                        { includeComments: true },
                      );

                      if (nextToken) {
                        // Remove the statement and any whitespace up to the next token
                        return fixer.removeRange([
                          parentStatement.range[0],
                          nextToken.range[0],
                        ]);
                      }

                      return fixer.remove(parentStatement);
                    }

                    // Otherwise, just remove this declarator and any trailing comma
                    const declaratorRange = node.range;

                    // Check if there's a comma after this declarator
                    const tokenAfter = sourceCode.getTokenAfter(node);
                    if (tokenAfter && tokenAfter.value === ',') {
                      return fixer.removeRange([
                        declaratorRange[0],
                        tokenAfter.range[1],
                      ]);
                    }

                    // Check if there's a comma before this declarator
                    const tokenBefore = sourceCode.getTokenBefore(node);
                    if (tokenBefore && tokenBefore.value === ',') {
                      return fixer.removeRange([
                        tokenBefore.range[0],
                        declaratorRange[1],
                      ]);
                    }

                    return fixer.remove(node);
                  }

                  return null;
                },
              });
            }
          }
        }
      },
    };
  },
});
