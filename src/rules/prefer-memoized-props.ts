import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type BindingKind = 'function' | 'object' | 'array';

type ComponentState = {
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression;
  scopes: Map<string, BindingKind>[];
};

type MessageIds = 'memoizeReferenceProp' | 'avoidPrimitiveMemo';

const HOOK_NAMES = new Set(['useMemo', 'useCallback']);

export const preferMemoizedProps = createRule<[], MessageIds>({
  name: 'prefer-memoized-props',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require memoizing reference props (objects, arrays, functions) inside React.memo components while avoiding unnecessary useMemo for pass-through values.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      memoizeReferenceProp:
        'Prop "{{propName}}" in a React.memo component receives a {{kind}} that is recreated every render, so memoized children lose referential equality and re-render. Memoize this {{kind}} with useMemo/useCallback or hoist a stable constant so the prop reference stays stable.',
      avoidPrimitiveMemo:
        'useMemo around "{{value}}" only wraps a pass-through value. Primitives already compare by value, and wrapping existing references without creating new objects does not improve stability. Return the value directly instead of adding memoization noise.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.getSourceCode();
    const visitorKeys = sourceCode.visitorKeys;
    const memoizedNames = new Set<string>();
    const memoizedInlineFunctions = new WeakSet<
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
    >();
    const componentStack: ComponentState[] = [];
    const scopedFunctions = new WeakSet<TSESTree.Node>();

    function isReactMemoCallee(
      callee: TSESTree.LeftHandSideExpression,
    ): boolean {
      if (
        callee.type === AST_NODE_TYPES.Identifier &&
        callee.name === 'memo'
      ) {
        return true;
      }

      if (
        callee.type === AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'memo'
      ) {
        return true;
      }

      return false;
    }

    function isHookCall(node: TSESTree.CallExpression, name: string): boolean {
      if (
        node.callee.type === AST_NODE_TYPES.Identifier &&
        node.callee.name === name
      ) {
        return true;
      }

      return (
        node.callee.type === AST_NODE_TYPES.MemberExpression &&
        !node.callee.computed &&
        node.callee.property.type === AST_NODE_TYPES.Identifier &&
        node.callee.property.name === name
      );
    }

    function collectMemoizedComponents(node: TSESTree.Node): void {
      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        isReactMemoCallee(node.callee)
      ) {
        const [firstArg] = node.arguments;

        if (
          firstArg &&
          (firstArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            firstArg.type === AST_NODE_TYPES.FunctionExpression)
        ) {
          memoizedInlineFunctions.add(firstArg);
        }

        if (firstArg && firstArg.type === AST_NODE_TYPES.Identifier) {
          memoizedNames.add(firstArg.name);
        }
      }

      const keys = visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const value = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === 'object') {
              collectMemoizedComponents(child as TSESTree.Node);
            }
          }
        } else if (value && typeof value === 'object') {
          collectMemoizedComponents(value as TSESTree.Node);
        }
      }
    }

    collectMemoizedComponents(sourceCode.ast);

    function getFunctionName(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): string | null {
      if ('id' in node && node.id && node.id.type === AST_NODE_TYPES.Identifier) {
        return node.id.name;
      }

      if (
        node.parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        node.parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return node.parent.id.name;
      }

      return null;
    }

    function isMemoizedComponent(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): boolean {
      if (memoizedInlineFunctions.has(node)) {
        return true;
      }

      const name = getFunctionName(node);
      return Boolean(name && memoizedNames.has(name));
    }

    function pushComponent(node: ComponentState['node']): void {
      componentStack.push({ node, scopes: [new Map()] });
    }

    function popComponent(node: ComponentState['node']): void {
      const top = componentStack[componentStack.length - 1];
      if (top && top.node === node) {
        componentStack.pop();
      }
    }

    function currentComponent(): ComponentState | undefined {
      return componentStack[componentStack.length - 1];
    }

    function currentScope(): Map<string, BindingKind> | undefined {
      const component = currentComponent();
      if (!component) return undefined;
      return component.scopes[component.scopes.length - 1];
    }

    function pushScopeForNestedFunction(node: TSESTree.Node): void {
      const component = currentComponent();
      if (!component) return;
      component.scopes.push(new Map());
      scopedFunctions.add(node);
    }

    function popScopeForNestedFunction(node: TSESTree.Node): void {
      const component = currentComponent();
      if (!component) return;
      if (!scopedFunctions.has(node)) return;
      component.scopes.pop();
      scopedFunctions.delete(node);
    }

    function classifyInitializer(
      init: TSESTree.Expression | null,
    ): BindingKind | null {
      if (!init) {
        return null;
      }

      if (
        init.type === AST_NODE_TYPES.CallExpression &&
        ((init.callee.type === AST_NODE_TYPES.Identifier &&
          HOOK_NAMES.has(init.callee.name)) ||
          (init.callee.type === AST_NODE_TYPES.MemberExpression &&
            !init.callee.computed &&
            init.callee.property.type === AST_NODE_TYPES.Identifier &&
            HOOK_NAMES.has(init.callee.property.name)))
      ) {
        return null;
      }

      if (init.type === AST_NODE_TYPES.ObjectExpression) return 'object';
      if (init.type === AST_NODE_TYPES.ArrayExpression) return 'array';
      if (
        init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        init.type === AST_NODE_TYPES.FunctionExpression
      ) {
        return 'function';
      }

      return null;
    }

    function recordBinding(node: TSESTree.VariableDeclarator): void {
      const scope = currentScope();
      if (!scope) return;
      if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) {
        return;
      }

      const aliasKind =
        node.init.type === AST_NODE_TYPES.Identifier
          ? findBindingKind(node.init.name)
          : null;

      const kind = aliasKind ?? classifyInitializer(node.init);
      if (kind) scope.set(node.id.name, kind);
    }

    function findBindingKind(name: string): BindingKind | null {
      for (let i = componentStack.length - 1; i >= 0; i -= 1) {
        const component = componentStack[i];
        for (let j = component.scopes.length - 1; j >= 0; j -= 1) {
          const binding = component.scopes[j].get(name);
          if (binding) return binding;
        }
      }
      return null;
    }

    function getPropName(name: TSESTree.JSXAttribute['name']): string {
      if (name.type === AST_NODE_TYPES.JSXIdentifier) {
        return name.name;
      }

      if (name.type === AST_NODE_TYPES.JSXNamespacedName) {
        return name.name.name;
      }

      return 'prop';
    }

    function reportReference(
      node: TSESTree.Node,
      propName: string,
      kind: BindingKind,
    ): void {
      context.report({
        node,
        messageId: 'memoizeReferenceProp',
        data: { propName, kind },
      });
    }

    function isPassThroughPrimitive(
      expression: TSESTree.Expression,
    ): boolean {
      if (expression.type === AST_NODE_TYPES.Literal) return true;
      if (expression.type === AST_NODE_TYPES.TemplateLiteral) return true;

      if (expression.type === AST_NODE_TYPES.Identifier) return true;

      if (expression.type === AST_NODE_TYPES.MemberExpression) return true;

      if (
        expression.type === AST_NODE_TYPES.ChainExpression &&
        expression.expression.type === AST_NODE_TYPES.MemberExpression
      ) {
        return true;
      }

      return false;
    }

    function extractReturnExpression(
      callback:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression,
    ): TSESTree.Expression | null {
      if (callback.body.type !== AST_NODE_TYPES.BlockStatement) {
        return callback.body;
      }

      const [statement] = callback.body.body;
      if (
        statement &&
        statement.type === AST_NODE_TYPES.ReturnStatement &&
        statement.argument
      ) {
        return statement.argument;
      }

      return null;
    }

    function handleUseMemo(node: TSESTree.CallExpression): void {
      if (!currentComponent() || !isHookCall(node, 'useMemo')) {
        return;
      }

      const [callback] = node.arguments;
      if (
        !callback ||
        (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression)
      ) {
        return;
      }

      const returnExpression = extractReturnExpression(callback);
      if (!returnExpression) return;

      if (isPassThroughPrimitive(returnExpression)) {
        const valueText = sourceCode.getText(returnExpression).slice(0, 80);
        context.report({
          node,
          messageId: 'avoidPrimitiveMemo',
          data: { value: valueText },
        });
      }
    }

    function handleJSXAttribute(node: TSESTree.JSXAttribute): void {
      if (!currentComponent()) return;
      if (
        !node.value ||
        node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
      ) {
        return;
      }

      const { expression } = node.value;
      const propName = getPropName(node.name);

      if (expression.type === AST_NODE_TYPES.ObjectExpression) {
        reportReference(expression, propName, 'object');
        return;
      }

      if (expression.type === AST_NODE_TYPES.ArrayExpression) {
        reportReference(expression, propName, 'array');
        return;
      }

      if (
        expression.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        expression.type === AST_NODE_TYPES.FunctionExpression
      ) {
        reportReference(expression, propName, 'function');
        return;
      }

      if (expression.type === AST_NODE_TYPES.Identifier) {
        const bindingKind = findBindingKind(expression.name);
        if (bindingKind) {
          reportReference(expression, propName, bindingKind);
        }
      }
    }

    return {
      FunctionDeclaration(node) {
        if (isMemoizedComponent(node)) {
          pushComponent(node);
          return;
        }

        const scope = currentScope();
        if (scope && node.id?.type === AST_NODE_TYPES.Identifier) {
          scope.set(node.id.name, 'function');
        }

        if (currentComponent()) {
          pushScopeForNestedFunction(node);
        }
      },
      'FunctionDeclaration:exit'(node) {
        if (isMemoizedComponent(node)) {
          popComponent(node);
          return;
        }
        popScopeForNestedFunction(node);
      },
      FunctionExpression(node) {
        if (isMemoizedComponent(node)) {
          pushComponent(node);
          return;
        }
        if (currentComponent()) {
          pushScopeForNestedFunction(node);
        }
      },
      'FunctionExpression:exit'(node) {
        if (isMemoizedComponent(node)) {
          popComponent(node);
          return;
        }
        popScopeForNestedFunction(node);
      },
      ArrowFunctionExpression(node) {
        if (isMemoizedComponent(node)) {
          pushComponent(node);
          return;
        }
        if (currentComponent()) {
          pushScopeForNestedFunction(node);
        }
      },
      'ArrowFunctionExpression:exit'(node) {
        if (isMemoizedComponent(node)) {
          popComponent(node);
          return;
        }
        popScopeForNestedFunction(node);
      },
      VariableDeclarator: recordBinding,
      CallExpression: handleUseMemo,
      JSXAttribute: handleJSXAttribute,
    };
  },
});
