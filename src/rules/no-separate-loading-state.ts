import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noSeparateLoadingState';

// Patterns to match loading state variable names
const LOADING_STATE_PATTERNS = [
  /^is.*Loading$/i, // isProfileLoading, isDataLoading, etc.
  /^isLoading.+/i, // isLoadingProfile, isLoadingData, etc.
];

/**
 * Checks if a variable name matches loading state patterns
 */
function isLoadingStateVariable(name: string): boolean {
  return LOADING_STATE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Checks if a node is a useState call expression
 */
function isUseStateCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'useState'
  );
}

export const noSeparateLoadingState = createRule<[], MessageIds>({
  name: 'no-separate-loading-state',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow separate loading state variables that track the loading status of other state',
      recommended: 'error',
    },
    fixable: undefined, // No autofix as it requires manual type changes
    schema: [],
    messages: {
      noSeparateLoadingState:
        'Avoid separate loading state "{{variableName}}". Encode loading status directly in the primary state using a sentinel value like "loading".',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Check if it's an array pattern destructuring from useState
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          isUseStateCall(node.init)
        ) {
          const arrayPattern = node.id;

          // Get the first element (state variable)
          if (arrayPattern.elements.length >= 1) {
            const stateElement = arrayPattern.elements[0];

            if (stateElement?.type === AST_NODE_TYPES.Identifier) {
              const variableName = stateElement.name;

              // Check if the variable name matches loading state patterns
              if (isLoadingStateVariable(variableName)) {
                context.report({
                  node,
                  messageId: 'noSeparateLoadingState',
                  data: {
                    variableName,
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
