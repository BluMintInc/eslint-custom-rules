import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'enforceCallback' | 'enforceMemo';

export default createRule<[], MessageIds>({
  name: 'enforce-callback-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce useCallback or useMemo for inline functions in JSX props',
      recommended: 'error',
    },
    messages: {
      enforceCallback:
        'Inline functions in JSX props should be wrapped with useCallback to prevent unnecessary re-renders. Instead of `<Button onClick={() => handleClick(id)} />`, use `<Button onClick={useCallback(() => handleClick(id), [id])} />`.',
      enforceMemo:
        'Objects/arrays containing functions in JSX props should be wrapped with useMemo to prevent unnecessary re-renders. Instead of `<Component config={{ onSubmit: () => {...} }} />`, use `<Component config={useMemo(() => ({ onSubmit: () => {...} }), [])} />`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isFunction(
      node: TSESTree.Node,
    ): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
      return (
        node.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === TSESTree.AST_NODE_TYPES.FunctionExpression
      );
    }

    function containsFunction(node: TSESTree.Node): boolean {
      if (isFunction(node)) {
        return true;
      }

      if (node.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
        return node.properties.some((prop) => {
          if (
            prop.type === TSESTree.AST_NODE_TYPES.Property &&
            'value' in prop
          ) {
            return containsFunction(prop.value);
          }
          return false;
        });
      }

      if (node.type === TSESTree.AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some(
          (element) => element && containsFunction(element),
        );
      }

      return false;
    }

    function hasJSXWithFunction(node: TSESTree.Node): boolean {
      if (node.type === TSESTree.AST_NODE_TYPES.JSXElement) {
        return (node as TSESTree.JSXElement).openingElement.attributes.some((attr) => {
          if (attr.type === TSESTree.AST_NODE_TYPES.JSXAttribute && attr.value) {
            if (attr.value.type === TSESTree.AST_NODE_TYPES.JSXExpressionContainer) {
              return containsFunction(attr.value.expression);
            }
          }
          return false;
        });
      }

      return false;
    }

    function checkJSXAttribute(node: TSESTree.JSXAttribute) {
      if (
        !node.value ||
        node.value.type !== TSESTree.AST_NODE_TYPES.JSXExpressionContainer
      ) {
        return;
      }

      const { expression } = node.value;

      // Skip if the prop is already wrapped in useCallback or useMemo
      if (
        expression.type === TSESTree.AST_NODE_TYPES.CallExpression &&
        expression.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
        (expression.callee.name === 'useCallback' ||
          expression.callee.name === 'useMemo')
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

      // Check for objects/arrays/JSX elements containing functions
      if (
        (expression.type === TSESTree.AST_NODE_TYPES.ObjectExpression ||
          expression.type === TSESTree.AST_NODE_TYPES.ArrayExpression ||
          expression.type === TSESTree.AST_NODE_TYPES.JSXElement) &&
        (containsFunction(expression) || hasJSXWithFunction(expression))
      ) {
        // Skip reporting if this is a JSX element and we already reported an inline function
        if (expression.type === TSESTree.AST_NODE_TYPES.JSXElement && hasJSXWithFunction(expression)) {
          return;
        }
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
