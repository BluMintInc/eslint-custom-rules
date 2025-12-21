import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'noDirectGet'
  | 'noDirectSet'
  | 'noDirectUpdate'
  | 'noDirectDelete';

const FIRESTORE_METHODS = new Set(['get', 'set', 'update', 'delete']);
const COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);
const KNOWN_FIRESTORE_ROOTS = new Set(['db', 'firestore']);

const isMemberExpression = (
  node: TSESTree.Node,
): node is TSESTree.MemberExpression =>
  node.type === AST_NODE_TYPES.MemberExpression;

const isCallExpression = (
  node: TSESTree.Node,
): node is TSESTree.CallExpression =>
  node.type === AST_NODE_TYPES.CallExpression;

const isIdentifier = (node: TSESTree.Node): node is TSESTree.Identifier =>
  node.type === AST_NODE_TYPES.Identifier;

const unwrapTSAsExpression = (node: TSESTree.Node): TSESTree.Node => {
  if (node.type === AST_NODE_TYPES.TSAsExpression) {
    return unwrapTSAsExpression(node.expression);
  }
  return node;
};

const getLeftmostIdentifier = (
  node: TSESTree.Node | null | undefined,
): TSESTree.Identifier | null => {
  let current: TSESTree.Node | null | undefined = node
    ? unwrapTSAsExpression(node)
    : null;
  while (current) {
    if (isIdentifier(current)) {
      return current;
    }
    if (isMemberExpression(current)) {
      current = current.object;
      continue;
    }
    if (isCallExpression(current)) {
      current = current.callee;
      continue;
    }
    return null;
  }
  return null;
};

const isFirestoreRoot = (
  node: TSESTree.Node,
  firestoreCollectionVariables: Set<string>,
  firestoreDocRefVariables: Set<string>,
): boolean => {
  const baseIdentifier = getLeftmostIdentifier(node);
  if (baseIdentifier) {
    if (KNOWN_FIRESTORE_ROOTS.has(baseIdentifier.name)) {
      return true;
    }
    if (
      firestoreCollectionVariables.has(baseIdentifier.name) ||
      firestoreDocRefVariables.has(baseIdentifier.name)
    ) {
      return true;
    }
  }

  if (
    isCallExpression(node) &&
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property) &&
    node.callee.property.name === 'firestore'
  ) {
    const innerBase = getLeftmostIdentifier(node.callee.object);
    if (
      innerBase &&
      (innerBase.name === 'app' || KNOWN_FIRESTORE_ROOTS.has(innerBase.name))
    ) {
      return true;
    }
  }

  if (
    isMemberExpression(node) &&
    isIdentifier(node.property) &&
    node.property.name === 'firestore'
  ) {
    const innerBase = getLeftmostIdentifier(node.object);
    if (
      innerBase &&
      (innerBase.name === 'app' || KNOWN_FIRESTORE_ROOTS.has(innerBase.name))
    ) {
      return true;
    }
  }

  return false;
};

