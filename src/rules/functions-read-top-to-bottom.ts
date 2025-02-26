import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { FunctionGraphBuilder } from '../utils/graph/FunctionGraphBuilder';

function getFunctionName(node: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression): string | null {
  if (node.type === 'FunctionDeclaration' && node.id) {
    return node.id.name;
  } else if (
    node.type === 'FunctionExpression' &&
    node.parent &&
    node.parent.type === 'VariableDeclarator' &&
    node.parent.id.type === 'Identifier'
  ) {
    return node.parent.id.name;
  } else if (
    node.type === 'ArrowFunctionExpression' &&
    node.parent &&
    node.parent.type === 'VariableDeclarator' &&
    node.parent.id.type === 'Identifier'
  ) {
    return node.parent.id.name;
  }
  return null;
}

export const functionsReadTopToBottom: TSESLint.RuleModule<
  'functionsReadTopToBottom',
  never[]
> = createRule({
  name: 'functions-read-top-to-bottom',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensures functions are ordered for top-down readability.',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      functionsReadTopToBottom:
        'Functions should be ordered for top-down readability.',
    },
    fixable: 'code', // To allow ESLint to autofix issues.
  },
  defaultOptions: [],
  create(context) {
    const topLevelFunctions: TSESTree.FunctionDeclaration[] = [];
    const functionExpressions: (TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression)[] = [];

    return {
      'Program:exit'(node: TSESTree.Program) {
        const graphBuilder = new FunctionGraphBuilder(topLevelFunctions, functionExpressions);
        const sortedOrder = graphBuilder.functionNamesSorted;
        const actualOrder = [...topLevelFunctions, ...functionExpressions]
          .map((func) => getFunctionName(func))
          .filter(Boolean) as string[];

        // Check if the actual order matches the sorted order
        for (let i = 0; i < actualOrder.length; i++) {
          if (actualOrder[i] !== sortedOrder[i]) {
            const sourceCode = context.getSourceCode();
            const newFunctionBody = sortedOrder
              .map((name) => {
                // Find the function node corresponding to the name
                const functionNode = [...topLevelFunctions, ...functionExpressions].find(
                  (func) => getFunctionName(func) === name
                );

                if (!functionNode) {
                  return '';
                }

                // Handle function expressions in variable declarations
                // Find the appropriate node to use for text extraction
                let nodeToUse: TSESTree.Node = functionNode;
                if (
                  (functionNode.type === 'FunctionExpression' ||
                   functionNode.type === 'ArrowFunctionExpression') &&
                  functionNode.parent &&
                  functionNode.parent.type === 'VariableDeclarator' &&
                  functionNode.parent.parent &&
                  functionNode.parent.parent.type === 'VariableDeclaration'
                ) {
                  nodeToUse = functionNode.parent.parent;
                }

                // Get comments before the node
                const comments = sourceCode.getCommentsBefore(nodeToUse) || [];

                // Filter out comments that are file-level comments or not directly associated with this function
                const relevantComments = comments.filter(comment => {
                  // Only include comments that are on the same line or one line above the function
                  const commentLine = sourceCode.getLocFromIndex(comment.range[0]).line;
                  const nodeLine = sourceCode.getLocFromIndex(nodeToUse.range[0]).line;
                  return nodeLine - commentLine <= 2;
                });

                const nodeRange = nodeToUse.range;
                const newRange: [number, number] =
                  relevantComments.length > 0
                    ? [
                        Math.min(
                          nodeRange[0],
                          Math.min(
                            ...relevantComments.map((comment) => comment.range[0]),
                          ),
                        ),
                        Math.max(
                          nodeRange[1],
                          Math.max(
                            ...relevantComments.map((comment) => comment.range[1]),
                          ),
                        ),
                      ]
                    : nodeRange;
                return sourceCode.getText({ ...nodeToUse, range: newRange });
              })
              .filter(Boolean)
              .join('\n\n');

            return context.report({
              node,
              messageId: 'functionsReadTopToBottom',
              fix(fixer) {
                // Get the range of all functions to replace
                const allFunctions = [...topLevelFunctions, ...functionExpressions];
                const functionNodes = allFunctions.map(func => {
                  if (
                    (func.type === 'FunctionExpression' ||
                     func.type === 'ArrowFunctionExpression') &&
                    func.parent &&
                    func.parent.type === 'VariableDeclarator' &&
                    func.parent.parent &&
                    func.parent.parent.type === 'VariableDeclaration'
                  ) {
                    return func.parent.parent;
                  }
                  return func;
                });

                // Find the start of the first function and the end of the last function
                const startPos = Math.min(...functionNodes.map(n => n.range[0]));
                const endPos = Math.max(...functionNodes.map(n => n.range[1]));

                // Remove trailing whitespace and ensure consistent formatting
                const formattedBody = newFunctionBody.replace(/\s+$/, '');
                return fixer.replaceTextRange([startPos, endPos], formattedBody);
              },
            });
          }
        }
      },
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        // Only collect top-level function declarations
        if (node.parent && node.parent.type === 'Program') {
          topLevelFunctions.push(node);
        }
      },
      FunctionExpression(node: TSESTree.FunctionExpression) {
        // Only collect top-level function expressions assigned to variables
        if (
          node.parent &&
          node.parent.type === 'VariableDeclarator' &&
          node.parent.parent &&
          node.parent.parent.type === 'VariableDeclaration' &&
          node.parent.parent.parent &&
          node.parent.parent.parent.type === 'Program'
        ) {
          functionExpressions.push(node);
        }
      },
      ArrowFunctionExpression(node: TSESTree.ArrowFunctionExpression) {
        // Only collect top-level arrow functions assigned to variables
        if (
          node.parent &&
          node.parent.type === 'VariableDeclarator' &&
          node.parent.parent &&
          node.parent.parent.type === 'VariableDeclaration' &&
          node.parent.parent.parent &&
          node.parent.parent.parent.type === 'Program'
        ) {
          functionExpressions.push(node);
        }
      },
    };
  },
});
