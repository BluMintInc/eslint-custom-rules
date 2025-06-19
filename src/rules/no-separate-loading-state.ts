import { createRule } from '../utils/createRule';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'separateLoadingState';

const LOADING_PATTERNS = [
  /^is.*Loading$/i,  // isXLoading pattern
  /^isLoading.+/i,   // isLoadingX pattern
];

export const noSeparateLoadingState = createRule<[], MessageIds>({
  name: 'no-separate-loading-state',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow separate loading state variables that track the loading status of other state',
      recommended: 'error',
    },
    fixable: undefined, // No autofix as mentioned in the spec
    schema: [],
    messages: {
      separateLoadingState: 'Avoid separate loading state. Encode loading status directly in the primary state using a sentinel value like "loading".',
    },
  },
  defaultOptions: [],
  create(context) {
    const loadingStateVariables = new Map<string, TSESTree.VariableDeclarator>();
    const setterUsages = new Map<string, { truthy: boolean, falsy: boolean }>();

    function isLoadingPattern(name: string): boolean {
      return LOADING_PATTERNS.some(pattern => pattern.test(name));
    }

    function isUseStateCall(node: TSESTree.CallExpression): boolean {
      return (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === 'useState'
      );
    }

    function isTruthyValue(node: TSESTree.CallExpressionArgument): boolean {
      if (node.type === AST_NODE_TYPES.Literal) {
        return Boolean(node.value);
      }
      if (node.type === AST_NODE_TYPES.Identifier && node.name === 'true') {
        return true;
      }
      return false;
    }

    function isFalsyValue(node: TSESTree.CallExpressionArgument): boolean {
      if (node.type === AST_NODE_TYPES.Literal) {
        return !node.value;
      }
      if (node.type === AST_NODE_TYPES.Identifier && node.name === 'false') {
        return true;
      }
      return false;
    }

    function getSetterName(declarator: TSESTree.VariableDeclarator): string | null {
      if (declarator.id.type === AST_NODE_TYPES.ArrayPattern && declarator.id.elements.length >= 2) {
        const setterElement = declarator.id.elements[1];
        if (setterElement?.type === AST_NODE_TYPES.Identifier) {
          return setterElement.name;
        }
      }
      return null;
    }

    return {
      VariableDeclarator(node) {
        // Check for useState destructuring patterns
        if (
          node.id.type === AST_NODE_TYPES.ArrayPattern &&
          node.init?.type === AST_NODE_TYPES.CallExpression &&
          isUseStateCall(node.init)
        ) {
          const arrayPattern = node.id;

          // Check if we have at least 2 elements (state and setter)
          if (arrayPattern.elements.length >= 2) {
            const stateElement = arrayPattern.elements[0];
            const setterElement = arrayPattern.elements[1];

            if (
              stateElement?.type === AST_NODE_TYPES.Identifier &&
              setterElement?.type === AST_NODE_TYPES.Identifier &&
              isLoadingPattern(stateElement.name)
            ) {
              loadingStateVariables.set(stateElement.name, node);
              setterUsages.set(setterElement.name, { truthy: false, falsy: false });
            }
          }
        }
      },

      CallExpression(node) {
        // Track setter calls
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          setterUsages.has(node.callee.name) &&
          node.arguments.length > 0
        ) {
          const argument = node.arguments[0];
          const usage = setterUsages.get(node.callee.name)!;

          if (isTruthyValue(argument)) {
            usage.truthy = true;
          } else if (isFalsyValue(argument)) {
            usage.falsy = true;
          }
        }
      },

      'Program:exit'() {
        // Analyze collected data to determine violations
        for (const [, declarator] of loadingStateVariables) {
          const setterName = getSetterName(declarator);
          if (!setterName) continue;

          const usage = setterUsages.get(setterName);
          if (!usage) continue;

          // If we have both truthy and falsy setter calls, it's likely a loading state pattern
          if (usage.truthy && usage.falsy) {
            context.report({
              node: declarator,
              messageId: 'separateLoadingState',
            });
          }
        }
      },
    };
  },
});
