"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noAsyncForEach = void 0;
const utils_1 = require("@typescript-eslint/utils");
const getNodeStart = (node) => node?.range?.[0] ?? Number.POSITIVE_INFINITY;
const getFunctionDescription = (node, fallbackName) => {
    const declaredName = (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
        node.id?.name
        ? node.id.name
        : null;
    const isArrowFunction = node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression;
    const functionName = declaredName ?? (isArrowFunction ? undefined : fallbackName);
    if (functionName) {
        return `function "${functionName}"`;
    }
    if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        return fallbackName ? `arrow function "${fallbackName}"` : 'arrow function';
    }
    return 'function expression';
};
const findVariableInScope = (scope, name) => {
    let currentScope = scope;
    while (currentScope) {
        const variable = currentScope.set.get(name);
        if (variable) {
            return variable;
        }
        currentScope = currentScope.upper;
    }
    return null;
};
/**
 * Function declarations are hoisted across their scope regardless of source order.
 * Returning NEGATIVE_INFINITY makes hoisted declarations always "earlier" than any
 * callback usage when we compare source positions.
 */
const getDefinitionStart = (definition) => definition.node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration
    ? Number.NEGATIVE_INFINITY
    : getNodeStart(definition.node);
const getReferenceStart = (reference) => getNodeStart(reference.identifier);
const isWriteReference = (reference) => typeof reference.isWrite === 'function'
    ? reference.isWrite()
    : Boolean(reference.isWrite);
const isAsyncFunctionExpression = (node) => {
    if (!node || typeof node !== 'object') {
        return false;
    }
    const typedNode = node;
    return ((typedNode.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        typedNode.type === utils_1.AST_NODE_TYPES.FunctionExpression) &&
        typedNode.async === true);
};
/**
 * Checks if context has direct sourceCode property
 */
const hasSourceCodeProperty = (context) => {
    return 'sourceCode' in context && !!context.sourceCode;
};
/**
 * Checks if context has getSourceCode method
 */
const hasGetSourceCodeMethod = (context) => {
    return ('getSourceCode' in context && typeof context.getSourceCode === 'function');
};
/**
 * Retrieves source code from an ESLint rule context
 */
const getSourceCode = (context) => {
    if (hasSourceCodeProperty(context)) {
        return context.sourceCode;
    }
    if (hasGetSourceCodeMethod(context)) {
        return context.getSourceCode();
    }
    throw new Error(`Unable to retrieve source code from context in rule "no-async-foreach". ` +
        `File: ${context.filename ??
            context.getFilename?.() ??
            'unknown'}. ` +
        `Available properties: sourceCode=${typeof context
            .sourceCode}, ` +
        `getSourceCode=${typeof context.getSourceCode}.`);
};
const getScope = (context, sourceCode, node) => {
    const typedSourceCode = sourceCode;
    return typedSourceCode.getScope?.(node) ?? context.getScope?.() ?? null;
};
const analyzeInlineCallback = (callback) => {
    if (!callback.async) {
        return null;
    }
    return {
        callbackLabel: getFunctionDescription(callback),
    };
};
const getAsyncFunctionDeclarationInfo = (definition, callbackName) => {
    if (definition.node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
        definition.node.async) {
        return {
            callbackLabel: getFunctionDescription(definition.node, definition.node.id?.name ?? callbackName),
        };
    }
    return null;
};
const getAsyncVariableDeclaratorInfo = (definition, callbackName) => {
    if (definition.node.type !== utils_1.AST_NODE_TYPES.VariableDeclarator) {
        return null;
    }
    const initializerExpression = definition.node.init;
    if (!isAsyncFunctionExpression(initializerExpression)) {
        return null;
    }
    const name = (definition.node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
        definition.node.id.name) ||
        callbackName;
    return {
        callbackLabel: getFunctionDescription(initializerExpression, name),
    };
};
const analyzeVariableDefinition = (definition, callbackName) => getAsyncFunctionDeclarationInfo(definition, callbackName) ??
    getAsyncVariableDeclaratorInfo(definition, callbackName);
const getReferenceWriteExpression = (reference) => {
    const parent = reference.identifier.parent;
    if (reference.writeExpr) {
        return reference.writeExpr;
    }
    if (parent?.type === utils_1.AST_NODE_TYPES.AssignmentExpression) {
        return parent.right;
    }
    if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator && parent.init) {
        return parent.init;
    }
    return null;
};
const analyzeVariableReference = (reference) => {
    if (!isWriteReference(reference)) {
        return null;
    }
    const writeExpr = getReferenceWriteExpression(reference);
    if (!isAsyncFunctionExpression(writeExpr)) {
        return null;
    }
    const name = (writeExpr.type === utils_1.AST_NODE_TYPES.FunctionExpression &&
        writeExpr.id?.name) ||
        reference.identifier.name;
    return {
        callbackLabel: getFunctionDescription(writeExpr, name),
    };
};
const analyzeCallbackAsyncStatus = (callback, scope) => {
    if (callback.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
        callback.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
        return analyzeInlineCallback(callback);
    }
    if (callback.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const variable = findVariableInScope(scope, callback.name);
    if (!variable) {
        return null;
    }
    /**
     * Track every write to the callback identifier with its source position. Only
     * the last write at or before the callback location determines whether the
     * callback is async when it is passed to forEach. If the callback location is
     * unknown, bail out to avoid blaming writes that might occur after the call
     * (e.g., a later reassignment to async that should not retroactively flag an
     * earlier forEach use).
     */
    const callbackStart = callback.range?.[0];
    const writes = [];
    for (const definition of variable.defs) {
        const definitionResult = analyzeVariableDefinition(definition, callback.name);
        writes.push({
            start: getDefinitionStart(definition),
            isAsync: Boolean(definitionResult),
            info: definitionResult,
        });
    }
    for (const reference of variable.references) {
        if (!isWriteReference(reference)) {
            continue;
        }
        const referenceResult = analyzeVariableReference(reference);
        writes.push({
            start: getReferenceStart(reference),
            isAsync: Boolean(referenceResult),
            info: referenceResult,
        });
    }
    const relevantWrites = writes.filter(({ start }) => typeof callbackStart === 'number' && start <= callbackStart);
    if (!relevantWrites.length) {
        return null;
    }
    const lastWrite = relevantWrites.reduce((latest, current) => !latest || current.start > latest.start ? current : latest, null);
    return lastWrite && lastWrite.isAsync ? lastWrite.info : null;
};
exports.noAsyncForEach = {
    create(context) {
        const sourceCode = getSourceCode(context);
        return {
            CallExpression(node) {
                const callee = node.callee;
                const callback = node.arguments[0];
                if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name === 'forEach' &&
                    callback) {
                    const scope = getScope(context, sourceCode, callback);
                    const asyncCallbackInfo = analyzeCallbackAsyncStatus(callback, scope);
                    if (asyncCallbackInfo) {
                        context.report({
                            node: callback,
                            messageId: 'noAsyncForEach',
                            data: asyncCallbackInfo,
                        });
                    }
                }
            },
        };
    },
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow async callbacks to Array.forEach',
            recommended: 'error',
        },
        messages: {
            noAsyncForEach: 'Async {{callbackLabel}} passed to Array.forEach runs without awaiting each item. Array.forEach ignores returned promises, so async work executes in parallel and rejections go unhandled. Use a for...of loop to await sequentially or map with Promise.all when you want controlled concurrency.',
        },
        schema: [],
    },
    defaultOptions: [],
};
//# sourceMappingURL=no-async-foreach.js.map