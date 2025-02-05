import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noMixedTransactions';

const NON_TRANSACTIONAL_CLASSES = new Set([
  'DocSetter',
  'FirestoreDocFetcher',
  'FirestoreFetcher',
]);

export const noMixedFirestoreTransactions = createRule<[], MessageIds>({
  name: 'no-mixed-firestore-transactions',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent mixing transactional and non-transactional Firestore operations within a transaction',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noMixedTransactions: 'Do not use non-transactional Firestore operations ({{ className }}) inside a transaction. Use {{ transactionalClass }} instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const transactionScopes = new Set<TSESTree.Node>();

    function getTransactionalClassName(className: string): string {
      if (className === 'DocSetter') return 'DocSetterTransaction';
      if (className === 'FirestoreDocFetcher') return 'FirestoreDocFetcherTransaction';
      if (className === 'FirestoreFetcher') return 'FirestoreFetcherTransaction';
      return className;
    }

    function isFirestoreTransaction(node: TSESTree.CallExpression): boolean {
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;

      const property = callee.property;
      return property.type === AST_NODE_TYPES.Identifier && property.name === 'runTransaction';
    }

    function isNonTransactionalClass(node: TSESTree.NewExpression): boolean {
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) return false;
      return NON_TRANSACTIONAL_CLASSES.has(callee.name);
    }

    function isTransactionParameter(param: TSESTree.Parameter): boolean {
      if (param.type !== AST_NODE_TYPES.Identifier) return false;
      const typeAnnotation = param.typeAnnotation;
      if (!typeAnnotation || typeAnnotation.type !== AST_NODE_TYPES.TSTypeAnnotation) return false;
      const type = typeAnnotation.typeAnnotation;
      if (type.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const typeName = type.typeName;
      if (typeName.type !== AST_NODE_TYPES.TSQualifiedName) return false;
      return typeName.left.type === AST_NODE_TYPES.Identifier && typeName.left.name === 'FirebaseFirestore' &&
             typeName.right.type === AST_NODE_TYPES.Identifier && typeName.right.name === 'Transaction';
    }

    function isInTransactionScope(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      while (current) {
        if (transactionScopes.has(current)) {
          return true;
        }
        if (current.type === AST_NODE_TYPES.FunctionDeclaration ||
            current.type === AST_NODE_TYPES.FunctionExpression ||
            current.type === AST_NODE_TYPES.ArrowFunctionExpression) {
          const params = current.params;
          if (params.some(isTransactionParameter)) {
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    }

    return {
      'CallExpression[callee.property.name="runTransaction"]'(node: TSESTree.CallExpression) {
        if (!isFirestoreTransaction(node)) return;

        const callback = node.arguments[0];
        if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression) {
          transactionScopes.add(callback.body);
        }
      },

      'CallExpression[callee.property.name="runTransaction"]:exit'(node: TSESTree.CallExpression) {
        const callback = node.arguments[0];
        if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression) {
          transactionScopes.delete(callback.body);
        }
      },

      NewExpression(node) {
        if (!isInTransactionScope(node) || !isNonTransactionalClass(node)) return;

        const className = (node.callee as TSESTree.Identifier).name;
        context.report({
          node,
          messageId: 'noMixedTransactions',
          data: {
            className,
            transactionalClass: getTransactionalClassName(className),
          },
        });
      },
    };
  },
});
