import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noSeparateLoadingState';

/**
 * Checks if a variable name matches the loading state patterns
 */
const isLoadingStatePattern = (name: string): boolean => {
  // Pattern 1: isXLoading (e.g., isProfileLoading, isDataLoading)
  const isXLoadingPattern = /^is.+Loading$/i;

  // Pattern 2: isLoadingX (e.g., isLoadingProfile, isLoadingData)
  const isLoadingXPattern = /^isLoading.+$/i;

  // Pattern 3: Generic isLoading
  const isGenericLoadingPattern = /^isLoading$/i;

  return (
    isXLoadingPattern.test(name) ||
    isLoadingXPattern.test(name) ||
    isGenericLoadingPattern.test(name)
  );
};

/**
 * Checks if a node is within a React function component or custom hook
 */
const isInReactComponent = (node: TSESTree.Node): boolean => {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    current = current.parent;

    // Check for function declarations, expressions, or arrow functions
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      // Check if it's a React component (starts with uppercase) or hook (starts with 'use')
      if (current.type === AST_NODE_TYPES.FunctionDeclaration && current.id) {
        const name = current.id.name;
        return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
      }

      // For arrow functions and function expressions, check the variable name
      if (
        current.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        current.parent.id
      ) {
        if (current.parent.id.type === AST_NODE_TYPES.Identifier) {
          const name = current.parent.id.name;
          return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
        }
      }

      // If we can't determine the name, assume it's a React component/hook
      return true;
    }
  }

  return false;
};

/**
 * Checks if a useState call has a setter that's used with async patterns
 */
const hasAsyncUsagePattern = (
  setterName: string,
  functionNode: TSESTree.Node,
): boolean => {
  let hasAsyncPattern = false;

  const checkNode = (node: TSESTree.Node) => {
    // Look for setter calls with true/false patterns
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.Identifier &&
      node.callee.name === setterName &&
      node.arguments.length > 0
    ) {
      const arg = node.arguments[0];

      // Check for boolean literals, boolean-like values, identifiers, or expressions that could be boolean
      if (
        (arg.type === AST_NODE_TYPES.Literal &&
          typeof arg.value === 'boolean') ||
        arg.type === AST_NODE_TYPES.Identifier || // Any identifier could be a boolean variable
        arg.type === AST_NODE_TYPES.UnaryExpression || // !true, !false, etc.
        arg.type === AST_NODE_TYPES.ConditionalExpression || // ternary operators
        arg.type === AST_NODE_TYPES.LogicalExpression || // && || operators
        arg.type === AST_NODE_TYPES.CallExpression // function calls that might return boolean
      ) {
        hasAsyncPattern = true;
      }
    }

    // Recursively check child nodes
    for (const key in node) {
      if (key === 'parent') continue;

      const child = (node as any)[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach((item: any) => {
            if (item && typeof item === 'object') {
              checkNode(item as TSESTree.Node);
            }
          });
        } else {
          checkNode(child as TSESTree.Node);
        }
      }
    }
  };

  checkNode(functionNode);
  return hasAsyncPattern;
};

export const reactNoSeparateLoadingState = createRule<[], MessageIds>({
  name: 'react-no-separate-loading-state',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow separate loading state variables in React components',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [],
    messages: {
      noSeparateLoadingState:
        'Avoid separate loading state "{{name}}". Encode loading state directly in the primary data state using a sentinel value like "loading".',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Only check within React components and hooks
        if (!isInReactComponent(node)) {
          return;
        }

        // Check for useState calls
        if (
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          node.init.callee.type === AST_NODE_TYPES.Identifier &&
          node.init.callee.name === 'useState'
        ) {
          // Check if the destructured variable matches loading patterns
          if (
            node.id.type === AST_NODE_TYPES.ArrayPattern &&
            node.id.elements.length >= 2
          ) {
            const stateVar = node.id.elements[0];
            const setterVar = node.id.elements[1];

            if (
              stateVar?.type === AST_NODE_TYPES.Identifier &&
              setterVar?.type === AST_NODE_TYPES.Identifier &&
              isLoadingStatePattern(stateVar.name)
            ) {
              // Find the containing function to check for async usage patterns
              let functionNode: TSESTree.Node | undefined = node;
              while (functionNode?.parent) {
                functionNode = functionNode.parent;
                if (
                  functionNode.type === AST_NODE_TYPES.FunctionDeclaration ||
                  functionNode.type === AST_NODE_TYPES.FunctionExpression ||
                  functionNode.type === AST_NODE_TYPES.ArrowFunctionExpression
                ) {
                  break;
                }
              }

              // Check if the setter is used in async patterns
              if (
                functionNode &&
                hasAsyncUsagePattern(setterVar.name, functionNode)
              ) {
                context.report({
                  node: stateVar,
                  messageId: 'noSeparateLoadingState',
                  data: {
                    name: stateVar.name,
                  },
                });
              }
            }
          }
        }
      },
    };
  },
});
