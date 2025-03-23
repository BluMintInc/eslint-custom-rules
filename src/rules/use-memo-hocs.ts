import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

/**
 * This rule prevents Higher-Order Components (HOCs) from being created at the root level
 * of React components or hooks. HOCs that are directly created in a component body create
 * new component instances on every render, causing unnecessary re-renders, performance issues,
 * and potential bugs related to lost component state.
 */
export const useMemoHocs = createRule({
  name: 'use-memo-hocs',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce wrapping Higher-Order Components (HOCs) in useMemo to prevent unnecessary re-renders',
      recommended: 'error',
    },
    messages: {
      wrapInUseMemo:
        'HOCs should be wrapped in useMemo to prevent unnecessary re-renders and maintain component identity',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    /**
     * Checks if a function call is likely a HOC based on naming conventions
     * @param node The CallExpression node to check
     * @returns boolean indicating if the node is likely a HOC
     */
    function isHocCall(node: TSESTree.CallExpression): boolean {
      const { callee } = node;

      // Check for function calls with names starting with 'with'
      if (callee.type === 'Identifier' && callee.name.startsWith('with')) {
        return true;
      }

      // Check for common HOC patterns like connect(), memo(), etc.
      if (callee.type === 'Identifier' &&
          ['connect', 'memo', 'forwardRef', 'withRouter'].includes(callee.name)) {
        return true;
      }

      // Check for member expressions where the property starts with 'with'
      if (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier' &&
        callee.property.name.startsWith('with')
      ) {
        return true;
      }

      // Check for HOC patterns like connect(mapStateToProps)(Component)
      if (
        callee.type === 'CallExpression' &&
        callee.callee.type === 'Identifier' &&
        (callee.callee.name === 'connect' || callee.callee.name.startsWith('with'))
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if a node is inside a useMemo call
     * @param node The node to check
     * @returns boolean indicating if the node is inside a useMemo call
     */
    function isInsideUseMemo(node: TSESTree.Node): boolean {
      let current = node;
      let parent = node.parent;

      // Traverse up the AST to find a useMemo call
      while (parent) {
        if (
          parent.type === 'CallExpression' &&
          parent.callee.type === 'Identifier' &&
          parent.callee.name === 'useMemo'
        ) {
          return true;
        }

        // Check if we're inside an arrow function that's an argument to useMemo
        if (
          parent.type === 'ArrowFunctionExpression' &&
          parent.parent &&
          parent.parent.type === 'CallExpression' &&
          parent.parent.callee.type === 'Identifier' &&
          parent.parent.callee.name === 'useMemo'
        ) {
          return true;
        }

        current = parent;
        parent = current.parent;
      }

      return false;
    }

    /**
     * Checks if a node is inside an event handler or callback
     * @param node The node to check
     * @returns boolean indicating if the node is inside an event handler or callback
     */
    function isInsideEventHandlerOrCallback(node: TSESTree.Node): boolean {
      let current = node;
      let parent = node.parent;

      while (parent) {
        // Check if we're inside a function that's assigned to a variable with a name
        // that suggests it's an event handler or callback
        if (
          (parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') &&
          parent.parent &&
          parent.parent.type === 'VariableDeclarator' &&
          parent.parent.id.type === 'Identifier'
        ) {
          const functionName = parent.parent.id.name;
          if (
            functionName.startsWith('handle') ||
            functionName.startsWith('on') ||
            functionName.includes('Callback')
          ) {
            return true;
          }
        }

        // Check if we're inside a property with a name that suggests it's an event handler
        if (
          (parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') &&
          parent.parent &&
          parent.parent.type === 'Property' &&
          parent.parent.key.type === 'Identifier' &&
          (
            parent.parent.key.name.startsWith('handle') ||
            parent.parent.key.name.startsWith('on') ||
            parent.parent.key.name.includes('Callback') ||
            parent.parent.key.name === 'render' ||
            parent.parent.key.name.includes('render')
          )
        ) {
          return true;
        }

        // Check if we're inside a JSX attribute that's a function
        if (
          (parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') &&
          parent.parent &&
          parent.parent.type === 'JSXExpressionContainer' &&
          parent.parent.parent &&
          parent.parent.parent.type === 'JSXAttribute'
        ) {
          return true;
        }

        current = parent;
        parent = current.parent;
      }

      return false;
    }

    return {
      // Look for variable declarations that assign HOC calls
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          isHocCall(node.init) &&
          !isInsideUseMemo(node) &&
          !isInsideEventHandlerOrCallback(node)
        ) {
          // Check if we're in a function component or hook
          // TODO: Update to use sourceCode.getAncestors() when ESLint v9 is released
          const isInFunctionComponent = context
            .getAncestors()
            .some(
              (ancestor) =>
                ancestor.type === 'FunctionDeclaration' ||
                ancestor.type === 'ArrowFunctionExpression' ||
                ancestor.type === 'FunctionExpression'
            );

          if (isInFunctionComponent) {
            context.report({
              node: node.init,
              messageId: 'wrapInUseMemo',
            });
          }
        }
      },

      // Look for HOC calls directly in JSX
      JSXExpressionContainer(node) {
        if (
          node.expression.type === 'CallExpression' &&
          isHocCall(node.expression) &&
          !isInsideUseMemo(node) &&
          !isInsideEventHandlerOrCallback(node)
        ) {
          // Check if we're in a function component
          // TODO: Update to use sourceCode.getAncestors() when ESLint v9 is released
          const isInFunctionComponent = context
            .getAncestors()
            .some(
              (ancestor) =>
                ancestor.type === 'FunctionDeclaration' ||
                ancestor.type === 'ArrowFunctionExpression' ||
                ancestor.type === 'FunctionExpression'
            );

          if (isInFunctionComponent) {
            context.report({
              node: node.expression,
              messageId: 'wrapInUseMemo',
            });
          }
        }
      },
    };
  },
});
