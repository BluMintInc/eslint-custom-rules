import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useLatestCallback';

export const useLatestCallback = createRule<[], MessageIds>({
  name: 'use-latest-callback',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using useLatestCallback from use-latest-callback instead of React useCallback',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useLatestCallback:
        'Use useLatestCallback from use-latest-callback instead of useCallback from react',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track if the file already has a useLatestCallback import
    let hasUseLatestCallbackImport = false;
    let useLatestCallbackImportName = 'useLatestCallback';
    // Track useCallback calls that return JSX (should be skipped)
    const jsxReturningCallbacks = new Set<TSESTree.CallExpression>();
    // Track if any useCallback calls should be replaced
    let hasNonJsxUseCallbacks = false;
    // Track useCallback imports from React
    let useCallbackFromReact = false;
    let useCallbackLocalNames = new Set<string>();

    return {
      // First pass: check imports
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'use-latest-callback') {
          // Check if useLatestCallback is imported
          const specifiers = node.specifiers.filter(
            (
              specifier,
            ): specifier is
              | TSESTree.ImportSpecifier
              | TSESTree.ImportDefaultSpecifier =>
              (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.type === AST_NODE_TYPES.Identifier &&
                specifier.imported.name === 'useLatestCallback') ||
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier,
          );

          if (specifiers.length > 0) {
            hasUseLatestCallbackImport = true;
            // Get the local name of the import (in case it's renamed)
            if (specifiers[0].type === AST_NODE_TYPES.ImportSpecifier) {
              useLatestCallbackImportName = specifiers[0].local.name;
            } else if (
              specifiers[0].type === AST_NODE_TYPES.ImportDefaultSpecifier
            ) {
              useLatestCallbackImportName = specifiers[0].local.name;
            }
          }
        } else if (node.source.value === 'react') {
          // Check if useCallback is imported from React
          const useCallbackSpecifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback',
          );

          if (useCallbackSpecifiers.length > 0) {
            useCallbackFromReact = true;
            useCallbackSpecifiers.forEach(spec => {
              useCallbackLocalNames.add(spec.local.name);
            });
          }
        }
      },

      // Check for useCallback usage and identify JSX-returning callbacks
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          useCallbackLocalNames.has(node.callee.name) &&
          node.arguments.length >= 1
        ) {
          // Check if this is a JSX-returning callback (edge case where we shouldn't replace)
          const callback = node.arguments[0];
          let isJsxReturning = false;

          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // For arrow functions with implicit return
            if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
              if (isJSXElement(callback.body)) {
                isJsxReturning = true;
              }
            }
            // For functions with block body - check all return statements
            else if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
              const returnStatements = callback.body.body.filter(
                (statement) => statement.type === AST_NODE_TYPES.ReturnStatement,
              ) as TSESTree.ReturnStatement[];

              // If there are return statements, check if any return JSX
              if (returnStatements.length > 0) {
                isJsxReturning = returnStatements.some(
                  (returnStatement) =>
                    returnStatement.argument &&
                    isJSXElement(returnStatement.argument),
                );
              }
            }
          }

          if (isJsxReturning) {
            jsxReturningCallbacks.add(node);
          } else {
            hasNonJsxUseCallbacks = true;
            // Report the useCallback call for replacement
            context.report({
              node,
              messageId: 'useLatestCallback',
              fix(fixer) {
                const sourceCode = context.getSourceCode();
                const callbackText = sourceCode.getText(node.arguments[0]);

                // Use the renamed import name if useLatestCallback is already imported,
                // otherwise use 'useLatestCallback' for standard imports or the renamed name for renamed imports
                const currentCallbackName = (node.callee as TSESTree.Identifier).name;
                let replacementName: string;

                if (hasUseLatestCallbackImport) {
                  replacementName = useLatestCallbackImportName;
                } else if (currentCallbackName === 'useCallback') {
                  replacementName = 'useLatestCallback';
                } else {
                  // For renamed imports like 'useCallback as useStableCallback'
                  replacementName = currentCallbackName;
                }

                // Replace useCallback with useLatestCallback and remove the dependency array
                return fixer.replaceText(
                  node,
                  `${replacementName}(${callbackText})`,
                );
              },
            });
          }
        }
      },

      // Final pass: check for useCallback import from react (only if there are non-JSX callbacks)
      'Program:exit'() {
        if (!hasNonJsxUseCallbacks || !useCallbackFromReact) {
          return; // Don't modify imports if all useCallback calls return JSX or no React imports
        }

        // Find the React import declaration
        const sourceCode = context.getSourceCode();
        const program = sourceCode.ast;

        for (const statement of program.body) {
          if (
            statement.type === AST_NODE_TYPES.ImportDeclaration &&
            statement.source.value === 'react'
          ) {
            const specifiers = statement.specifiers.filter(
              (specifier): specifier is TSESTree.ImportSpecifier =>
                specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.type === AST_NODE_TYPES.Identifier &&
                specifier.imported.name === 'useCallback',
            );

            if (specifiers.length > 0) {
              context.report({
                node: statement,
                messageId: 'useLatestCallback',
                fix(fixer) {
                  // If there are other imports from react, keep them
                  const otherSpecifiers = statement.specifiers.filter(
                    (specifier): specifier is TSESTree.ImportSpecifier =>
                      specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
                      (specifier.imported.type === AST_NODE_TYPES.Identifier &&
                        specifier.imported.name !== 'useCallback'),
                  );

                  // Get the local name of useCallback (in case it's renamed)
                  const useCallbackLocalName = specifiers[0].local.name;

                  // If we need to add the useLatestCallback import and modify the react import
                  if (!hasUseLatestCallbackImport) {
                    const importText = `import ${
                      useCallbackLocalName === 'useCallback'
                        ? 'useLatestCallback'
                        : useCallbackLocalName
                    } from 'use-latest-callback';`;

                    // If useCallback is the only import from react, replace the entire import with useLatestCallback import
                    if (otherSpecifiers.length === 0) {
                      return fixer.replaceText(statement, importText);
                    } else {
                      // Otherwise, add useLatestCallback import and modify the react import
                      const reactImport = `import { ${otherSpecifiers
                        .map((s) => s.local.name)
                        .join(', ')} } from 'react';`;
                      return [
                        fixer.insertTextBefore(statement, `${importText}\n`),
                        fixer.replaceText(statement, reactImport),
                      ];
                    }
                  } else {
                    // If useLatestCallback is already imported, just modify the react import
                    if (otherSpecifiers.length === 0) {
                      return fixer.remove(statement);
                    } else {
                      const reactImport = `import { ${otherSpecifiers
                        .map((s) => s.local.name)
                        .join(', ')} } from 'react';`;
                      return fixer.replaceText(statement, reactImport);
                    }
                  }
                },
              });
            }
            break; // Only process the first React import
          }
        }
      },
    };
  },
});

// Helper function to check if a node is a JSX element or contains JSX
function isJSXElement(node: TSESTree.Node): boolean {
  if (!node) return false;

  // Check for direct JSX types
  if (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment ||
    node.type === AST_NODE_TYPES.JSXExpressionContainer
  ) {
    return true;
  }

  // Check for conditional expressions that might return JSX
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    const conditionalNode = node as TSESTree.ConditionalExpression;
    return isJSXElement(conditionalNode.consequent) || isJSXElement(conditionalNode.alternate);
  }

  // Check for logical expressions that might return JSX
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    const logicalNode = node as TSESTree.LogicalExpression;
    return isJSXElement(logicalNode.left) || isJSXElement(logicalNode.right);
  }

  return false;
}

export default useLatestCallback;
