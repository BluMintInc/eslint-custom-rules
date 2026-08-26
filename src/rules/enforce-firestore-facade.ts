import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds =
  | 'noDirectGet'
  | 'noDirectSet'
  | 'noDirectUpdate'
  | 'noDirectDelete';

// The RealtimeDB role a binding carries: the database handle, a node reference
// obtained from it, or a reference reached through `child(...)`.
type RealtimeDbBinding = 'reference' | 'handle';
type RealtimeDbValue = RealtimeDbBinding | 'child';

const FIRESTORE_METHODS = new Set(['get', 'set', 'update', 'delete']);
const COLLECTION_CONSTRUCTORS = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);
const KNOWN_FIRESTORE_ROOTS = new Set(['db', 'firestore']);

// The modular client SDK. DocSetter/DocSetterTransaction wrap
// firebase-admin/firestore and cannot be imported from frontend code, so a
// client-SDK batch or transaction has no facade to route through and must not
// be reported.
const CLIENT_SDK_MODULES = new Set([
  'firebase/firestore',
  '@firebase/firestore',
  'firebase/firestore/lite',
]);
// firebase-admin/firestore exposes no `writeBatch` export at all (the admin
// API is `db.batch()`), so this spelling identifies the client SDK with
// certainty even when the binding's origin cannot be traced.
const CLIENT_BATCH_FACTORY = 'writeBatch';
// Shared spelling: the client SDK exports a free `runTransaction(db, cb)`
// while the admin SDK only exposes the `db.runTransaction(cb)` method, so the
// callee shape, not the name, decides which SDK a transaction belongs to.
const TRANSACTION_RUNNER = 'runTransaction';

// Realtime Database modules. DocSetter/DocSetterTransaction wrap Firestore and
// have no Realtime Database counterpart, so reporting a RealtimeDB receiver
// prescribes a remedy that cannot exist. Keying the carve-out on the import
// source rather than on the bare type name keeps an unrelated local type named
// `Reference` from silencing a genuine Firestore write.
const REALTIME_DB_MODULES = new Set([
  'firebase-admin/database',
  'firebase/database',
  '@firebase/database',
]);
// Exports of those modules that type a RealtimeDB node reference.
const REALTIME_DB_REFERENCE_TYPES = new Set(['Reference', 'ThenableReference']);
// Exports that type the database handle a reference is obtained from.
const REALTIME_DB_HANDLE_TYPES = new Set(['Database']);
// The modular accessor that returns a handle, so `getDatabase().ref(...)` is
// recognized without relying on the receiver being spelled `realtimeDb`.
const REALTIME_DB_HANDLE_FACTORIES = new Set(['getDatabase']);

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

// A TS-only wrapper changes the type of an expression, never the receiver it
// evaluates to, so every shape check has to look through one. Shared by both
// the Firestore and the RealtimeDB arms so the two cannot drift apart.
const unwrapTypeWrappers = (node: TSESTree.Node): TSESTree.Node => {
  switch (node.type) {
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return unwrapTypeWrappers(node.expression);
    default:
      return node;
  }
};