export const enforceFirestoreFacade = createRule<[], MessageIds>({
  name: 'enforce-firestore-facade',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce usage of Firestore facades instead of direct Firestore methods',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noDirectGet:
        'Direct Firestore "{{method}}" on {{target}} skips the Firestore fetcher facades that enforce typed deserialization, shared caching, and consistent error handling. Route reads through FirestoreFetcher or FirestoreDocFetcher so Firestore access stays observable and applies the shared safeguards.',
      noDirectSet:
        'Direct Firestore "{{method}}" on {{target}} bypasses DocSetter and DocSetterTransaction, which apply validation, merge semantics, and centralized retry/metrics. Send writes through DocSetter or DocSetterTransaction to keep Firestore writes consistent, auditable, and safer under load.',
      noDirectUpdate:
        'Direct Firestore "{{method}}" on {{target}} bypasses DocSetter and DocSetterTransaction, which guard partial updates with validation and shared retry/metrics. Use the setter facades for updates so field-level changes stay consistent with our Firestore write contract.',
      noDirectDelete:
        'Direct Firestore "{{method}}" on {{target}} bypasses DocSetter and DocSetterTransaction, which coordinate deletes with validation, retries, and any soft-delete policies. Perform deletes through the setter facades to avoid silent data loss and keep write telemetry intact.',
    },
  },
  defaultOptions: [],
  create(context) {
    const realtimeDbRefVariables = new Set<string>();
    const realtimeDbChildVariables = new Set<string>();
    const collectionObjectVariables = new Set<string>();
    const firestoreCollectionVariables = new Set<string>();
    const firestoreDocRefVariables = new Set<string>();
    const firestoreBatchVariables = new Set<string>();
    const firestoreTransactionVariables = new Set<string>();
    const docSetterVariables = new Set<string>();
    const batchManagerVariables = new Set<string>();
    const sourceCode = context.sourceCode;

    const clearFirestoreTrackingFor = (name: string): void => {
      firestoreDocRefVariables.delete(name);
      firestoreCollectionVariables.delete(name);
      firestoreBatchVariables.delete(name);
      firestoreTransactionVariables.delete(name);
      docSetterVariables.delete(name);
      batchManagerVariables.delete(name);
    };

    const recordFirestoreVariable = (
      varName: string,
      expression: TSESTree.Expression,
    ): boolean => {
      const target = unwrapTSAsExpression(expression);

      if (target.type === AST_NODE_TYPES.ConditionalExpression) {
        const matchedConsequent = recordFirestoreVariable(
          varName,
          target.consequent,
        );
        const matchedAlternate = recordFirestoreVariable(
          varName,
          target.alternate,
        );
        return matchedConsequent || matchedAlternate;
      }

      if (target.type === AST_NODE_TYPES.LogicalExpression) {
        return (
          recordFirestoreVariable(varName, target.left) ||
          recordFirestoreVariable(varName, target.right)
        );
      }

      if (target.type === AST_NODE_TYPES.SequenceExpression) {
        const last = target.expressions[target.expressions.length - 1];
        return last ? recordFirestoreVariable(varName, last) : false;
      }

      if (
        target.type === AST_NODE_TYPES.NewExpression &&
        isIdentifier(target.callee) &&
        (target.callee.name === 'DocSetter' ||
          target.callee.name === 'DocSetterTransaction')
      ) {
        docSetterVariables.add(varName);
        return true;
      }

      if (
        target.type === AST_NODE_TYPES.NewExpression &&
        isIdentifier(target.callee) &&
        target.callee.name === 'BatchManager'
      ) {
        batchManagerVariables.add(varName);
        return true;
      }

      if (isFirestoreDocumentReference(target)) {
        firestoreDocRefVariables.add(varName);
        return true;
      }

      if (isFirestoreCollectionCall(target)) {
        firestoreCollectionVariables.add(varName);
        return true;
      }

      if (
        target.type === AST_NODE_TYPES.CallExpression &&
        isMemberExpression(target.callee) &&
        isIdentifier(target.callee.property) &&
        target.callee.property.name === 'batch' &&
        isIdentifier(target.callee.object) &&
        target.callee.object.name === 'db'
      ) {
        firestoreBatchVariables.add(varName);
        return true;
      }

      if (
        target.type === AST_NODE_TYPES.Identifier &&
        (target.name === 'transaction' ||
          target.name === 'tx' ||
          target.name === 't')
      ) {
        firestoreTransactionVariables.add(varName);
        return true;
      }

      return false;
    };

    const isCollectionObjectAssignment = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

      const init = node.init;
      if (!init) return false;

      if (
        init.type === AST_NODE_TYPES.NewExpression &&
        isIdentifier(init.callee) &&
        COLLECTION_CONSTRUCTORS.has(init.callee.name) &&
        isIdentifier(node.id)
      ) {
        collectionObjectVariables.add(node.id.name);
        return true;
      }

      return false;
    };

    const isFirestoreCollectionCall = (node: TSESTree.Node): boolean => {
      const candidate = unwrapTSAsExpression(node);
      if (!isCallExpression(candidate)) return false;
      if (!isMemberExpression(candidate.callee)) return false;
      const property = candidate.callee.property;
      if (!isIdentifier(property) || property.name !== 'collection')
        return false;

      return isFirestoreRoot(
        candidate.callee.object,
        firestoreCollectionVariables,
        firestoreDocRefVariables,
      );
    };

    const isFirestoreDocumentReference = (node: TSESTree.Node): boolean => {
      const candidate = unwrapTSAsExpression(node);
      if (!isCallExpression(candidate)) return false;
      if (!isMemberExpression(candidate.callee)) return false;
      const docProperty = candidate.callee.property;
      if (!isIdentifier(docProperty) || docProperty.name !== 'doc')
        return false;

      const collectionCall = candidate.callee.object;
      if (!isFirestoreCollectionCall(collectionCall)) {
        return false;
      }

      return true;
    };

    const isFirestoreAssignment = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

      const init = node.init;
      if (!init || !isIdentifier(node.id)) return false;

      return recordFirestoreVariable(node.id.name, init);
    };

    const handleAssignmentExpression = (
      node: TSESTree.AssignmentExpression,
    ): void => {
      if (!isIdentifier(node.left)) return;

      const varName = node.left.name;
      const right = node.right;

      clearFirestoreTrackingFor(varName);
      recordFirestoreVariable(varName, right);
    };

    const isRealtimeDbRefAssignment = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;

      const init = node.init;
      if (!init) return false;

      if (
        init.type === AST_NODE_TYPES.CallExpression &&
        isMemberExpression(init.callee) &&
        isIdentifier(init.callee.property) &&
        init.callee.property.name === 'ref' &&
        isIdentifier(init.callee.object) &&
        (init.callee.object.name === 'realtimeDb' ||
          init.callee.object.name.includes('realtimeDb')) &&
        isIdentifier(node.id)
      ) {
        realtimeDbRefVariables.add(node.id.name);
        return true;
      }

      if (
        init.type === AST_NODE_TYPES.CallExpression &&
        isMemberExpression(init.callee) &&
        isIdentifier(init.callee.property) &&
        init.callee.property.name === 'child' &&
        isIdentifier(init.callee.object) &&
        realtimeDbRefVariables.has(init.callee.object.name) &&
        isIdentifier(node.id)
      ) {
        realtimeDbChildVariables.add(node.id.name);
        return true;
      }

      return false;
    };

    const isRealtimeDbReference = (node: TSESTree.Node): boolean => {
      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        isMemberExpression(node.callee) &&
        isIdentifier(node.callee.property) &&
        node.callee.property.name === 'ref' &&
        isIdentifier(node.callee.object) &&
        (node.callee.object.name === 'realtimeDb' ||
          node.callee.object.name.includes('realtimeDb'))
      ) {
        return true;
      }

      if (isIdentifier(node)) {
        return (
          realtimeDbRefVariables.has(node.name) ||
          realtimeDbChildVariables.has(node.name)
        );
      }

      if (
        node.type === AST_NODE_TYPES.CallExpression &&
        isMemberExpression(node.callee) &&
        isIdentifier(node.callee.property) &&
        node.callee.property.name === 'child' &&
        isIdentifier(node.callee.object) &&
        (realtimeDbRefVariables.has(node.callee.object.name) ||
          realtimeDbChildVariables.has(node.callee.object.name))
      ) {
        return true;
      }

      return false;
    };

    const isTrackedFirestoreName = (name: string): boolean =>
      firestoreDocRefVariables.has(name) ||
      firestoreBatchVariables.has(name) ||
      firestoreTransactionVariables.has(name) ||
      firestoreCollectionVariables.has(name);

    const isFirestoreMethodCall = (node: TSESTree.CallExpression): boolean => {
      if (!isMemberExpression(node.callee)) return false;
      const property = node.callee.property;
      if (!isIdentifier(property) || !FIRESTORE_METHODS.has(property.name)) {
        return false;
      }

      const object = node.callee.object;

      if (isIdentifier(object)) {
        const name = object.name;

        if (
          docSetterVariables.has(name) ||
          batchManagerVariables.has(name) ||
          realtimeDbRefVariables.has(name) ||
          realtimeDbChildVariables.has(name) ||
          collectionObjectVariables.has(name)
        ) {
          return false;
        }

        if (isTrackedFirestoreName(name)) {
          return true;
        }

        if (/^(batch|transaction)$/i.test(name)) {
          return true;
        }

        if (
          (name.toLowerCase().includes('doc') ||
            name.toLowerCase().includes('ref')) &&
          !name.includes('realtimeDb') &&
          !realtimeDbRefVariables.has(name) &&
          !realtimeDbChildVariables.has(name)
        ) {
          return true;
        }

        return false;
      }

      if (isRealtimeDbReference(object)) {
        return false;
      }

      if (isFirestoreDocumentReference(object)) {
        return true;
      }

      if (object.type === AST_NODE_TYPES.TSAsExpression) {
        return isFirestoreMethodCall({
          ...node,
          callee: {
            ...node.callee,
            object: object.expression,
          },
        } as TSESTree.CallExpression);
      }

      if (
        object.type === AST_NODE_TYPES.MemberExpression &&
        object.computed &&
        object.object.type === AST_NODE_TYPES.Identifier
      ) {
        const arrayName = object.object.name;
        if (
          isTrackedFirestoreName(arrayName) ||
          arrayName.toLowerCase().endsWith('refs')
        ) {
          return true;
        }
        return false;
      }

      if (isMemberExpression(object)) {
        let current: TSESTree.Node = object;
        while (isMemberExpression(current)) {
          if (
            isFirestoreDocumentReference(current) ||
            isFirestoreCollectionCall(current)
          ) {
            return true;
          }
          current = current.object;
        }
      }

      let current: TSESTree.Node | undefined = object;
      while (current) {
        const unwrapped = unwrapTSAsExpression(current);
        if (
          isCallExpression(unwrapped) &&
          isMemberExpression(unwrapped.callee) &&
          isIdentifier(unwrapped.callee.property)
        ) {
          const propName = unwrapped.callee.property.name;
          if (
            (propName === 'doc' || propName === 'collection') &&
            (isFirestoreCollectionCall(unwrapped) ||
              isFirestoreRoot(
                unwrapped.callee.object,
                firestoreCollectionVariables,
                firestoreDocRefVariables,
              ))
          ) {
            return true;
          }
          current = unwrapped.callee.object;
          continue;
        }

        if (isMemberExpression(unwrapped)) {
          current = unwrapped.object;
          continue;
        }

        break;
      }

      return false;
    };

    const reportDirectFirestoreCall = (
      messageId: MessageIds,
      node: TSESTree.CallExpression,
      method: string,
      callee: TSESTree.MemberExpression,
    ) => {
      const target = sourceCode.getText(callee.object);
      context.report({
        node,
        messageId,
        data: {
          method,
          target,
        },
      });
    };

    return {
      VariableDeclarator(node) {
        isRealtimeDbRefAssignment(node);
        isCollectionObjectAssignment(node);
        isFirestoreAssignment(node);
      },
      AssignmentExpression(node) {
        handleAssignmentExpression(node);
      },
      CallExpression(node) {
        if (!isFirestoreMethodCall(node)) return;

        const callee = node.callee;
        if (!isMemberExpression(callee)) return;
        const property = callee.property;
        if (!isIdentifier(property)) return;

        switch (property.name) {
          case 'get':
            reportDirectFirestoreCall(
              'noDirectGet',
              node,
              property.name,
              callee,
            );
            break;
          case 'set':
            reportDirectFirestoreCall(
              'noDirectSet',
              node,
              property.name,
              callee,
            );
            break;
          case 'update':
            reportDirectFirestoreCall(
              'noDirectUpdate',
              node,
              property.name,
              callee,
            );
            break;
          case 'delete':
            reportDirectFirestoreCall(
              'noDirectDelete',
              node,
              property.name,
              callee,
            );
            break;
        }
      },
    };
  },
});
