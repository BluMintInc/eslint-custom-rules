import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'enforceMicrodiff' | 'enforceMicrodiffImport';

export const enforceMicrodiff = createRule<[], MessageIds>({
  name: 'enforce-microdiff',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using microdiff for object and array comparison operations',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      enforceMicrodiff:
        'Use the microdiff library for object and array comparison operations',
      enforceMicrodiffImport:
        'Import diff from microdiff instead of {{importSource}}',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const importedDiffLibraries = new Map<string, TSESTree.ImportDeclaration>();
    const importedFunctions = new Map<string, string>(); // Map of imported function names to their sources
    let hasMicrodiffImport = false;
    const reportedNodes = new Set<TSESTree.Node>();

    // Add a specific set to track which import names are used
    const usedImportNames = new Set<string>();

    // Check if a node is an object or array type
    function isObjectOrArrayType(node: TSESTree.Node): boolean {
      if (
        node.type === AST_NODE_TYPES.ArrayExpression ||
        node.type === AST_NODE_TYPES.ObjectExpression
      ) {
        return true;
      }

      // For identifiers, we'll make a simple assumption based on naming conventions
      if (node.type === AST_NODE_TYPES.Identifier) {
        const name = node.name.toLowerCase();
        // Names that likely represent objects or arrays
        if (
          name.includes('obj') ||
          name.includes('config') ||
          name.includes('options') ||
          name.includes('data') ||
          name.includes('state') ||
          name.includes('props') ||
          name.includes('items') ||
          name.includes('array') ||
          name.includes('list') ||
          name.endsWith('s')
        ) {
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
        if (
          [
            'deep-diff',
            'fast-diff',
            'diff',
            'deep-object-diff',
            'fast-deep-equal',
            'fast-deep-equal/es6',
          ].includes(importSource)
        ) {
          // Track imported function names and their sources
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === AST_NODE_TYPES.ImportSpecifier &&
              (specifier.imported.name === 'diff' ||
                specifier.imported.name === 'diffArrays' ||
                specifier.imported.name === 'detailedDiff')
            ) {
              // Track the local name (which could be different due to renaming)
              const localName = specifier.local.name;
              importedFunctions.set(localName, importSource);
            } else if (
              importSource === 'fast-deep-equal' ||
              importSource === 'fast-deep-equal/es6'
            ) {
              // Handle default imports for fast-deep-equal
              if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
                importedFunctions.set(specifier.local.name, importSource);
              }
            }
          });

          // Report all competing diffing libraries right away
          context.report({
            node,
            messageId: 'enforceMicrodiffImport',
            data: {
              importSource,
            },
            fix(fixer) {
              // If we already have a microdiff import, just remove this import
              if (hasMicrodiffImport) {
                return fixer.remove(node);
              }

              // Otherwise, replace with microdiff import
              return fixer.replaceText(
                node,
                `import { diff } from 'microdiff';`,
              );
            },
          });

          // Check if importing a diff function or a known equality library
          const hasDiffImport = node.specifiers.some((specifier) => {
            if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
              return (
                specifier.imported.name === 'diff' ||
                specifier.imported.name === 'diffArrays' ||
                specifier.imported.name === 'detailedDiff'
              );
            }
            return false;
          });

          if (
            hasDiffImport ||
            importSource === 'fast-deep-equal' ||
            importSource === 'fast-deep-equal/es6'
          ) {
            importedDiffLibraries.set(importSource, node);
          }
        }
      },

      // Check for usage of other diffing libraries
      CallExpression(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        const { callee } = node;

        // Check for direct calls to imported diff functions
        if (callee.type === AST_NODE_TYPES.Identifier) {
          const name = callee.name;

          // Check if this is a function we specifically imported from a diff library
          if (importedFunctions.has(name)) {
            usedImportNames.add(name);

            // Always report it if it's from a tracked library
            reportedNodes.add(node);
            context.report({
              node,
              messageId: 'enforceMicrodiff',
              fix(fixer) {
                return fixer.replaceText(callee, 'diff');
              },
            });
            return;
          }

          // Check known diff function names
          const isDiffFunction = [
            'deepDiff',
            'fastDiff',
            'diffArrays',
            'detailedDiff',
            'fastDeepEqual',
            'isEqual',
          ].includes(name);

          if (isDiffFunction) {
            // Track this import name as used
            usedImportNames.add(name);

            // Check if we have at least 2 arguments that are objects or arrays
            if (
              node.arguments.length >= 2 &&
              isObjectOrArrayType(node.arguments[0]) &&
              isObjectOrArrayType(node.arguments[1])
            ) {
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  // When handling fast-diff and similar libraries, need to ensure the function name is replaced
                  return fixer.replaceText(callee, 'diff');
                },
              });
            }
          }
        }

        // Check for lodash difference functions
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === '_'
        ) {
          const property = callee.property;
          if (
            property.type === AST_NODE_TYPES.Identifier &&
            ['difference', 'differenceBy', 'differenceWith'].includes(
              property.name,
            )
          ) {
            reportedNodes.add(node);
            context.report({
              node,
              messageId: 'enforceMicrodiff',
              fix(fixer) {
                // Replace with microdiff
                return fixer.replaceText(
                  node,
                  `diff(${node.arguments
                    .map((arg) => sourceCode.getText(arg))
                    .join(', ')})`,
                );
              },
            });
          }
        }
      },

      // Check for manual object comparison patterns
      BinaryExpression(node) {
        // Skip if we've already reported this node or its parent function
        if (reportedNodes.has(node)) {
          return;
        }

        // Find the parent function or method
        let current: TSESTree.Node | undefined = node;
        while (
          current &&
          current.type !== AST_NODE_TYPES.FunctionDeclaration &&
          current.type !== AST_NODE_TYPES.ArrowFunctionExpression
        ) {
          current = current.parent as TSESTree.Node;
        }

        // If we already reported the parent function, skip this node
        if (current && reportedNodes.has(current)) {
          return;
        }

        // Check for JSON.stringify comparison pattern
        if (
          (node.operator === '===' || node.operator === '!==') &&
          node.left.type === AST_NODE_TYPES.CallExpression &&
          node.right.type === AST_NODE_TYPES.CallExpression
        ) {
          const isJsonStringify = (expr: TSESTree.CallExpression) => {
            return (
              expr.callee.type === AST_NODE_TYPES.MemberExpression &&
              expr.callee.object.type === AST_NODE_TYPES.Identifier &&
              expr.callee.object.name === 'JSON' &&
              expr.callee.property.type === AST_NODE_TYPES.Identifier &&
              expr.callee.property.name === 'stringify'
            );
          };

          if (isJsonStringify(node.left) && isJsonStringify(node.right)) {
            const leftArg = node.left.arguments[0];
            const rightArg = node.right.arguments[0];

            if (isObjectOrArrayType(leftArg) && isObjectOrArrayType(rightArg)) {
              reportedNodes.add(node);
              const isEqual = node.operator === '===';

              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  // Find the containing function to add the import
                  let functionNode: TSESTree.Node | null = node;
                  while (
                    functionNode &&
                    functionNode.type !== AST_NODE_TYPES.FunctionDeclaration &&
                    functionNode.type !==
                      AST_NODE_TYPES.ArrowFunctionExpression &&
                    functionNode.type !== AST_NODE_TYPES.Program
                  ) {
                    functionNode = functionNode.parent as TSESTree.Node;
                  }

                  // If we found a program node and microdiff isn't imported,
                  // we'll need to add the import manually
                  if (
                    functionNode &&
                    functionNode.type === AST_NODE_TYPES.Program &&
                    !hasMicrodiffImport
                  ) {
                    // Need to add an import
                    const importFix = fixer.insertTextBeforeRange(
                      [0, 0],
                      "import { diff } from 'microdiff';\n\n",
                    );

                    // Replace JSON.stringify comparison
                    const compareFix = fixer.replaceText(
                      node,
                      `diff(${sourceCode.getText(
                        leftArg,
                      )}, ${sourceCode.getText(rightArg)})${
                        isEqual ? '.length === 0' : '.length > 0'
                      }`,
                    );

                    return [importFix, compareFix];
                  }

                  // Otherwise just replace the comparison
                  return fixer.replaceText(
                    node,
                    `diff(${sourceCode.getText(leftArg)}, ${sourceCode.getText(
                      rightArg,
                    )})${isEqual ? '.length === 0' : '.length > 0'}`,
                  );
                },
              });
            }
          }
        }
      },

      // Check for custom deep comparison functions
      FunctionDeclaration(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        // Look for functions that might be implementing diff logic
        if (
          node.id &&
          [
            'detectChanges',
            'hasConfigChanged',
            'compareObjects',
            'compareArrays',
            'findChanges',
            'detectDifferences',
            'hasStateChanged',
            'stateHasUpdated',
            'arrayHasChanged',
            'settingsChanged',
          ].includes(node.id.name)
        ) {
          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;
            const bodyText = sourceCode.getText(body);

            // Check if the function body contains a JSON.stringify comparison
            if (
              node.id.name === 'hasConfigChanged' &&
              bodyText.includes('JSON.stringify') &&
              bodyText.includes('!==')
            ) {
              reportedNodes.add(node);
              const param1 = sourceCode.getText(node.params[0]);
              const param2 = sourceCode.getText(node.params[1]);

              context.report({
                node,
                messageId: 'enforceMicrodiff',
                fix(fixer) {
                  // Create a new version of the function with microdiff
                  const newFunctionBody = `{
  return diff(${param1}, ${param2}).length > 0;
}`;

                  if (!hasMicrodiffImport) {
                    // Create a new import statement
                    return fixer.replaceText(
                      node,
                      `import { diff } from 'microdiff';\n\nfunction ${node.id?.name}(${param1}, ${param2}) ${newFunctionBody}`,
                    );
                  } else {
                    // Just replace the function body
                    return fixer.replaceText(body, newFunctionBody);
                  }
                },
              });
              return;
            }

            // Look for patterns that suggest object/array comparison
            const hasComparisonLogic =
              bodyText.includes('JSON.stringify') ||
              bodyText.includes('Object.keys') ||
              bodyText.includes('for (') ||
              bodyText.includes('.some(') ||
              bodyText.includes('.every(');

            if (hasComparisonLogic) {
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
              });
            }
          }
        }
      },

      // Check for custom deep comparison in arrow functions
      ArrowFunctionExpression(node) {
        // Skip if we've already reported this node
        if (reportedNodes.has(node)) {
          return;
        }

        // Only check arrow functions assigned to variables with comparison-like names
        const parent = node.parent;
        if (
          parent &&
          parent.type === AST_NODE_TYPES.VariableDeclarator &&
          parent.id.type === AST_NODE_TYPES.Identifier &&
          [
            'detectChanges',
            'hasConfigChanged',
            'compareObjects',
            'compareArrays',
            'findChanges',
            'detectDifferences',
            'hasStateChanged',
            'stateHasUpdated',
            'arrayHasChanged',
            'settingsChanged',
          ].includes(parent.id.name)
        ) {
          // Check if function has two parameters that might be objects/arrays
          if (node.params.length >= 2) {
            const body = node.body;

            // Look for patterns that suggest object/array comparison
            const bodyText = sourceCode.getText(body);
            const hasComparisonLogic =
              bodyText.includes('JSON.stringify') ||
              bodyText.includes('Object.keys') ||
              bodyText.includes('for (') ||
              bodyText.includes('.some(') ||
              bodyText.includes('.every(');

            if (hasComparisonLogic) {
              reportedNodes.add(node);
              context.report({
                node,
                messageId: 'enforceMicrodiff',
              });
            }
          }
        }
      },
    };
  },
});
