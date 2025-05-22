import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useLatestCallback';

export const useLatestCallback = createRule<[], MessageIds>({
  name: 'use-latest-callback',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using useLatestCallback from use-latest-callback instead of React useCallback',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useLatestCallback: 'Use useLatestCallback from use-latest-callback instead of useCallback from react',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track if the file already has a useLatestCallback import
    let hasUseLatestCallbackImport = false;
    let useLatestCallbackImportName = 'useLatestCallback';

    return {
      // First pass: check if useLatestCallback is already imported
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'use-latest-callback') {
          // Check if useLatestCallback is imported
          const specifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier | TSESTree.ImportDefaultSpecifier =>
              (specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                specifier.imported.type === AST_NODE_TYPES.Identifier &&
                specifier.imported.name === 'useLatestCallback') ||
              specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier
          );

          if (specifiers.length > 0) {
            hasUseLatestCallbackImport = true;
            // Get the local name of the import (in case it's renamed)
            if (specifiers[0].type === AST_NODE_TYPES.ImportSpecifier) {
              useLatestCallbackImportName = specifiers[0].local.name;
            } else if (specifiers[0].type === AST_NODE_TYPES.ImportDefaultSpecifier) {
              useLatestCallbackImportName = specifiers[0].local.name;
            }
          }
        }
      },

      // Second pass: check for useCallback from react
      'ImportDeclaration:exit'(node: TSESTree.ImportDeclaration) {
        if (node.source.value === 'react') {
          const specifiers = node.specifiers.filter(
            (specifier): specifier is TSESTree.ImportSpecifier =>
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              specifier.imported.type === AST_NODE_TYPES.Identifier &&
              specifier.imported.name === 'useCallback',
          );

          if (specifiers.length > 0) {
            context.report({
              node,
              messageId: 'useLatestCallback',
              fix(fixer) {
                // If there are other imports from react, keep them
                const otherSpecifiers = node.specifiers.filter(
                  (specifier): specifier is TSESTree.ImportSpecifier =>
                    specifier.type !== AST_NODE_TYPES.ImportSpecifier ||
                    (specifier.imported.type === AST_NODE_TYPES.Identifier &&
                      specifier.imported.name !== 'useCallback'),
                );

                // Get the local name of useCallback (in case it's renamed)
                const useCallbackLocalName = specifiers[0].local.name;

                // If we need to add the useLatestCallback import and modify the react import
                if (!hasUseLatestCallbackImport) {
                  const importText = `import ${useCallbackLocalName === 'useCallback' ? 'useLatestCallback' : useCallbackLocalName} from 'use-latest-callback';\n`;

                  // If useCallback is the only import from react, replace the entire import with useLatestCallback import
                  if (otherSpecifiers.length === 0) {
                    return fixer.replaceText(node, importText);
                  } else {
                    // Otherwise, add useLatestCallback import and modify the react import
                    const reactImport = `import { ${otherSpecifiers
                      .map((s) => s.local.name)
                      .join(', ')} } from 'react';`;
                    return [
                      fixer.insertTextBefore(node, importText),
                      fixer.replaceText(node, reactImport)
                    ];
                  }
                } else {
                  // If useLatestCallback is already imported, just modify the react import
                  if (otherSpecifiers.length === 0) {
                    return fixer.remove(node);
                  } else {
                    const reactImport = `import { ${otherSpecifiers
                      .map((s) => s.local.name)
                      .join(', ')} } from 'react';`;
                    return fixer.replaceText(node, reactImport);
                  }
                }
              },
            });
          }
        }
      },

      // Third pass: check for useCallback usage and replace with useLatestCallback
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'useCallback' &&
          node.arguments.length >= 1
        ) {
          // Check if this is a JSX-returning callback (edge case where we shouldn't replace)
          const callback = node.arguments[0];
          if (
            (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              callback.type === AST_NODE_TYPES.FunctionExpression) &&
            callback.body
          ) {
            // For arrow functions with implicit return
            if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
              if (isJSXElement(callback.body)) {
                return; // Skip JSX-returning callbacks
              }
            }
            // For functions with block body
            else if (callback.body.body.length === 1 &&
                    callback.body.body[0].type === AST_NODE_TYPES.ReturnStatement &&
                    callback.body.body[0].argument &&
                    isJSXElement(callback.body.body[0].argument)) {
              return; // Skip JSX-returning callbacks
            }
          }

          context.report({
            node,
            messageId: 'useLatestCallback',
            fix(fixer) {
              const sourceCode = context.getSourceCode();
              const callbackText = sourceCode.getText(node.arguments[0]);

              // Replace useCallback with useLatestCallback and remove the dependency array
              return fixer.replaceText(
                node,
                `${useLatestCallbackImportName}(${callbackText})`
              );
            },
          });
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

  // For arrow functions with implicit return
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression && node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isJSXElement(node.body);
  }

  // For functions with block body and return statement
  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    if (node.body.type === AST_NODE_TYPES.BlockStatement && node.body.body.length > 0) {
      const returnStatement = node.body.body.find(
        statement => statement.type === AST_NODE_TYPES.ReturnStatement
      ) as TSESTree.ReturnStatement | undefined;

      if (returnStatement && returnStatement.argument) {
        return isJSXElement(returnStatement.argument);
      }
    }
  }

  return false;
}

export default useLatestCallback;
