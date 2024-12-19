import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'enforceCallback' | 'enforceMemo';

export default createRule<[], MessageIds>({
  name: 'enforce-callback-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce useCallback or useMemo for inline functions in JSX props',
      recommended: 'error',
    },
    messages: {
      enforceCallback: 'Inline functions in JSX props should be wrapped with useCallback',
      enforceMemo: 'Objects/arrays containing functions in JSX props should be wrapped with useMemo',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
      return node.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression || node.type === TSESTree.AST_NODE_TYPES.FunctionExpression;
    }

    function containsFunction(node: TSESTree.Node): boolean {
      if (isFunction(node)) {
        return true;
      }

      if (node.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
        return node.properties.some((prop) => {
          if (prop.type === TSESTree.AST_NODE_TYPES.Property && 'value' in prop) {
            return containsFunction(prop.value);
          }
          return false;
        });
      }

      if (node.type === TSESTree.AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some((element) => element && containsFunction(element));
      }

      return false;
    }

    function checkJSXAttribute(node: TSESTree.JSXAttribute) {
      if (!node.value || node.value.type !== TSESTree.AST_NODE_TYPES.JSXExpressionContainer) {
        return;
      }

      const { expression } = node.value;

      // Skip if the prop is already wrapped in useCallback or useMemo
      if (
        expression.type === TSESTree.AST_NODE_TYPES.CallExpression &&
        expression.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
        (expression.callee.name === 'useCallback' || expression.callee.name === 'useMemo')
      ) {
        return;
      }

      // Check for direct inline functions
      if (isFunction(expression)) {
        context.report({
          node,
          messageId: 'enforceCallback',
        });
        return;
      }

      // Check for objects/arrays containing functions
      if (
        (expression.type === TSESTree.AST_NODE_TYPES.ObjectExpression || expression.type === TSESTree.AST_NODE_TYPES.ArrayExpression) &&
        containsFunction(expression)
      ) {
        context.report({
          node,
          messageId: 'enforceMemo',
        });
      }
    }

    return {
      JSXAttribute: checkJSXAttribute,
    };
  },
});
