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
    let inTransaction = false;

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

    return {
      'CallExpression[callee.property.name="runTransaction"]'(node: TSESTree.CallExpression) {
        if (!isFirestoreTransaction(node)) return;

        const callback = node.arguments[0];
        if (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            callback.type === AST_NODE_TYPES.FunctionExpression) {
          inTransaction = true;
        }
      },

      'CallExpression[callee.property.name="runTransaction"]:exit'() {
        inTransaction = false;
      },

      NewExpression(node) {
        if (!inTransaction || !isNonTransactionalClass(node)) return;

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
