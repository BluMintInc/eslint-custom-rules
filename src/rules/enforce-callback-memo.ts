import { createRule } from '../utils/createRule';
import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import { ASTHelpers } from '../utils/ASTHelpers';

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

    // Matches both the bare hook (`useMemo(...)`, including the generic form
    // `useCallback<T>(...)`, whose callee is still an identifier) and the
    // namespaced form (`React.useMemo(...)`).
    function isHookCallee(callee: TSESTree.Node, hookName: string): boolean {
      if (callee.type === AST_NODE_TYPES.Identifier) {
        return callee.name === hookName;
      }

      return (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === hookName
      );
    }

    function isInsideUseCallback(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.CallExpression &&
          isHookCallee(current.callee, 'useCallback')
        ) {
          return true;
        }
        current = current.parent;
      }

      return false;
    }

    // A `useMemo` factory re-runs only when its dependencies change, so every
    // value it produces — including JSX and the inline handlers nested in that
    // JSX — is exactly as referentially stable as the memo itself. Demanding an
    // extra `useCallback` there buys nothing.
    //
    // `useCallback` deliberately gets no such treatment: it memoizes a function
    // that runs on every invocation, so the JSX it returns (and the inline
    // functions in it) is rebuilt each call and stays worth reporting.
    function isInsideUseMemoFactory(node: TSESTree.Node): boolean {
      let child: TSESTree.Node = node;
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (
          current.type === AST_NODE_TYPES.CallExpression &&
          isHookCallee(current.callee, 'useMemo') &&
          // Only the factory argument is memoized; the dependency array is not.
          current.arguments[0] === child
        ) {
          return true;
        }
        child = current;
        current = current.parent;
      }

      return false;
    }

    function collectBoundNames(param: TSESTree.Parameter, out: string[]) {
      if (param.type === AST_NODE_TYPES.Identifier) {
        out.push(param.name);
        return;
      }

      if (param.type === AST_NODE_TYPES.AssignmentPattern) {
        collectBoundNames(param.left as TSESTree.Parameter, out);
        return;
      }

      if (param.type === AST_NODE_TYPES.RestElement) {
        if (param.argument.type === AST_NODE_TYPES.Identifier) {
          out.push(param.argument.name);
        }
        return;
      }

      if (param.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of param.properties) {
          if (property.type === AST_NODE_TYPES.RestElement) {
            collectBoundNames(property as unknown as TSESTree.Parameter, out);
            continue;
          }
          if (property.type !== AST_NODE_TYPES.Property) continue;
          collectBoundNames(property.value as TSESTree.Parameter, out);
        }
        return;
      }

      if (param.type === AST_NODE_TYPES.ArrayPattern) {
        for (const element of param.elements) {
          if (element) collectBoundNames(element as TSESTree.Parameter, out);
        }
      }
    }

    function getParentFunctionParams(node: TSESTree.Node): string[] {
      let current: TSESTree.Node | undefined = node.parent;

      while (current) {
        if (isFunction(current)) {
          const params: string[] = [];
          for (const param of current.params) {
            collectBoundNames(param as TSESTree.Parameter, params);
          }
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
      const scopeManager = context.sourceCode.scopeManager;
      if (!scopeManager) return false;
      const scope = scopeManager.acquire(functionNode);
      if (!scope) return false;

      // "through" holds references that are not resolved within the function scope
      for (const ref of scope.through) {
        const { identifier } = ref;
        const parent = identifier.parent;
        const isPropertyKey =
          parent &&
          ((parent.type === AST_NODE_TYPES.MemberExpression &&
            !parent.computed &&
            parent.property === identifier) ||
            (parent.type === AST_NODE_TYPES.Property &&
              parent.key === identifier &&
              parent.kind === 'init'));

        if (isPropertyKey) {
          continue;
        }

        if (parentParams.includes(identifier.name)) {
          return true;
        }
      }

      return false;
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
          if (prop.type === AST_NODE_TYPES.SpreadElement) {
            return containsFunction(prop.argument as TSESTree.Node);
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
          } else if (
            attr.type === AST_NODE_TYPES.JSXSpreadAttribute &&
            attr.argument.type === AST_NODE_TYPES.ObjectExpression
          ) {
            // Only inspect literal objects to avoid heavy/static-unsafe analysis on identifiers.
            return containsFunction(attr.argument);
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

      // The only remediation this rule offers is a hook call, which is legal
      // solely inside a component or a hook. Module-scope JSX, a plain helper
      // that happens to build JSX, and JSX rendered from a test body are all
      // outside any render path, so wrapping there would throw
      // "Invalid hook call" while saving no re-render.
      //
      // The question the gate asks is RELATIVE — is a render function interposed
      // between this attribute and whatever encloses it further out — so a
      // component built by a plain factory (`function makeCard() { return
      // memo(() => <X onClick={...} />); }`) reports: the arrow handed to `memo`
      // IS the component, and `useCallback` is legal inside it no matter what
      // the factory is called.
      if (!ASTHelpers.isInsideComponentOrHook(node, context)) {
        return;
      }

      // Props of JSX built inside a useMemo factory inherit the memo's stability
      if (isInsideUseMemoFactory(node)) {
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
