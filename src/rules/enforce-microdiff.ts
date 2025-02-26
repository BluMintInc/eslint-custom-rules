import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceMicrodiff' | 'enforceMicrodiffImport';

export const enforceMicrodiff = createRule<[], MessageIds>({
  name: 'enforce-microdiff',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using microdiff for object and array comparison operations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceMicrodiff: 'Use the microdiff library for object and array comparison operations',
      enforceMicrodiffImport: 'Import diff from microdiff instead of {{importSource}}',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const importedDiffLibraries = new Map<string, TSESTree.ImportDeclaration>();
    let hasMicrodiffImport = false;
    const reportedFunctions = new Set<TSESTree.Node>();

    // Check if a node is an object or array type
    function isObjectOrArrayType(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.ArrayExpression ||
          node.type === AST_NODE_TYPES.ObjectExpression) {
        return true;
      }

      // For identifiers, we'll make a simple assumption based on naming conventions
      if (node.type === AST_NODE_TYPES.Identifier) {
        const name = node.name.toLowerCase();
        // Names that likely represent objects or arrays
        if (name.includes('obj') || name.includes('config') ||
            name.includes('options') || name.includes('data') ||
            name.includes('state') || name.includes('props') ||
            name.includes('items') || name.includes('array') ||
            name.includes('list') || name.endsWith('s')) {
          return true;
        }
      }

      // For member expressions, assume they could be objects/arrays
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return true;
      }

      return false;
    }

    return {
      // Track imports of diffing libraries
      ImportDeclaration(node) {
        const importSource = node.source.value;

        // Check for microdiff import
        if (importSource === 'microdiff') {
          hasMicrodiffImport = true;
          return;
        }

        // Track other diffing libraries
        if (['deep-diff', 'fast-diff', 'diff', 'deep-object-diff', 'fast-deep-equal', 'fast-deep-equal/es6'].includes(importSource)) {
          // Check if importing a diff function
          const hasDiffImport = node.specifiers.some(specifier => {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              return specifier.imported.name === 'diff' ||
                     specifier.imported.name === 'diffArrays' ||
                     specifier.imported.name === 'detailedDiff';
            }
            return false;
          });

          if (hasDiffImport || importSource === 'fast-deep-equal' || importSource === 'fast-deep-equal/es6') {
            importedDiffLibraries.set(importSource, node);
          }
        }
      },

      // Check for usage of other diffing libraries
      CallExpression(node) {
        const { callee } = node;

        // Check for direct calls to imported diff functions
        if (callee.type === AST_NODE_TYPES.Identifier) {
          const name = callee.name;
          if (['deepDiff', 'fastDiff', 'diffArrays', 'detailedDiff', 'fastDeepEqual', 'isEqual'].includes(name)) {
            // Check if we have at least 2 arguments that are objects or arrays
            if (node.arguments.length >= 2 &&
                isObjectOrArrayType(node.arguments[0]) &&
                isObjectOrArrayType(node.arguments[1])) {
              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  // Replace with microdiff
                  return fixer.replaceText(
                    node,
                    `diff(${node.arguments.map(arg => sourceCode.getText(arg)).join(', ')})`
                  );
                }
              });
            }
          }
        }

        // Check for lodash difference functions
        if (callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.object.type === AST_NODE_TYPES.Identifier &&
            callee.object.name === '_') {
          const property = callee.property;
          if (property.type === AST_NODE_TYPES.Identifier &&
              ['difference', 'differenceBy', 'differenceWith'].includes(property.name)) {
            context.report({
              node,
              messageId: 'enforceMicrodiff',
              fix(fixer) {
                // Replace with microdiff
                return fixer.replaceText(
                  node,
                  `diff(${node.arguments.map(arg => sourceCode.getText(arg)).join(', ')})`
                );
              }
            });
          }
        }
      },

      // Check for manual object comparison patterns
      BinaryExpression(node) {
        // Check for JSON.stringify comparison pattern
        if ((node.operator === '===' || node.operator === '!==') &&
            node.left.type === AST_NODE_TYPES.CallExpression &&
            node.right.type === AST_NODE_TYPES.CallExpression) {

          const isJsonStringify = (expr: TSESTree.CallExpression) => {
            return expr.callee.type === AST_NODE_TYPES.MemberExpression &&
                  expr.callee.object.type === AST_NODE_TYPES.Identifier &&
                  expr.callee.object.name === 'JSON' &&
                  expr.callee.property.type === AST_NODE_TYPES.Identifier &&
                  expr.callee.property.name === 'stringify';
          };

          if (isJsonStringify(node.left) && isJsonStringify(node.right)) {
            const leftArg = node.left.arguments[0];
            const rightArg = node.right.arguments[0];

            if (isObjectOrArrayType(leftArg) && isObjectOrArrayType(rightArg)) {
              const isEqual = node.operator === '===';
              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  // Replace with microdiff
                  return fixer.replaceText(
                    node,
                    `diff(${sourceCode.getText(leftArg)}, ${sourceCode.getText(rightArg)})${isEqual ? '.length === 0' : '.length > 0'}`
                  );
                }
              });
            }
          }
        }
      },

      // Check for custom deep comparison functions
      FunctionDeclaration(node) {
        // Look for functions that might be implementing diff logic
        if (node.id && ['detectChanges', 'hasConfigChanged', 'compareObjects', 'compareArrays',
                        'findChanges', 'detectDifferences', 'hasStateChanged', 'stateHasUpdated',
                        'arrayHasChanged', 'settingsChanged'].includes(node.id.name)) {

          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;

            // Look for patterns that suggest object/array comparison
            const hasComparisonLogic = sourceCode.getText(body).includes('JSON.stringify') ||
                                      sourceCode.getText(body).includes('Object.keys') ||
                                      sourceCode.getText(body).includes('for (') ||
                                      sourceCode.getText(body).includes('.some(') ||
                                      sourceCode.getText(body).includes('.every(');

            if (hasComparisonLogic) {
              reportedFunctions.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff'
              });
            }
          }
        }
      },

      // Check for custom deep comparison in arrow functions
      ArrowFunctionExpression(node) {
        // Only check arrow functions assigned to variables with comparison-like names
        const parent = node.parent;
        if (parent && parent.type === AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === AST_NODE_TYPES.Identifier &&
            ['detectChanges', 'hasConfigChanged', 'compareObjects', 'compareArrays',
             'findChanges', 'detectDifferences', 'hasStateChanged', 'stateHasUpdated',
             'arrayHasChanged', 'settingsChanged'].includes(parent.id.name)) {

          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;

            // Look for patterns that suggest object/array comparison
            const bodyText = sourceCode.getText(body);
            const hasComparisonLogic = bodyText.includes('JSON.stringify') ||
                                      bodyText.includes('Object.keys') ||
                                      bodyText.includes('for (') ||
                                      bodyText.includes('.some(') ||
                                      bodyText.includes('.every(');

            if (hasComparisonLogic) {
              reportedFunctions.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff'
              });
            }
          }
        }
      },

      // Report on other diffing library imports at the end
      'Program:exit'() {
        // Report on other diffing library imports
        importedDiffLibraries.forEach((node, importSource) => {
          context.report({
            node,
            messageId: 'enforceMicrodiffImport',
            data: {
              importSource
            },
            fix(fixer) {
              // If we already have a microdiff import, just remove this import
              if (hasMicrodiffImport) {
                return fixer.remove(node);
              }

              // Otherwise, replace with microdiff import
              return fixer.replaceText(
                node,
                `import { diff } from 'microdiff';`
              );
            }
          });
        });
      }
    };
  },
});