const getLeftmostIdentifier = (
  node: TSESTree.Node | null | undefined,
): TSESTree.Identifier | null => {
  let current: TSESTree.Node | null | undefined = node
    ? unwrapTypeWrappers(node)
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
    // Bindings holding a RealtimeDB `Database`, from which `.ref(...)` yields a
    // RealtimeDB reference regardless of how the handle is spelled.
    const realtimeDbHandleVariables = new Set<string>();
    // Local names of RealtimeDB type exports, so a binding is classified by its
    // declared type rather than by the receiver's spelling. Aliases
    // (`import type { Reference as RtdbRef }`) are carried by the local name.
    const realtimeDbReferenceTypeLocals = new Set<string>();
    const realtimeDbHandleTypeLocals = new Set<string>();
    // Namespace bindings for a RealtimeDB module (`import * as database`),
    // which put the same types behind a qualified name.
    const realtimeDbNamespaceLocals = new Set<string>();
    // Local names of value exports that return a handle (`getDatabase`).
    const realtimeDbHandleFactoryLocals = new Set<string>();
    const collectionObjectVariables = new Set<string>();
    const firestoreCollectionVariables = new Set<string>();
    const firestoreDocRefVariables = new Set<string>();
    const firestoreBatchVariables = new Set<string>();
    const firestoreTransactionVariables = new Set<string>();
    const docSetterVariables = new Set<string>();
    const batchManagerVariables = new Set<string>();
    // local name -> imported name, for bindings that come from the modular
    // client SDK (covers `import { writeBatch as wb }` aliases).
    const clientSdkImportedLocals = new Map<string, string>();
    // Namespace bindings for the client SDK (`import * as fs`).
    const clientSdkNamespaceLocals = new Set<string>();
    // Bindings that demonstrably come from some other module, so a local
    // helper named `writeBatch` is not mistaken for the SDK export.
    const nonClientImportedLocals = new Set<string>();
    // Batches/transactions proven to originate from the client SDK.
    const clientFirestoreVariables = new Set<string>();
    const sourceCode = context.sourceCode;

    const clearFirestoreTrackingFor = (name: string): void => {
      firestoreDocRefVariables.delete(name);
      firestoreCollectionVariables.delete(name);
      firestoreBatchVariables.delete(name);
      firestoreTransactionVariables.delete(name);
      docSetterVariables.delete(name);
      batchManagerVariables.delete(name);
      clientFirestoreVariables.delete(name);
    };

    const isClientSdkExportReference = (
      node: TSESTree.Node,
      exportName: string,
      allowUntracedSpelling: boolean,
    ): boolean => {
      const callee = unwrapTypeWrappers(node);

      if (isIdentifier(callee)) {
        if (clientSdkImportedLocals.get(callee.name) === exportName) {
          return true;
        }
        return (
          allowUntracedSpelling &&
          callee.name === exportName &&
          !nonClientImportedLocals.has(callee.name)
        );
      }

      if (
        isMemberExpression(callee) &&
        isIdentifier(callee.property) &&
        callee.property.name === exportName
      ) {
        const base = getLeftmostIdentifier(callee.object);
        return !!base && clientSdkNamespaceLocals.has(base.name);
      }

      return false;
    };

    // `writeBatch(firestore)` / `fs.writeBatch(firestore)` — client SDK only.
    const isClientBatchFactoryCall = (node: TSESTree.Node): boolean => {
      const candidate = unwrapTypeWrappers(node);
      return (
        isCallExpression(candidate) &&
        isClientSdkExportReference(candidate.callee, CLIENT_BATCH_FACTORY, true)
      );
    };

    // `runTransaction(firestore, cb)` — the free-function form only exists in
    // the client SDK. The name alone is not enough, because a project helper
    // could share it, so the binding must be traced back to the SDK.
    const isClientTransactionRunnerCall = (
      node: TSESTree.CallExpression,
    ): boolean =>
      isClientSdkExportReference(node.callee, TRANSACTION_RUNNER, false);

    const recordFirestoreVariable = (
      varName: string,
      expression: TSESTree.Expression,
    ): boolean => {
      const target = unwrapTypeWrappers(expression);

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

      if (isClientBatchFactoryCall(target)) {
        clientFirestoreVariables.add(varName);
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
        isFirestoreRoot(
          target.callee.object,
          firestoreCollectionVariables,
          firestoreDocRefVariables,
        )
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
      const candidate = unwrapTypeWrappers(node);
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
      const candidate = unwrapTypeWrappers(node);
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
      // A RealtimeDB binding declared elsewhere keeps its role: the write it
      // receives here has no Firestore facade to route through either way.
      if (registerRealtimeDbValue(varName, right)) return;
      recordFirestoreVariable(varName, right);
    };

    // A `null` imported name marks a namespace or default binding, which puts
    // the module's exports behind a qualifier.
    const recordRealtimeDbImport = (
      localName: string,
      importedName: string | null,
      source: string,
    ): void => {
      if (!REALTIME_DB_MODULES.has(source)) return;

      if (importedName === null) {
        realtimeDbNamespaceLocals.add(localName);
        return;
      }
      if (REALTIME_DB_REFERENCE_TYPES.has(importedName)) {
        realtimeDbReferenceTypeLocals.add(localName);
        return;
      }
      if (REALTIME_DB_HANDLE_TYPES.has(importedName)) {
        realtimeDbHandleTypeLocals.add(localName);
        return;
      }
      if (REALTIME_DB_HANDLE_FACTORIES.has(importedName)) {
        realtimeDbHandleFactoryLocals.add(localName);
      }
    };

    const recordImportBinding = (
      localName: string,
      importedName: string | null,
      source: string,
    ): void => {
      recordRealtimeDbImport(localName, importedName, source);

      if (!CLIENT_SDK_MODULES.has(source)) {
        nonClientImportedLocals.add(localName);
        return;
      }
      if (importedName === null) {
        clientSdkNamespaceLocals.add(localName);
        return;
      }
      clientSdkImportedLocals.set(localName, importedName);
    };

    const recordImportPattern = (
      pattern: TSESTree.Node,
      source: string,
    ): void => {
      if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
        for (const property of pattern.properties) {
          if (property.type !== AST_NODE_TYPES.Property) continue;
          if (!isIdentifier(property.key) || !isIdentifier(property.value)) {
            continue;
          }
          recordImportBinding(property.value.name, property.key.name, source);
        }
        return;
      }

      if (isIdentifier(pattern)) {
        recordImportBinding(pattern.name, null, source);
      }
    };

    const getImportExpressionSource = (node: TSESTree.Node): string | null => {
      const expression = unwrapTypeWrappers(node);
      if (expression.type !== AST_NODE_TYPES.ImportExpression) return null;
      const source = expression.source;
      return source.type === AST_NODE_TYPES.Literal &&
        typeof source.value === 'string'
        ? source.value
        : null;
    };

    const isPromiseAllCall = (
      node: TSESTree.Node,
    ): node is TSESTree.CallExpression =>
      isCallExpression(node) &&
      isMemberExpression(node.callee) &&
      isIdentifier(node.callee.object) &&
      node.callee.object.name === 'Promise' &&
      isIdentifier(node.callee.property) &&
      node.callee.property.name === 'all';

    // Frontend Firebase access is required to be dynamically imported, so
    // `await import(...)` — including the correlated `Promise.all` array form —
    // is the ordinary client-SDK call site rather than an edge case.
    const recordDynamicImportBindings = (
      node: TSESTree.VariableDeclarator,
    ): void => {
      const init = node.init;
      if (!init || init.type !== AST_NODE_TYPES.AwaitExpression) return;
      const awaited = unwrapTypeWrappers(init.argument);

      const directSource = getImportExpressionSource(awaited);
      if (directSource !== null) {
        recordImportPattern(node.id, directSource);
        return;
      }

      if (
        !isPromiseAllCall(awaited) ||
        node.id.type !== AST_NODE_TYPES.ArrayPattern
      ) {
        return;
      }

      const promises = awaited.arguments[0];
      if (!promises || promises.type !== AST_NODE_TYPES.ArrayExpression) return;

      node.id.elements.forEach((element, index) => {
        const promise = promises.elements[index];
        if (!element || !promise) return;
        const source = getImportExpressionSource(promise);
        if (source === null) return;
        recordImportPattern(element, source);
      });
    };

    const getCallbackFirstParam = (
      node: TSESTree.CallExpression,
    ): TSESTree.Identifier | null => {
      const callback = node.arguments.find(
        (argument) =>
          argument.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          argument.type === AST_NODE_TYPES.FunctionExpression,
      ) as
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | undefined;
      const param = callback?.params[0];
      return param && isIdentifier(param) ? param : null;
    };

    // Binds the transaction callback parameter to the SDK that produced it, so
    // classification rests on origin rather than on the parameter being
    // spelled `transaction`.
    const recordTransactionCallback = (node: TSESTree.CallExpression): void => {
      if (isClientTransactionRunnerCall(node)) {
        const param = getCallbackFirstParam(node);
        if (param) {
          clearFirestoreTrackingFor(param.name);
          clientFirestoreVariables.add(param.name);
        }
        return;
      }

      const callee = node.callee;
      if (
        !isMemberExpression(callee) ||
        !isIdentifier(callee.property) ||
        callee.property.name !== TRANSACTION_RUNNER ||
        !isFirestoreRoot(
          callee.object,
          firestoreCollectionVariables,
          firestoreDocRefVariables,
        )
      ) {
        return;
      }

      const param = getCallbackFirstParam(node);
      if (param && !clientFirestoreVariables.has(param.name)) {
        firestoreTransactionVariables.add(param.name);
      }
    };

    const classifyRealtimeDbTypeName = (
      typeName: TSESTree.Node,
    ): RealtimeDbBinding | null => {
      if (isIdentifier(typeName)) {
        if (realtimeDbReferenceTypeLocals.has(typeName.name)) {
          return 'reference';
        }
        return realtimeDbHandleTypeLocals.has(typeName.name) ? 'handle' : null;
      }

      if (typeName.type === AST_NODE_TYPES.TSQualifiedName) {
        const qualifier = getLeftmostIdentifier(typeName.left);
        if (!qualifier || !realtimeDbNamespaceLocals.has(qualifier.name)) {
          return null;
        }
        if (REALTIME_DB_REFERENCE_TYPES.has(typeName.right.name)) {
          return 'reference';
        }
        return REALTIME_DB_HANDLE_TYPES.has(typeName.right.name)
          ? 'handle'
          : null;
      }

      return null;
    };

    // `Reference | null` is the ordinary spelling for a ref held across calls,
    // so a union member carries the signal just as a bare annotation does.
    const classifyRealtimeDbType = (
      typeNode: TSESTree.Node,
    ): RealtimeDbBinding | null => {
      if (typeNode.type === AST_NODE_TYPES.TSTypeReference) {
        return classifyRealtimeDbTypeName(typeNode.typeName);
      }

      if (
        typeNode.type === AST_NODE_TYPES.TSUnionType ||
        typeNode.type === AST_NODE_TYPES.TSIntersectionType
      ) {
        for (const member of typeNode.types) {
          const kind = classifyRealtimeDbType(member);
          if (kind) return kind;
        }
      }

      return null;
    };

    // An assertion states the author's intent as plainly as an annotation, and
    // is the shape RealtimeDB refs take at call sites that narrow away `null`.
    const classifyRealtimeDbAssertion = (
      node: TSESTree.Node,
    ): RealtimeDbBinding | null => {
      let current = node;
      for (;;) {
        if (current.type === AST_NODE_TYPES.TSNonNullExpression) {
          current = current.expression;
          continue;
        }
        if (
          current.type === AST_NODE_TYPES.TSAsExpression ||
          current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
          current.type === AST_NODE_TYPES.TSTypeAssertion
        ) {
          const kind = classifyRealtimeDbType(current.typeAnnotation);
          if (kind) return kind;
          current = current.expression;
          continue;
        }
        return null;
      }
    };

    const registerRealtimeDbBinding = (
      name: string,
      kind: RealtimeDbBinding | null,
    ): boolean => {
      if (kind === 'reference') {
        realtimeDbRefVariables.add(name);
        return true;
      }
      if (kind === 'handle') {
        realtimeDbHandleVariables.add(name);
        return true;
      }
      return false;
    };

    const isRealtimeDbHandleFactoryCall = (node: TSESTree.Node): boolean => {
      const target = unwrapTypeWrappers(node);
      if (!isCallExpression(target)) return false;

      const callee = target.callee;
      if (isIdentifier(callee)) {
        return realtimeDbHandleFactoryLocals.has(callee.name);
      }

      return (
        isMemberExpression(callee) &&
        isIdentifier(callee.property) &&
        REALTIME_DB_HANDLE_FACTORIES.has(callee.property.name) &&
        isIdentifier(callee.object) &&
        realtimeDbNamespaceLocals.has(callee.object.name)
      );
    };

    const isRealtimeDbHandle = (node: TSESTree.Node): boolean => {
      if (classifyRealtimeDbAssertion(node) === 'handle') return true;
      if (isRealtimeDbHandleFactoryCall(node)) return true;

      const target = unwrapTypeWrappers(node);
      return (
        isIdentifier(target) &&
        (target.name.includes('realtimeDb') ||
          realtimeDbHandleVariables.has(target.name))
      );
    };

    const isRealtimeDbMethodCallOn = (
      node: TSESTree.Node,
      method: 'ref' | 'child',
      isRealtimeDbReceiver: (receiver: TSESTree.Node) => boolean,
    ): boolean => {
      const target = unwrapTypeWrappers(node);
      return (
        isCallExpression(target) &&
        isMemberExpression(target.callee) &&
        isIdentifier(target.callee.property) &&
        target.callee.property.name === method &&
        isRealtimeDbReceiver(target.callee.object)
      );
    };

    const isRealtimeDbReference = (node: TSESTree.Node): boolean => {
      if (classifyRealtimeDbAssertion(node) === 'reference') return true;

      const target = unwrapTypeWrappers(node);

      if (isIdentifier(target)) {
        return (
          realtimeDbRefVariables.has(target.name) ||
          realtimeDbChildVariables.has(target.name)
        );
      }

      return (
        isRealtimeDbMethodCallOn(target, 'ref', isRealtimeDbHandle) ||
        isRealtimeDbMethodCallOn(target, 'child', isRealtimeDbReference)
      );
    };

    // Returns the RealtimeDB role a value carries, so the two registration
    // sites (declarator init and later assignment) share one classification.
    const classifyRealtimeDbValue = (
      node: TSESTree.Node,
    ): RealtimeDbValue | null => {
      const asserted = classifyRealtimeDbAssertion(node);
      if (asserted) return asserted;
      if (isRealtimeDbHandleFactoryCall(node)) return 'handle';
      if (isRealtimeDbMethodCallOn(node, 'ref', isRealtimeDbHandle)) {
        return 'reference';
      }
      return isRealtimeDbMethodCallOn(node, 'child', isRealtimeDbReference)
        ? 'child'
        : null;
    };

    const registerRealtimeDbValue = (
      name: string,
      value: TSESTree.Node,
    ): boolean => {
      const kind = classifyRealtimeDbValue(value);
      if (kind === 'child') {
        realtimeDbChildVariables.add(name);
        return true;
      }
      return registerRealtimeDbBinding(name, kind);
    };

    const isRealtimeDbRefAssignment = (node: TSESTree.Node): boolean => {
      if (node.type !== AST_NODE_TYPES.VariableDeclarator) return false;
      if (!isIdentifier(node.id)) return false;

      const varName = node.id.name;

      // Registering from the annotation covers `let ref: Reference | null`,
      // where the RealtimeDB call arrives later as an assignment rather than as
      // this declarator's init.
      const annotation = node.id.typeAnnotation?.typeAnnotation;
      if (
        annotation &&
        registerRealtimeDbBinding(varName, classifyRealtimeDbType(annotation))
      ) {
        return true;
      }

      const init = node.init;
      return !!init && registerRealtimeDbValue(varName, init);
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
          clientFirestoreVariables.has(name) ||
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

      if (isRealtimeDbReference(object) || isClientBatchFactoryCall(object)) {
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
        const unwrapped = unwrapTypeWrappers(current);
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
      ImportDeclaration(node) {
        const source =
          typeof node.source.value === 'string' ? node.source.value : '';
        for (const specifier of node.specifiers) {
          if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
            recordImportBinding(
              specifier.local.name,
              specifier.imported.name,
              source,
            );
            continue;
          }
          recordImportBinding(specifier.local.name, null, source);
        }
      },
      // Parameters and other annotated bindings declare their RealtimeDB role
      // without ever holding a `ref(...)` call of their own.
      Identifier(node) {
        const annotation = node.typeAnnotation?.typeAnnotation;
        if (!annotation) return;
        registerRealtimeDbBinding(
          node.name,
          classifyRealtimeDbType(annotation),
        );
      },
      VariableDeclarator(node) {
        recordDynamicImportBindings(node);
        isRealtimeDbRefAssignment(node);
        isCollectionObjectAssignment(node);
        isFirestoreAssignment(node);
      },
      AssignmentExpression(node) {
        handleAssignmentExpression(node);
      },
      CallExpression(node) {
        recordTransactionCallback(node);

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
