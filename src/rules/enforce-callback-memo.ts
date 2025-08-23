import { createRule } from '../utils/createRule';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';

type MessageIds = 'enforceCallback' | 'enforceMemo';

export default createRule<[], MessageIds>({
  name: 'enforce-callback-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce useCallback for inline functions and useMemo for objects/arrays containing functions in JSX props to prevent unnecessary re-renders. This improves React component performance by ensuring stable function references across renders and memoizing complex objects.',
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
        node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        node.type === AST_NODE_TYPES.FunctionExpression
      );
    }

    function isInsideUseCallback(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        // Check if we're inside a useCallback call
        if (
          current.type === AST_NODE_TYPES.CallExpression &&
          current.callee.type === AST_NODE_TYPES.Identifier &&
          current.callee.name === 'useCallback'
        ) {
          return true;
        }
        current = current.parent;
      }

      return false;
    }

    function getParentFunctionParams(node: TSESTree.Node): string[] {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          current.type === AST_NODE_TYPES.FunctionExpression
        ) {
          const params: string[] = [];
          current.params.forEach((param) => {
            if (param.type === AST_NODE_TYPES.Identifier) {
              params.push(param.name);
            } else if (param.type === AST_NODE_TYPES.ObjectPattern) {
              param.properties.forEach((prop) => {
                if (
                  prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier
                ) {
                  params.push(prop.key.name);
                }
              });
            }
          });
          return params;
        }
        current = current.parent;
      }

      return [];
    }

    function referencesParentScopeVariables(
      functionNode:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression,
      parentParams: string[],
    ): boolean {
      const referencedIdentifiers = new Set<string>();

      function collectIdentifiers(node: TSESTree.Node) {
        if (node.type === AST_NODE_TYPES.Identifier) {
          referencedIdentifiers.add(node.name);
        }

        // Recursively check child nodes
        for (const key in node) {
          if (key === 'parent') continue;
          const value = (node as any)[key];

          if (Array.isArray(value)) {
            value.forEach((child) => {
              if (child && typeof child === 'object' && 'type' in child) {
                collectIdentifiers(child as TSESTree.Node);
              }
            });
          } else if (value && typeof value === 'object' && 'type' in value) {
            collectIdentifiers(value as TSESTree.Node);
          }
        }
      }

      // Collect all identifiers referenced in the function body
      if (functionNode.body) {
        collectIdentifiers(functionNode.body);
      }

      // Check if any referenced identifier matches a parent parameter
      return parentParams.some((param) => referencedIdentifiers.has(param));
    }

    function containsFunction(node: TSESTree.Node): boolean {
      if (isFunction(node)) {
        return true;
      }

      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        return node.properties.some((prop) => {
          if (prop.type === AST_NODE_TYPES.Property && 'value' in prop) {
            return containsFunction(prop.value);
          }
          return false;
        });
      }

      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some(
          (element) => element && containsFunction(element),
        );
      }

      // Check ternary expressions (conditional expressions)
      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          containsFunction(node.consequent) || containsFunction(node.alternate)
        );
      }

      // Check logical expressions (&&, ||)
      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return containsFunction(node.left) || containsFunction(node.right);
      }

      return false;
    }

    function hasJSXWithFunction(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.JSXElement) {
        return node.openingElement.attributes.some((attr) => {
          if (attr.type === AST_NODE_TYPES.JSXAttribute && attr.value) {
            if (attr.value.type === AST_NODE_TYPES.JSXExpressionContainer) {
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
        node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
      ) {
        return;
      }

      const { expression } = node.value;

      // Skip if the prop is already wrapped in useCallback or useMemo
      if (
        expression.type === AST_NODE_TYPES.CallExpression &&
        expression.callee.type === AST_NODE_TYPES.Identifier &&
        (expression.callee.name === 'useCallback' ||
          expression.callee.name === 'useMemo')
      ) {
        return;
      }

      // Check for direct inline functions
      if (isFunction(expression)) {
        // Skip reporting if this callback is inside a useCallback and references parent scope variables
        const isInUseCallback = isInsideUseCallback(expression);
        const parentParams = getParentFunctionParams(expression);
        const referencesParentVars = referencesParentScopeVariables(
          expression,
          parentParams,
        );

        if (isInUseCallback && referencesParentVars) {
          // Skip reporting - this is a nested callback that needs access to parent scope
          return;
        }

        context.report({
          node,
          messageId: 'enforceCallback',
        });
        return;
      }

      // Check for ternary expressions and logical expressions containing functions
      if (
        (expression.type === AST_NODE_TYPES.ConditionalExpression ||
          expression.type === AST_NODE_TYPES.LogicalExpression) &&
        containsFunction(expression)
      ) {
        context.report({
          node,
          messageId: 'enforceCallback',
        });
        return;
      }

      // Check for objects/arrays/JSX elements containing functions
      if (
        (expression.type === AST_NODE_TYPES.ObjectExpression ||
          expression.type === AST_NODE_TYPES.ArrayExpression ||
          expression.type === AST_NODE_TYPES.JSXElement) &&
        (containsFunction(expression) || hasJSXWithFunction(expression))
      ) {
        // Skip reporting if this is a JSX element and we already reported an inline function
        if (
          expression.type === AST_NODE_TYPES.JSXElement &&
          hasJSXWithFunction(expression)
        ) {
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
