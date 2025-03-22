import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';
import { ASTHelpers } from '../utils/ASTHelpers';

type MessageIds = 'noUnnecessaryMemo';

export const noUnnecessaryMemo = createRule<[], MessageIds>({
  name: 'no-unnecessary-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent unnecessary use of React.memo on components without props',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noUnnecessaryMemo: 'Unnecessary use of memo for component without props',
    },
  },
  defaultOptions: [],
  create(context) {
    // Track memo imports
    const memoImports: { [key: string]: string } = {};

    // Track components with Unmemoized suffix
    const unmemoizedComponents: { [key: string]: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression } = {};

    // Track memo usage
    const memoUsages: { [key: string]: TSESTree.CallExpression } = {};

    // Track components that use hooks
    const componentsUsingHooks: Set<string> = new Set();

    // Helper to check if a function body contains hook calls
    const containsHookCall = (node: TSESTree.Node): boolean => {
      if (node.type === AST_NODE_TYPES.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          /^use[A-Z]/.test(node.callee.name)
        ) {
          return true;
        }
      }

      // Recursively check children
      for (const key in node) {
        if (key === 'parent') continue;

        const child = node[key as keyof typeof node];
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === 'object' && 'type' in item) {
              if (containsHookCall(item)) {
                return true;
              }
            }
          }
        } else if (child && typeof child === 'object' && 'type' in child) {
          if (containsHookCall(child)) {
            return true;
          }
        }
      }

      return false;
    };

    // Helper to check if a component has empty parameters
    const hasEmptyParameters = (node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean => {
      if (!node.params || node.params.length === 0) {
        return true;
      }

      // Check for empty object pattern: ({})
      if (
        node.params.length === 1 &&
        node.params[0].type === AST_NODE_TYPES.ObjectPattern &&
        node.params[0].properties.length === 0
      ) {
        return true;
      }

      return false;
    };

    return {
      // Track memo imports
      ImportSpecifier(node: TSESTree.ImportSpecifier) {
        if (
          node.imported.type === AST_NODE_TYPES.Identifier &&
          node.imported.name === 'memo' &&
          node.parent?.type === AST_NODE_TYPES.ImportDeclaration
        ) {
          memoImports[node.local.name] = node.parent.source.value;
        }
      },

      // Track function declarations with Unmemoized suffix
      FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
        if (
          node.id &&
          node.id.name.endsWith('Unmemoized') &&
          ASTHelpers.returnsJSX(node.body)
        ) {
          unmemoizedComponents[node.id.name] = node;

          // Check if the component uses hooks
          if (containsHookCall(node.body)) {
            componentsUsingHooks.add(node.id.name);
          }
        }
      },

      // Track arrow functions with Unmemoized suffix
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.id.name.endsWith('Unmemoized') &&
          node.init &&
          (node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            node.init.type === AST_NODE_TYPES.FunctionExpression) &&
          ASTHelpers.returnsJSX(node.init.body)
        ) {
          unmemoizedComponents[node.id.name] = node.init;

          // Check if the component uses hooks
          if (containsHookCall(node.init)) {
            componentsUsingHooks.add(node.id.name);
          }
        }
      },

      // Track memo usage
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          memoImports[node.callee.name] !== undefined &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.Identifier
        ) {
          const componentName = node.arguments[0].name;
          if (unmemoizedComponents[componentName]) {
            memoUsages[componentName] = node;
          }
        }
      },

      // At the end of the program, check for unnecessary memo usage
      'Program:exit'() {
        for (const componentName in unmemoizedComponents) {
          const component = unmemoizedComponents[componentName];
          const memoUsage = memoUsages[componentName];

          // Skip if the component uses hooks (might need memoization)
          if (componentsUsingHooks.has(componentName)) {
            continue;
          }

          // Check for rest parameters
          const hasRestParam = component.params?.some(
            param => param.type === AST_NODE_TYPES.RestElement
          );

          if (hasRestParam) {
            continue; // Skip components with rest parameters
          }

          // Check if the component has no props
          const hasNoProps = hasEmptyParameters(component);

          if (hasNoProps && memoUsage) {
            // Get the non-memoized component name (without "Unmemoized" suffix)
            const originalComponentName = componentName.replace(/Unmemoized$/, '');

            context.report({
              node: memoUsage,
              messageId: 'noUnnecessaryMemo',
              fix(fixer) {
                // For simplicity, let's just suggest removing the memo wrapper
                // and renaming the component rather than trying to completely
                // restructure the code

                return [
                  // Add a comment suggesting the fix
                  fixer.insertTextBefore(
                    memoUsage,
                    `// This component doesn't have props and doesn't need memo\n// Suggested fix: export function ${originalComponentName}() { ... }\n`
                  )
                ];
              },
            });
          }
        }
      },
    };
  },
});
