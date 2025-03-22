import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'memoizeObjectLiteral'
  | 'memoizeArrayLiteral'
  | 'memoizeFunctionLiteral'
  | 'memoizeCustomHookReturn';

export default createRule<[], MessageIds>({
  name: 'react-memoize-literals',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Detects object, array, and function literals created inside React component or hook bodies that will cause new reference creation on every render cycle. These should be either moved outside the component scope or memoized with useMemo/useCallback.',
      recommended: 'error',
    },
    messages: {
      memoizeObjectLiteral:
        'Object literals in component/hook body should be memoized with useMemo or moved outside the component to prevent new reference creation on every render',
      memoizeArrayLiteral:
        'Array literals in component/hook body should be memoized with useMemo or moved outside the component to prevent new reference creation on every render',
      memoizeFunctionLiteral:
        'Function literals in component/hook body should be memoized with useCallback to prevent new reference creation on every render',
      memoizeCustomHookReturn:
        'Object/array literals returned from custom hooks should be memoized with useMemo to maintain referential stability across renders',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // TODO: Replace context.getAncestors() with context.getAncestors() when upgrading to ESLint v9
    // Currently using context.getAncestors() which is deprecated but works with ESLint v8

    // Helper to check if we're inside a React component or hook
    function isReactComponentOrHook(): boolean {
      // Get all ancestors of the current node
      const ancestors = context.getAncestors();

      // Find the closest function declaration/expression
      const functionNode = ancestors.find(
        (ancestor) =>
          ancestor.type === TSESTree.AST_NODE_TYPES.FunctionDeclaration ||
          ancestor.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
          ancestor.type === TSESTree.AST_NODE_TYPES.FunctionExpression
      );

      if (!functionNode) return false;

      // Check if it's a React component (starts with uppercase) or a hook (starts with 'use')
      if (functionNode.type === TSESTree.AST_NODE_TYPES.FunctionDeclaration) {
        const name = functionNode.id?.name;
        return !!name && (/^[A-Z]/.test(name) || name.startsWith('use'));
      } else if (
        functionNode.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
        functionNode.type === TSESTree.AST_NODE_TYPES.FunctionExpression
      ) {
        // For arrow functions or function expressions, check the variable name if assigned to a variable
        const variableDeclarator = ancestors.find(
          (ancestor) => ancestor.type === TSESTree.AST_NODE_TYPES.VariableDeclarator
        ) as TSESTree.VariableDeclarator | undefined;

        if (variableDeclarator?.id.type === TSESTree.AST_NODE_TYPES.Identifier) {
          const name = variableDeclarator.id.name;
          return /^[A-Z]/.test(name) || name.startsWith('use');
        }
      }

      return false;
    }

    // Helper to check if a node is already wrapped in useMemo or useCallback
    function isAlreadyMemoized(): boolean {
      const ancestors = context.getAncestors();

      // Look for a CallExpression ancestor that is useMemo or useCallback
      return ancestors.some(
        (ancestor) =>
          ancestor.type === TSESTree.AST_NODE_TYPES.CallExpression &&
          ancestor.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
          (ancestor.callee.name === 'useMemo' || ancestor.callee.name === 'useCallback')
      );
    }

    // Helper to check if a node is a direct argument to a hook
    function isDirectHookArgument(node: TSESTree.Node): boolean {
      const parent = node.parent;

      if (
        parent?.type === TSESTree.AST_NODE_TYPES.CallExpression &&
        parent.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
        parent.callee.name.startsWith('use')
      ) {
        // It's a direct argument to a hook
        return true;
      }

      return false;
    }

    // Helper to check if a node is inside a hook argument but not at the top level
    function isNestedInHookArgument(node: TSESTree.Node): boolean {
      const ancestors = context.getAncestors();

      // Find if there's a hook call in the ancestors
      const hookCallIndex = ancestors.findIndex(
        (ancestor) =>
          ancestor.type === TSESTree.AST_NODE_TYPES.CallExpression &&
          ancestor.callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
          ancestor.callee.name.startsWith('use')
      );

      if (hookCallIndex === -1) return false;

      // If the node is a direct child of the hook call, it's not nested
      return ancestors[hookCallIndex].parent !== node.parent;
    }

    // Helper to check if a node is in a return statement of a custom hook
    function isInCustomHookReturn(): boolean {
      const ancestors = context.getAncestors();

      // Check if we're in a return statement
      const returnStmtIndex = ancestors.findIndex(
        (ancestor) => ancestor.type === TSESTree.AST_NODE_TYPES.ReturnStatement
      );

      if (returnStmtIndex === -1) return false;

      // Check if the return statement is inside a custom hook
      const functionNode = ancestors.find(
        (ancestor, index) =>
          index > returnStmtIndex &&
          (ancestor.type === TSESTree.AST_NODE_TYPES.FunctionDeclaration ||
           ancestor.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
           ancestor.type === TSESTree.AST_NODE_TYPES.FunctionExpression)
      );

      if (!functionNode) return false;

      // Check if it's a custom hook (starts with 'use')
      if (functionNode.type === TSESTree.AST_NODE_TYPES.FunctionDeclaration) {
        const name = functionNode.id?.name;
        return !!name && name.startsWith('use');
      } else if (
        functionNode.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
        functionNode.type === TSESTree.AST_NODE_TYPES.FunctionExpression
      ) {
        // For arrow functions or function expressions, check the variable name if assigned to a variable
        const variableDeclarator = ancestors.find(
          (ancestor, index) =>
            index > returnStmtIndex &&
            ancestor.type === TSESTree.AST_NODE_TYPES.VariableDeclarator
        ) as TSESTree.VariableDeclarator | undefined;

        if (variableDeclarator?.id.type === TSESTree.AST_NODE_TYPES.Identifier) {
          return variableDeclarator.id.name.startsWith('use');
        }
      }

      return false;
    }

    return {
      // Check for object literals
      ObjectExpression(node) {
        // Skip if not in a React component or hook
        if (!isReactComponentOrHook()) return;

        // Skip if already memoized
        if (isAlreadyMemoized()) return;

        // Skip if it's a direct argument to a hook (top-level)
        if (isDirectHookArgument(node)) return;

        // Check if it's in a custom hook return statement
        if (isInCustomHookReturn()) {
          context.report({
            node,
            messageId: 'memoizeCustomHookReturn',
          });
          return;
        }

        // Check if it's nested in a hook argument (not top-level)
        if (isNestedInHookArgument(node)) {
          context.report({
            node,
            messageId: 'memoizeObjectLiteral',
          });
          return;
        }

        // It's in a component/hook body but not in a hook argument
        context.report({
          node,
          messageId: 'memoizeObjectLiteral',
        });
      },

      // Check for array literals
      ArrayExpression(node) {
        // Skip if not in a React component or hook
        if (!isReactComponentOrHook()) return;

        // Skip if already memoized
        if (isAlreadyMemoized()) return;

        // Skip if it's a direct argument to a hook (top-level)
        if (isDirectHookArgument(node)) return;

        // Check if it's in a custom hook return statement
        if (isInCustomHookReturn()) {
          context.report({
            node,
            messageId: 'memoizeCustomHookReturn',
          });
          return;
        }

        // Check if it's nested in a hook argument (not top-level)
        if (isNestedInHookArgument(node)) {
          context.report({
            node,
            messageId: 'memoizeArrayLiteral',
          });
          return;
        }

        // It's in a component/hook body but not in a hook argument
        context.report({
          node,
          messageId: 'memoizeArrayLiteral',
        });
      },

      // Check for function literals
      ArrowFunctionExpression(node) {
        // Skip if not in a React component or hook
        if (!isReactComponentOrHook()) return;

        // Skip if already memoized
        if (isAlreadyMemoized()) return;

        // Skip if it's a direct argument to a hook (top-level)
        if (isDirectHookArgument(node)) return;

        // Check if it's in a custom hook return statement
        if (isInCustomHookReturn()) {
          context.report({
            node,
            messageId: 'memoizeCustomHookReturn',
          });
          return;
        }

        // Check if it's nested in a hook argument (not top-level)
        if (isNestedInHookArgument(node)) {
          context.report({
            node,
            messageId: 'memoizeFunctionLiteral',
          });
          return;
        }

        // Skip if it's a component definition (the main function)
        const ancestors = context.getAncestors();
        const isComponentDefinition = ancestors.length === 1 &&
          ancestors[0].type === TSESTree.AST_NODE_TYPES.Program;
        if (isComponentDefinition) return;

        // It's in a component/hook body but not in a hook argument
        context.report({
          node,
          messageId: 'memoizeFunctionLiteral',
        });
      },

      // Also check for function expressions
      FunctionExpression(node) {
        // Skip if not in a React component or hook
        if (!isReactComponentOrHook()) return;

        // Skip if already memoized
        if (isAlreadyMemoized()) return;

        // Skip if it's a direct argument to a hook (top-level)
        if (isDirectHookArgument(node)) return;

        // Check if it's in a custom hook return statement
        if (isInCustomHookReturn()) {
          context.report({
            node,
            messageId: 'memoizeCustomHookReturn',
          });
          return;
        }

        // Check if it's nested in a hook argument (not top-level)
        if (isNestedInHookArgument(node)) {
          context.report({
            node,
            messageId: 'memoizeFunctionLiteral',
          });
          return;
        }

        // Skip if it's a component definition (the main function)
        const ancestors = context.getAncestors();
        const isComponentDefinition = ancestors.length === 1 &&
          ancestors[0].type === TSESTree.AST_NODE_TYPES.Program;
        if (isComponentDefinition) return;

        // It's in a component/hook body but not in a hook argument
        context.report({
          node,
          messageId: 'memoizeFunctionLiteral',
        });
      },
    };
  },
});
