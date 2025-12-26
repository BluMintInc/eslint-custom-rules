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
    const memoizedComponents = new WeakSet<
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
    >();
    const memoScopes: Map<
      string,
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
    >[] = [];
    const componentStack: ComponentState[] = [];
    const scopedFunctions = new WeakSet<TSESTree.Node>();

    function pushMemoScope(): void {
      memoScopes.push(new Map());
    }

    function popMemoScope(): void {
      memoScopes.pop();
    }

    function currentMemoScope():
      | Map<
          string,
          | TSESTree.FunctionDeclaration
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression
        >
      | undefined {
      return memoScopes[memoScopes.length - 1];
    }

    function declareFunctionBinding(
      name: string,
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): void {
      const scope = currentMemoScope();
      if (!scope) return;
      scope.set(name, node);
    }

    function resolveFunctionBinding(
      name: string,
    ):
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | undefined {
      for (let i = memoScopes.length - 1; i >= 0; i -= 1) {
        const binding = memoScopes[i].get(name);
        if (binding) {
          return binding;
        }
      }
      return undefined;
    }

    function hoistFunctionDeclarations(statements: TSESTree.Statement[]): void {
      const scope = currentMemoScope();
      if (!scope) return;
      for (const statement of statements) {
        if (
          statement.type === AST_NODE_TYPES.FunctionDeclaration &&
          statement.id?.type === AST_NODE_TYPES.Identifier
        ) {
          scope.set(statement.id.name, statement);
        }
      }
    }

    function registerFunctionVariable(node: TSESTree.VariableDeclarator): void {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;
      const { init } = node;
      if (
        init &&
        (init.type === AST_NODE_TYPES.FunctionExpression ||
          init.type === AST_NODE_TYPES.ArrowFunctionExpression)
      ) {
        declareFunctionBinding(node.id.name, init);
      }
    }

    function isReactMemoCallee(
      callee: TSESTree.LeftHandSideExpression,
    ): boolean {
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'memo') {
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
      pushMemoScope();
      if (node.type === AST_NODE_TYPES.Program) {
        hoistFunctionDeclarations(node.body);
      }

      function traverse(current: TSESTree.Node): void {
        const isFunctionLike =
          current.type === AST_NODE_TYPES.FunctionDeclaration ||
          current.type === AST_NODE_TYPES.FunctionExpression ||
          current.type === AST_NODE_TYPES.ArrowFunctionExpression;

        if (
          current.type === AST_NODE_TYPES.FunctionDeclaration &&
          current.id?.type === AST_NODE_TYPES.Identifier
        ) {
          declareFunctionBinding(current.id.name, current);
        }

        let pushedScope = false;
        if (current.type === AST_NODE_TYPES.BlockStatement || isFunctionLike) {
          pushMemoScope();
          pushedScope = true;

          if (
            isFunctionLike &&
            'id' in current &&
            current.id?.type === AST_NODE_TYPES.Identifier
          ) {
            declareFunctionBinding(current.id.name, current);
          }

          if (current.type === AST_NODE_TYPES.BlockStatement) {
            hoistFunctionDeclarations(current.body);
          } else if (
            isFunctionLike &&
            current.body.type === AST_NODE_TYPES.BlockStatement
          ) {
            hoistFunctionDeclarations(current.body.body);
          }
        }

        if (current.type === AST_NODE_TYPES.VariableDeclarator) {
          registerFunctionVariable(current);
        }

        if (
          current.type === AST_NODE_TYPES.CallExpression &&
          isReactMemoCallee(current.callee)
        ) {
          const [firstArg] = current.arguments;

          if (
            firstArg &&
            (firstArg.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              firstArg.type === AST_NODE_TYPES.FunctionExpression)
          ) {
            memoizedComponents.add(firstArg);
          } else if (firstArg && firstArg.type === AST_NODE_TYPES.Identifier) {
            const binding = resolveFunctionBinding(firstArg.name);
            if (binding) {
              memoizedComponents.add(binding);
            }
          }
        }

        const keys = visitorKeys[current.type] ?? [];
        for (const key of keys) {
          const value = (current as unknown as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            for (const child of value) {
              if (child && typeof child === 'object') {
                traverse(child as TSESTree.Node);
              }
            }
          } else if (value && typeof value === 'object') {
            traverse(value as TSESTree.Node);
          }
        }

        if (pushedScope) {
          popMemoScope();
        }
      }

      traverse(node);
      popMemoScope();
    }

    collectMemoizedComponents(sourceCode.ast);

    function isMemoizedComponent(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): boolean {
      return memoizedComponents.has(node);
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

    function unwrapExpression(
      expression: TSESTree.Expression,
    ): TSESTree.Expression {
      let current = expression;

      while (true) {
        if (
          current.type === AST_NODE_TYPES.TSAsExpression ||
          current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
          current.type === AST_NODE_TYPES.TSTypeAssertion
        ) {
          current = current.expression as TSESTree.Expression;
          continue;
        }

        if (current.type === AST_NODE_TYPES.TSNonNullExpression) {
          current = current.expression;
          continue;
        }

        break;
      }

      return current;
    }

    function getBindingKind(
      init: TSESTree.Expression | null,
    ): BindingKind | null {
      if (!init) {
        return null;
      }

      const unwrapped = unwrapExpression(init);

      if (
        unwrapped.type === AST_NODE_TYPES.CallExpression &&
        ((unwrapped.callee.type === AST_NODE_TYPES.Identifier &&
          HOOK_NAMES.has(unwrapped.callee.name)) ||
          (unwrapped.callee.type === AST_NODE_TYPES.MemberExpression &&
            !unwrapped.callee.computed &&
            unwrapped.callee.property.type === AST_NODE_TYPES.Identifier &&
            HOOK_NAMES.has(unwrapped.callee.property.name)))
      ) {
        return null;
      }

      if (unwrapped.type === AST_NODE_TYPES.ObjectExpression) return 'object';
      if (unwrapped.type === AST_NODE_TYPES.ArrayExpression) return 'array';
      if (
        unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        unwrapped.type === AST_NODE_TYPES.FunctionExpression
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

      const initializer = unwrapExpression(node.init);
      const aliasKind =
        initializer.type === AST_NODE_TYPES.Identifier
          ? findBindingKind(initializer.name)
          : null;

      const kind = aliasKind ?? getBindingKind(initializer);
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

    function getAttributeName(name: TSESTree.JSXAttribute['name']): string {
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

    function isEnvironmentFreeLiteral(
      expression: TSESTree.Expression,
    ): boolean {
      const unwrapped = unwrapExpression(expression);
      if (unwrapped.type === AST_NODE_TYPES.Literal) return true;
      if (
        unwrapped.type === AST_NODE_TYPES.TemplateLiteral &&
        unwrapped.expressions.length === 0
      ) {
        return true;
      }
      return false;
    }

    function isStableReference(expression: TSESTree.Expression): boolean {
      const unwrapped = unwrapExpression(expression);

      if (unwrapped.type === AST_NODE_TYPES.Literal) return true;
      if (unwrapped.type === AST_NODE_TYPES.TemplateLiteral) {
        return unwrapped.expressions.every((expr) => isStableReference(expr));
      }

      if (unwrapped.type === AST_NODE_TYPES.Identifier) return true;

      if (unwrapped.type === AST_NODE_TYPES.MemberExpression) return true;

      if (
        unwrapped.type === AST_NODE_TYPES.ChainExpression &&
        unwrapped.expression.type === AST_NODE_TYPES.MemberExpression
      ) {
        return true;
      }

      return false;
    }

    function extractReturnExpression(
      callback: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
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

      const [callback, deps] = node.arguments;
      if (
        !callback ||
        (callback.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
          callback.type !== AST_NODE_TYPES.FunctionExpression)
      ) {
        return;
      }

      const returnExpression = extractReturnExpression(callback);
      if (!returnExpression) return;

      const dependencies =
        deps && deps.type === AST_NODE_TYPES.ArrayExpression ? deps : null;

      if (
        dependencies &&
        dependencies.elements.length === 0 &&
        !isEnvironmentFreeLiteral(returnExpression)
      ) {
        return;
      }

      if (isStableReference(returnExpression)) {
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

      const rawExpression = node.value.expression;
      if (rawExpression.type === AST_NODE_TYPES.JSXEmptyExpression) {
        return;
      }

      const expression = unwrapExpression(rawExpression);
      const propName = getAttributeName(node.name);

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
