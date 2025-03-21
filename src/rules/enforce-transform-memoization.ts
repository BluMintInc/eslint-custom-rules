import { createRule } from '../utils/createRule';
import { TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'enforceTransformValueMemoization' | 'enforceTransformOnChangeMemoization';

export default createRule<[], MessageIds>({
  name: 'enforce-transform-memoization',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce proper memoization of transform functions in adaptValue component. The transformValue property should be wrapped with useMemo and transformOnChange should be wrapped with useCallback to prevent unnecessary re-renders.',
      recommended: 'error',
    },
    messages: {
      enforceTransformValueMemoization:
        'transformValue function in adaptValue should be wrapped with useMemo to prevent unnecessary re-renders. Instead of `transformValue: (value) => Boolean(value)`, use `transformValue: useMemo(() => (value) => Boolean(value), [])`.',
      enforceTransformOnChangeMemoization:
        'transformOnChange function in adaptValue should be wrapped with useCallback to prevent unnecessary re-renders. Instead of `transformOnChange: (event) => event.target.checked`, use `transformOnChange: useCallback((event) => event.target.checked, [])`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track reported nodes to avoid duplicate reports
    const reportedNodes = new Set<TSESTree.Node>();

    /**
     * Checks if a node is a function expression (arrow or regular)
     */
    function isFunction(
      node: TSESTree.Node,
    ): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
      return (
        node.type === TSESTree.AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === TSESTree.AST_NODE_TYPES.FunctionExpression
      );
    }

    /**
     * Checks if a node is a call to adaptValue function
     */
    function isAdaptValueCall(node: TSESTree.CallExpression): boolean {
      const { callee } = node;

      // Check for direct call: adaptValue({...}, Component)
      if (callee.type === TSESTree.AST_NODE_TYPES.Identifier && callee.name === 'adaptValue') {
        return true;
      }

      // Check for member expression call: someModule.adaptValue({...}, Component)
      if (
        callee.type === TSESTree.AST_NODE_TYPES.MemberExpression &&
        callee.property.type === TSESTree.AST_NODE_TYPES.Identifier &&
        callee.property.name === 'adaptValue'
      ) {
        return true;
      }

      return false;
    }

    /**
     * Checks if a node is properly wrapped in useMemo or useCallback
     */
    function isProperlyMemoized(node: TSESTree.Node, hookName: 'useMemo' | 'useCallback'): boolean {
      if (node.type !== TSESTree.AST_NODE_TYPES.CallExpression) {
        return false;
      }

      const { callee } = node;
      return (
        callee.type === TSESTree.AST_NODE_TYPES.Identifier &&
        callee.name === hookName
      );
    }

    /**
     * Checks if a node is a reference to an external variable (not an inline function)
     */
    function isExternalReference(node: TSESTree.Node): boolean {
      return node.type === TSESTree.AST_NODE_TYPES.Identifier;
    }

    /**
     * Check if a node is an object property access expression
     */
    function isPropertyAccess(node: TSESTree.Node): boolean {
      return node.type === TSESTree.AST_NODE_TYPES.MemberExpression;
    }

    /**
     * Report an issue with a node, avoiding duplicates
     */
    function reportIssue(node: TSESTree.Node, messageId: MessageIds) {
      // Only report if we haven't seen this node before
      if (!reportedNodes.has(node)) {
        reportedNodes.add(node);
        context.report({
          node,
          messageId,
        });
      }
    }

    /**
     * Check transform functions in an object
     */
    function checkTransformFunctions(properties: TSESTree.ObjectLiteralElement[]) {
      properties.forEach((prop) => {
        if (prop.type !== TSESTree.AST_NODE_TYPES.Property) {
          return;
        }

        const key = prop.key;
        if (key.type !== TSESTree.AST_NODE_TYPES.Identifier) {
          return;
        }

        // Check transformValue property
        if (key.name === 'transformValue') {
          const value = prop.value;

          // Skip if it's a reference to an external variable
          if (isExternalReference(value)) {
            return;
          }

          // Check if it's an inline function that's not properly memoized
          if (isFunction(value)) {
            reportIssue(prop, 'enforceTransformValueMemoization');
          } else if (!isProperlyMemoized(value, 'useMemo')) {
            // If it's not a function and not properly memoized, report it
            // This catches cases where the value might be a complex expression
            if (!isExternalReference(value)) {
              reportIssue(prop, 'enforceTransformValueMemoization');
            }
          }
        }

        // Check transformOnChange property
        if (key.name === 'transformOnChange') {
          const value = prop.value;

          // Skip if it's a reference to an external variable
          if (isExternalReference(value)) {
            return;
          }

          // Check if it's an inline function that's not properly memoized
          if (isFunction(value)) {
            reportIssue(prop, 'enforceTransformOnChangeMemoization');
          } else if (!isProperlyMemoized(value, 'useCallback')) {
            // If it's not a function and not properly memoized, report it
            if (!isExternalReference(value)) {
              reportIssue(prop, 'enforceTransformOnChangeMemoization');
            }
          }
        }
      });
    }

    /**
     * Process the adaptValue call and check transform functions
     */
    function checkAdaptValueCall(node: TSESTree.CallExpression) {
      // adaptValue should have at least one argument (the config object)
      if (node.arguments.length < 1) {
        return;
      }

      const configArg = node.arguments[0];

      // Handle direct object expression
      if (configArg.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
        checkTransformFunctions(configArg.properties);
        return;
      }

      // Handle property access (e.g., config.props)
      if (isPropertyAccess(configArg)) {
        // We need to trace back to find the object definition
        const scope = context.getScope();
        const references = scope.references;

        // Try to find the variable being referenced
        for (const ref of references) {
          const variable = ref.resolved;
          if (!variable || !variable.defs || variable.defs.length === 0) {
            continue;
          }

          // Check each definition
          for (const def of variable.defs) {
            if (def.node.type !== TSESTree.AST_NODE_TYPES.VariableDeclarator) {
              continue;
            }

            // If the variable is initialized with an object expression
            if (def.node.init && def.node.init.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
              // Check if this object has a 'props' property
              def.node.init.properties.forEach((prop) => {
                if (prop.type !== TSESTree.AST_NODE_TYPES.Property) {
                  return;
                }

                const key = prop.key;
                if (key.type === TSESTree.AST_NODE_TYPES.Identifier && key.name === 'props') {
                  if (prop.value.type === TSESTree.AST_NODE_TYPES.ObjectExpression) {
                    checkTransformFunctions(prop.value.properties);
                  }
                }
              });
            }
          }
        }
      }
    }

    return {
      CallExpression(node) {
        if (isAdaptValueCall(node)) {
          checkAdaptValueCall(node);
        }
      },
    };
  },
});
