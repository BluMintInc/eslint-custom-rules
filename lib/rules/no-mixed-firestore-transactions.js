"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMixedFirestoreTransactions = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const NON_TRANSACTIONAL_CLASSES = new Set([
    'DocSetter',
    'FirestoreDocFetcher',
    'FirestoreFetcher',
]);
const FETCHER_CLASSES = new Set(['FirestoreDocFetcher', 'FirestoreFetcher']);
exports.noMixedFirestoreTransactions = (0, createRule_1.createRule)({
    name: 'no-mixed-firestore-transactions',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent mixing transactional and non-transactional Firestore operations within a transaction',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noMixedTransactions: 'Non-transactional Firestore helper "{{ className }}" is instantiated inside a transaction callback, so its reads and writes bypass the transaction context. That breaks Firestore\'s atomicity guarantees and can commit partial updates. Use the transaction-safe "{{ transactionalClass }}" and pass the provided transaction so every operation participates in the same commit.',
            noMixedTransactionsFetcher: 'Non-transactional Firestore helper "{{ className }}" is instantiated inside a transaction callback, so its reads and writes bypass the transaction context. That breaks Firestore\'s atomicity guarantees and can commit partial updates. Pass the provided transaction to the constructor (e.g., new {{ className }}(ref, { transaction: tx })) or to fetch() (e.g., fetch({ transaction: tx })) so the operation participates in the transaction.',
        },
    },
    defaultOptions: [],
    create(context) {
        const transactionScopes = new Set();
        /**
         * Tracks fetcher lifetimes per transaction scope and binding name.
         * The outer map keys by the transaction scope node so nested transactions keep
         * independent state. Each scope maps variable names to an ordered list of
         * instances, preserving reassignment history. Arrays keep the latest instance
         * easy to read for fetch calls while still retaining older instances for
         * Program:exit validation, which must flag any overwritten fetcher that never
         * received a transaction.
         */
        const fetcherInstances = new Map();
        function getTransactionalClassName(className) {
            if (className === 'DocSetter')
                return 'DocSetterTransaction';
            return className;
        }
        function isFirestoreTransaction(node) {
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
                return false;
            const property = callee.property;
            return (property.type === utils_1.AST_NODE_TYPES.Identifier &&
                property.name === 'runTransaction');
        }
        function isNonTransactionalClass(node) {
            const callee = node.callee;
            if (callee.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            return NON_TRANSACTIONAL_CLASSES.has(callee.name);
        }
        function isTransactionParameter(param) {
            if (param.type !== utils_1.AST_NODE_TYPES.Identifier)
                return false;
            const typeAnnotation = param.typeAnnotation;
            if (!typeAnnotation ||
                typeAnnotation.type !== utils_1.AST_NODE_TYPES.TSTypeAnnotation)
                return false;
            const type = typeAnnotation.typeAnnotation;
            if (type.type !== utils_1.AST_NODE_TYPES.TSTypeReference)
                return false;
            const typeName = type.typeName;
            if (typeName.type !== utils_1.AST_NODE_TYPES.TSQualifiedName)
                return false;
            return (typeName.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                typeName.left.name === 'FirebaseFirestore' &&
                typeName.right.type === utils_1.AST_NODE_TYPES.Identifier &&
                typeName.right.name === 'Transaction');
        }
        function isFunctionLike(node) {
            return (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression);
        }
        function identifyTransactionScope(node) {
            if (transactionScopes.has(node)) {
                return node;
            }
            if (isFunctionLike(node) && node.params.some(isTransactionParameter)) {
                return node.body;
            }
            return null;
        }
        function getTransactionScopeChain(node) {
            const scopes = [];
            let current = node;
            while (current) {
                const scope = identifyTransactionScope(current);
                if (scope && scopes[scopes.length - 1] !== scope) {
                    scopes.push(scope);
                }
                current = current.parent;
            }
            return scopes;
        }
        function getTransactionScope(node) {
            return getTransactionScopeChain(node)[0] ?? null;
        }
        function getVariableName(node) {
            const parent = node.parent;
            if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                return parent.id.name;
            }
            if (parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression &&
                parent.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                return parent.left.name;
            }
            return null;
        }
        function isFetcherClass(className) {
            return FETCHER_CLASSES.has(className);
        }
        function isTransactionKey(key) {
            if (key.type === utils_1.AST_NODE_TYPES.Identifier) {
                return key.name === 'transaction';
            }
            if (key.type === utils_1.AST_NODE_TYPES.Literal) {
                return key.value === 'transaction';
            }
            if (key.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                return (key.expressions.length === 0 &&
                    key.quasis.length === 1 &&
                    key.quasis[0].value.cooked === 'transaction');
            }
            return false;
        }
        function isTransactionOptionObject(arg) {
            if (arg.type !== utils_1.AST_NODE_TYPES.ObjectExpression)
                return false;
            return arg.properties.some((property) => {
                if (property.type !== utils_1.AST_NODE_TYPES.Property) {
                    return false;
                }
                const key = property.key;
                return isTransactionKey(key);
            });
        }
        function hasTransactionOption(args) {
            return args.some(isTransactionOptionObject);
        }
        function getFetchCallContext(node) {
            const transactionScopesForCall = getTransactionScopeChain(node);
            const transactionScope = transactionScopesForCall[0];
            if (!transactionScope)
                return null;
            return {
                transactionScope,
                transactionScopesForCall,
                callHasTransaction: hasTransactionOption(node.arguments),
            };
        }
        function ensureFetcherScope(scope) {
            if (!fetcherInstances.has(scope)) {
                fetcherInstances.set(scope, new Map());
            }
            return fetcherInstances.get(scope);
        }
        function addFetcherInstance(scope, variableName, instance) {
            const scopeMap = ensureFetcherScope(scope);
            if (!scopeMap.has(variableName)) {
                scopeMap.set(variableName, []);
            }
            scopeMap.get(variableName).push(instance);
        }
        function findFetcherInstance(scopes, variableName) {
            for (const scope of scopes) {
                const scopeInstances = fetcherInstances.get(scope);
                const instances = scopeInstances?.get(variableName);
                if (instances?.length) {
                    return instances[instances.length - 1];
                }
            }
            return null;
        }
        /**
         * Determines whether a fetcher instance should be reported for mixed or unsafe
         * usage.
         *
         * Reporting occurs in three scenarios:
         * 1. The constructor lacks a transaction AND any call occurs without a transaction.
         * 2. The constructor lacks a transaction AND no calls occur at all (suspicious
         *    unused instance in a transaction scope).
         * 3. Constructor-level transactions make the instance always safe.
         *
         * If the constructor lacked a transaction but at least one call provided it, we
         * skip reporting because the caller opted into explicit transactional use.
         */
        function shouldReportFetcher(instance) {
            if (instance.constructorHasTransaction)
                return false;
            if (instance.hasCallWithoutTransaction)
                return true;
            if (instance.hasTransactionCall)
                return false;
            return true;
        }
        function isFetchCall(callee) {
            return (callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                callee.property.name === 'fetch');
        }
        function trackTransactionScope(node) {
            if (!isFirestoreTransaction(node))
                return;
            const callback = node.arguments[0];
            if (!callback)
                return;
            if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                transactionScopes.add(callback.body);
            }
        }
        function updateInstanceTransactionState(instance, callHasTransaction) {
            if (callHasTransaction || instance.constructorHasTransaction) {
                instance.hasTransactionCall =
                    instance.hasTransactionCall || callHasTransaction;
            }
            else {
                instance.hasCallWithoutTransaction = true;
            }
        }
        function handleIdentifierFetchCall(identifier, transactionScopesForCall, callHasTransaction) {
            const instance = findFetcherInstance(transactionScopesForCall, identifier.name);
            if (!instance)
                return;
            updateInstanceTransactionState(instance, callHasTransaction);
        }
        function isInlineFetcherNew(object) {
            return (object.type === utils_1.AST_NODE_TYPES.NewExpression &&
                object.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                isFetcherClass(object.callee.name));
        }
        function handleInlineNewFetchCall(object, callHasTransaction) {
            const constructorHasTransaction = hasTransactionOption(object.arguments);
            if (constructorHasTransaction || callHasTransaction) {
                return;
            }
            const className = object.callee.name;
            context.report({
                node: object,
                messageId: 'noMixedTransactionsFetcher',
                data: {
                    className,
                },
            });
        }
        function handleFetchCall(node, callee) {
            const contextForCall = getFetchCallContext(node);
            if (!contextForCall)
                return;
            const { transactionScopesForCall, callHasTransaction } = contextForCall;
            const object = callee.object;
            if (object.type === utils_1.AST_NODE_TYPES.Identifier) {
                handleIdentifierFetchCall(object, transactionScopesForCall, callHasTransaction);
            }
            else if (isInlineFetcherNew(object)) {
                handleInlineNewFetchCall(object, callHasTransaction);
            }
        }
        function reportNonFetcherInTransaction(node, className) {
            context.report({
                node,
                messageId: 'noMixedTransactions',
                data: {
                    className,
                    transactionalClass: getTransactionalClassName(className),
                },
            });
        }
        function isNewExpressionUsedForFetchCall(node) {
            return (node.parent?.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                node.parent.object === node &&
                isFetchCall(node.parent) &&
                node.parent.parent?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                node.parent.parent.callee === node.parent);
        }
        function handleFetcherWithoutVariable(node, className, constructorHasTransaction) {
            if (constructorHasTransaction)
                return;
            if (isNewExpressionUsedForFetchCall(node))
                return;
            context.report({
                node,
                messageId: 'noMixedTransactionsFetcher',
                data: {
                    className,
                },
            });
        }
        function handleFetcherWithVariable(node, className, constructorHasTransaction, variableName, transactionScope) {
            addFetcherInstance(transactionScope, variableName, {
                node,
                className,
                constructorHasTransaction,
                hasTransactionCall: constructorHasTransaction,
                hasCallWithoutTransaction: false,
            });
        }
        function handleFetcherClass(node, className, transactionScope) {
            const constructorHasTransaction = hasTransactionOption(node.arguments);
            const variableName = getVariableName(node);
            if (!variableName) {
                handleFetcherWithoutVariable(node, className, constructorHasTransaction);
                return;
            }
            handleFetcherWithVariable(node, className, constructorHasTransaction, variableName, transactionScope);
        }
        function handleNewExpression(node) {
            if (!isNonTransactionalClass(node))
                return;
            const transactionScope = getTransactionScope(node);
            if (!transactionScope)
                return;
            const className = node.callee.name;
            if (!isFetcherClass(className)) {
                reportNonFetcherInTransaction(node, className);
                return;
            }
            handleFetcherClass(node, className, transactionScope);
        }
        function reportFetcherInstance(instance) {
            if (!shouldReportFetcher(instance))
                return;
            context.report({
                node: instance.node,
                messageId: 'noMixedTransactionsFetcher',
                data: {
                    className: instance.className,
                },
            });
        }
        function reportFetcherInstances(instances) {
            for (const instance of instances) {
                reportFetcherInstance(instance);
            }
        }
        function reportFetcherScope(scope) {
            for (const instances of scope.values()) {
                reportFetcherInstances(instances);
            }
        }
        function reportAllFetcherScopes() {
            for (const scope of fetcherInstances.values()) {
                reportFetcherScope(scope);
            }
        }
        return {
            NewExpression: handleNewExpression,
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
                    return;
                }
                if (!isFetchCall(callee)) {
                    trackTransactionScope(node);
                    return;
                }
                handleFetchCall(node, callee);
            },
            'CallExpression[callee.property.name="runTransaction"]:exit'(node) {
                const callback = node.arguments[0];
                if (!callback)
                    return;
                if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                    callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                    transactionScopes.delete(callback.body);
                }
            },
            'Program:exit'() {
                reportAllFetcherScopes();
            },
        };
    },
});
//# sourceMappingURL=no-mixed-firestore-transactions.js.map