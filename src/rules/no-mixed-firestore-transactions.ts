import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMixedTransactions';

const NON_TRANSACTIONAL_CLASSES = new Set([
  'DocSetter',
  'FirestoreDocFetcher',
  'FirestoreFetcher',
]);

const FETCHER_CLASSES = new Set(['FirestoreDocFetcher', 'FirestoreFetcher']);

type FetcherInstance = {
  node: TSESTree.NewExpression;
  className: string;
  constructorHasTransaction: boolean;
  hasTransactionCall: boolean;
  hasCallWithoutTransaction: boolean;
};

export const noMixedFirestoreTransactions = createRule<[], MessageIds>({
  name: 'no-mixed-firestore-transactions',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent mixing transactional and non-transactional Firestore operations within a transaction',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMixedTransactions:
        'Do not use non-transactional Firestore operations ({{ className }}) inside a transaction. Use {{ transactionalClass }} instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const transactionScopes = new Set<TSESTree.Node>();
    const fetcherInstances = new Map<
      TSESTree.Node,
      Map<string, FetcherInstance[]>
    >();

    function getTransactionalClassName(className: string): string {
      if (className === 'DocSetter') return 'DocSetterTransaction';
      if (className === 'FirestoreDocFetcher')
        return 'FirestoreDocFetcherTransaction';
      if (className === 'FirestoreFetcher')
        return 'FirestoreFetcherTransaction';
      return className;
    }

    function isFirestoreTransaction(node: TSESTree.CallExpression): boolean {
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;

      const property = callee.property;
      return (
        property.type === AST_NODE_TYPES.Identifier &&
        property.name === 'runTransaction'
      );
    }

    function isNonTransactionalClass(node: TSESTree.NewExpression): boolean {
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) return false;
      return NON_TRANSACTIONAL_CLASSES.has(callee.name);
    }

    function isTransactionParameter(param: TSESTree.Parameter): boolean {
      if (param.type !== AST_NODE_TYPES.Identifier) return false;
      const typeAnnotation = param.typeAnnotation;
      if (
        !typeAnnotation ||
        typeAnnotation.type !== AST_NODE_TYPES.TSTypeAnnotation
      )
        return false;
      const type = typeAnnotation.typeAnnotation;
      if (type.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const typeName = type.typeName;
      if (typeName.type !== AST_NODE_TYPES.TSQualifiedName) return false;
      return (
        typeName.left.type === AST_NODE_TYPES.Identifier &&
        typeName.left.name === 'FirebaseFirestore' &&
        typeName.right.type === AST_NODE_TYPES.Identifier &&
        typeName.right.name === 'Transaction'
      );
    }

    function isFunctionLike(
      node: TSESTree.Node,
    ): node is
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression {
      return (
        node.type === AST_NODE_TYPES.FunctionDeclaration ||
        node.type === AST_NODE_TYPES.FunctionExpression ||
        node.type === AST_NODE_TYPES.ArrowFunctionExpression
      );
    }

    function getTransactionScopeChain(node: TSESTree.Node): TSESTree.Node[] {
      const scopes: TSESTree.Node[] = [];
      let current: TSESTree.Node | undefined = node;
      while (current) {
        let scope: TSESTree.Node | null = null;
        if (transactionScopes.has(current)) {
          scope = current;
        }

        if (isFunctionLike(current) && current.params.some(isTransactionParameter)) {
          scope = current.body ?? current;
        }

        if (scope && scopes[scopes.length - 1] !== scope) {
          scopes.push(scope);
        }

        current = current.parent;
      }
      return scopes;
    }

    function getTransactionScope(node: TSESTree.Node): TSESTree.Node | null {
      return getTransactionScopeChain(node)[0] ?? null;
    }

    function getVariableName(node: TSESTree.NewExpression): string | null {
      const parent = node.parent;
      if (
        parent?.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.id.name;
      }

      if (
        parent?.type === AST_NODE_TYPES.AssignmentExpression &&
        parent.left.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.left.name;
      }

      return null;
    }

    function isFetcherClass(className: string): boolean {
      return FETCHER_CLASSES.has(className);
    }

    function isTransactionOptionObject(
      arg: TSESTree.CallExpressionArgument,
    ): arg is TSESTree.ObjectExpression {
      if (arg.type !== AST_NODE_TYPES.ObjectExpression) return false;

      return arg.properties.some((property) => {
        if (property.type !== AST_NODE_TYPES.Property || property.computed) {
          return false;
        }

        const key = property.key;

        return (
          (key.type === AST_NODE_TYPES.Identifier && key.name === 'transaction') ||
          (key.type === AST_NODE_TYPES.Literal && key.value === 'transaction')
        );
      });
    }

    function hasTransactionOption(
      args: TSESTree.CallExpressionArgument[],
    ): boolean {
      return args.some(isTransactionOptionObject);
    }

    function ensureFetcherScope(
      scope: TSESTree.Node,
    ): Map<string, FetcherInstance[]> {
      if (!fetcherInstances.has(scope)) {
        fetcherInstances.set(scope, new Map());
      }

      return fetcherInstances.get(scope)!;
    }

    function addFetcherInstance(
      scope: TSESTree.Node,
      variableName: string,
      instance: FetcherInstance,
    ): void {
      const scopeMap = ensureFetcherScope(scope);
      if (!scopeMap.has(variableName)) {
        scopeMap.set(variableName, []);
      }
      scopeMap.get(variableName)!.push(instance);
    }

    function findFetcherInstance(
      scopes: TSESTree.Node[],
      variableName: string,
    ): FetcherInstance | null {
      for (const scope of scopes) {
        const scopeInstances = fetcherInstances.get(scope);
        const instances = scopeInstances?.get(variableName);
        if (instances?.length) {
          return instances[instances.length - 1];
        }
      }
      return null;
    }

    function shouldReportFetcher(instance: FetcherInstance): boolean {
      if (instance.constructorHasTransaction) return false;
      if (instance.hasCallWithoutTransaction) return true;
      if (instance.hasTransactionCall) return false;
      return true;
    }

    function isFetchCall(callee: TSESTree.MemberExpression): boolean {
      return (
        callee.property.type === AST_NODE_TYPES.Identifier &&
        callee.property.name === 'fetch'
      );
    }

    function trackTransactionScope(node: TSESTree.CallExpression): void {
      if (!isFirestoreTransaction(node)) return;
      const callback = node.arguments[0];
      if (
        callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === AST_NODE_TYPES.FunctionExpression
      ) {
        transactionScopes.add(callback.body);
      }
    }

    function handleIdentifierFetchCall(
      identifier: TSESTree.Identifier,
      transactionScopesForCall: TSESTree.Node[],
      callHasTransaction: boolean,
    ): void {
      const instance = findFetcherInstance(transactionScopesForCall, identifier.name);
      if (!instance) return;

      if (callHasTransaction || instance.constructorHasTransaction) {
        instance.hasTransactionCall =
          instance.hasTransactionCall || callHasTransaction;
      } else {
        instance.hasCallWithoutTransaction = true;
      }
    }

    function handleInlineNewFetchCall(
      object: TSESTree.NewExpression,
      callHasTransaction: boolean,
    ): void {
      const constructorHasTransaction = hasTransactionOption(object.arguments);

      if (constructorHasTransaction || callHasTransaction) {
        return;
      }

      const className = (object.callee as TSESTree.Identifier).name;
      context.report({
        node: object,
        messageId: 'noMixedTransactions',
        data: {
          className,
          transactionalClass: getTransactionalClassName(className),
        },
      });
    }

    function handleFetchCall(
      node: TSESTree.CallExpression,
      callee: TSESTree.MemberExpression,
    ): void {
      const transactionScopesForCall = getTransactionScopeChain(node);
      const transactionScope = transactionScopesForCall[0];
      if (!transactionScope) return;

      const callHasTransaction = hasTransactionOption(node.arguments);
      const object = callee.object;

      if (object.type === AST_NODE_TYPES.Identifier) {
        handleIdentifierFetchCall(object, transactionScopesForCall, callHasTransaction);
      } else if (
        object.type === AST_NODE_TYPES.NewExpression &&
        object.callee.type === AST_NODE_TYPES.Identifier &&
        isFetcherClass(object.callee.name)
      ) {
        handleInlineNewFetchCall(object, callHasTransaction);
      }
    }

    function reportNonFetcherInTransaction(
      node: TSESTree.NewExpression,
      className: string,
    ): void {
      context.report({
        node,
        messageId: 'noMixedTransactions',
        data: {
          className,
          transactionalClass: getTransactionalClassName(className),
        },
      });
    }

    function isNewExpressionUsedForFetchCall(node: TSESTree.NewExpression): boolean {
      return (
        node.parent?.type === AST_NODE_TYPES.MemberExpression &&
        node.parent.object === node &&
        isFetchCall(node.parent) &&
        node.parent.parent?.type === AST_NODE_TYPES.CallExpression
      );
    }

    function handleFetcherWithoutVariable(
      node: TSESTree.NewExpression,
      className: string,
      constructorHasTransaction: boolean,
    ): void {
      if (constructorHasTransaction) return;
      if (isNewExpressionUsedForFetchCall(node)) return;

      reportNonFetcherInTransaction(node, className);
    }

    function handleFetcherWithVariable(
      node: TSESTree.NewExpression,
      className: string,
      constructorHasTransaction: boolean,
      variableName: string,
      transactionScope: TSESTree.Node,
    ): void {
      addFetcherInstance(transactionScope, variableName, {
        node,
        className,
        constructorHasTransaction,
        hasTransactionCall: constructorHasTransaction,
        hasCallWithoutTransaction: false,
      });
    }

    function handleFetcherClass(
      node: TSESTree.NewExpression,
      className: string,
      transactionScope: TSESTree.Node,
    ): void {
      const constructorHasTransaction = hasTransactionOption(node.arguments);
      const variableName = getVariableName(node);

      if (!variableName) {
        handleFetcherWithoutVariable(node, className, constructorHasTransaction);
        return;
      }

      handleFetcherWithVariable(
        node,
        className,
        constructorHasTransaction,
        variableName,
        transactionScope,
      );
    }

    function handleNewExpression(node: TSESTree.NewExpression): void {
      if (!isNonTransactionalClass(node)) return;

      const transactionScope = getTransactionScope(node);
      if (!transactionScope) return;

      const className = (node.callee as TSESTree.Identifier).name;

      if (!isFetcherClass(className)) {
        reportNonFetcherInTransaction(node, className);
        return;
      }

      handleFetcherClass(node, className, transactionScope);
    }

    return {
      NewExpression: handleNewExpression,

      CallExpression(node) {
        const callee = node.callee;

        if (callee.type !== AST_NODE_TYPES.MemberExpression) {
          return;
        }

        if (!isFetchCall(callee)) {
          trackTransactionScope(node);
          return;
        }

        handleFetchCall(node, callee);
      },

      'CallExpression[callee.property.name="runTransaction"]:exit'(
        node: TSESTree.CallExpression,
      ) {
        const callback = node.arguments[0];
        if (
          callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          callback.type === AST_NODE_TYPES.FunctionExpression
        ) {
          transactionScopes.delete(callback.body);
        }
      },

      'Program:exit'() {
        for (const scope of fetcherInstances.values()) {
          for (const instances of scope.values()) {
            for (const instance of instances) {
              if (!shouldReportFetcher(instance)) continue;

              context.report({
                node: instance.node,
                messageId: 'noMixedTransactions',
                data: {
                  className: instance.className,
                  transactionalClass: getTransactionalClassName(
                    instance.className,
                  ),
                },
              });
            }
          }
        }
      },
    };
  },
});
