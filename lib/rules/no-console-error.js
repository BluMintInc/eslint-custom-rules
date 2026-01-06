"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noConsoleError = void 0;
const minimatch_1 = require("minimatch");
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultIgnorePatterns = [
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/__playwright__/**',
    '**/scripts/**',
    '**/electron/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
];
const normalizeFilename = (filename) => filename.replace(/\\/g, '/');
const isUseAlertDialogImportPath = (importPath) => {
    const normalizedImportPath = normalizeFilename(importPath);
    if (normalizedImportPath === '../useAlertDialog' ||
        normalizedImportPath === './useAlertDialog' ||
        normalizedImportPath === 'useAlertDialog' ||
        normalizedImportPath === '@/hooks/useAlertDialog' ||
        normalizedImportPath === 'src/hooks/useAlertDialog') {
        return true;
    }
    return (normalizedImportPath.endsWith('/useAlertDialog') ||
        normalizedImportPath.endsWith('/useAlertDialog/index'));
};
const createFileIgnorePredicate = (options) => {
    const ignorePatterns = [
        ...defaultIgnorePatterns,
        ...(options?.ignorePatterns ?? []),
    ];
    return (filename) => {
        const normalizedFilename = normalizeFilename(filename);
        return (normalizedFilename &&
            !normalizedFilename.startsWith('<') &&
            ignorePatterns.some((pattern) => (0, minimatch_1.minimatch)(normalizedFilename, pattern, { dot: true })));
    };
};
const unwrapChainExpression = (node) => {
    if (!node)
        return null;
    if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return node.expression;
    }
    return node;
};
const findVariable = (scope, name) => {
    let current = scope;
    while (current) {
        const variable = current.variables.find((v) => v.name === name);
        if (variable) {
            return variable;
        }
        current = current.upper;
    }
    return null;
};
const getResolvedVariable = (scope, identifier) => {
    const ref = scope.references.find((r) => r.identifier === identifier);
    if (ref?.resolved) {
        return ref.resolved;
    }
    // Fallback for cases where scope analysis might not have linked it yet or for shadowed built-ins
    return findVariable(scope, identifier.name);
};
const getScopeForNode = (context, node) => {
    const sourceCode = context.getSourceCode();
    const sourceCodeWithScope = sourceCode;
    if (typeof sourceCodeWithScope.getScope === 'function') {
        return sourceCodeWithScope.getScope(node) ?? context.getScope();
    }
    return context.getScope();
};
const getDeclaredVariablesForNode = (context, node) => {
    const sourceCodeWithDeclaredVariables = context.getSourceCode();
    if (typeof sourceCodeWithDeclaredVariables.getDeclaredVariables === 'function') {
        return sourceCodeWithDeclaredVariables.getDeclaredVariables(node);
    }
    return context.getDeclaredVariables(node);
};
const isErrorKey = (key, computed) => {
    if (!computed && key.type === utils_1.AST_NODE_TYPES.Identifier) {
        return key.name === 'error';
    }
    if (computed) {
        if (key.type === utils_1.AST_NODE_TYPES.Literal && key.value === 'error') {
            return true;
        }
        if (key.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
            key.expressions.length === 0 &&
            key.quasis.length === 1 &&
            key.quasis[0].value.raw === 'error') {
            return true;
        }
    }
    return false;
};
const getLocalNameFromPattern = (target) => {
    if (target.type === utils_1.AST_NODE_TYPES.Identifier) {
        return target.name;
    }
    if (target.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
        target.left.type === utils_1.AST_NODE_TYPES.Identifier) {
        return target.left.name;
    }
    return null;
};
const findDeclaredVariableByName = (name, variables) => variables.find((variable) => variable.name === name);
/**
 * Tracks aliases of `console` and `console.error` to detect indirect calls.
 */
class AliasTracker {
    constructor(context) {
        this.context = context;
        this.consoleAliases = new Set();
        this.errorAliases = new Set();
    }
    getScope(node) {
        return getScopeForNode(this.context, node);
    }
    markConsole(variable) {
        if (!variable)
            return;
        this.consoleAliases.add(variable);
        this.errorAliases.delete(variable);
    }
    markError(variable) {
        if (!variable)
            return;
        this.errorAliases.add(variable);
        this.consoleAliases.delete(variable);
    }
    untrack(variable) {
        if (!variable)
            return;
        this.consoleAliases.delete(variable);
        this.errorAliases.delete(variable);
    }
    isConsoleObject(expression, scope) {
        const unwrapped = unwrapChainExpression(expression);
        if (!unwrapped || unwrapped.type !== utils_1.AST_NODE_TYPES.Identifier) {
            return false;
        }
        const variable = getResolvedVariable(scope, unwrapped);
        if (variable) {
            if (unwrapped.name === 'console' &&
                variable.scope.type === 'global' &&
                variable.defs.length === 0) {
                return true;
            }
            return this.consoleAliases.has(variable);
        }
        return unwrapped.name === 'console';
    }
    isConsoleErrorMemberExpression(member, scope) {
        return (this.isConsoleObject(member.object, scope) &&
            isErrorKey(member.property, member.computed ?? false));
    }
    isErrorAlias(identifier, scope) {
        const variable = getResolvedVariable(scope, identifier);
        return Boolean(variable && this.errorAliases.has(variable));
    }
    isConsoleErrorCall(node, scope) {
        const callee = unwrapChainExpression(node.callee);
        if (!callee)
            return false;
        if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            return this.isConsoleErrorMemberExpression(callee, scope);
        }
        if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
            return this.isErrorAlias(callee, scope);
        }
        return false;
    }
    isDirectGlobalConsoleErrorCall(node, scope) {
        const callee = unwrapChainExpression(node.callee);
        if (!callee || callee.type !== utils_1.AST_NODE_TYPES.MemberExpression) {
            return false;
        }
        if (callee.computed ||
            callee.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
            callee.property.name !== 'error') {
            return false;
        }
        const obj = unwrapChainExpression(callee.object);
        if (!obj ||
            obj.type !== utils_1.AST_NODE_TYPES.Identifier ||
            obj.name !== 'console') {
            return false;
        }
        const variable = getResolvedVariable(scope, obj);
        return !variable || variable.scope.type === 'global';
    }
    handleVariableDeclarator(node) {
        if (!node.init)
            return;
        const scope = this.getScope(node);
        const init = unwrapChainExpression(node.init);
        const declaredVariables = getDeclaredVariablesForNode(this.context, node);
        const getDeclaredVar = (name) => findDeclaredVariableByName(name, declaredVariables) ?? null;
        if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
            init &&
            this.isConsoleObject(init, scope)) {
            this.markConsole(getDeclaredVar(node.id.name));
            return;
        }
        if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
            init &&
            init.type === utils_1.AST_NODE_TYPES.MemberExpression &&
            this.isConsoleErrorMemberExpression(init, scope)) {
            this.markError(getDeclaredVar(node.id.name));
            return;
        }
        if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
            init &&
            this.isConsoleObject(init, scope)) {
            for (const prop of node.id.properties) {
                if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                    isErrorKey(prop.key, prop.computed ?? false)) {
                    const localName = getLocalNameFromPattern(prop.value);
                    if (localName)
                        this.markError(getDeclaredVar(localName));
                }
            }
        }
    }
    handleAssignmentExpression(node) {
        const scope = this.getScope(node);
        const right = unwrapChainExpression(node.right);
        if (!right)
            return;
        if (node.left.type === utils_1.AST_NODE_TYPES.Identifier) {
            const variable = getResolvedVariable(scope, node.left);
            if (this.isConsoleObject(right, scope)) {
                this.markConsole(variable);
            }
            else if (right.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                this.isConsoleErrorMemberExpression(right, scope)) {
                this.markError(variable);
            }
            else {
                this.untrack(variable);
            }
            return;
        }
        if (node.left.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            const errorProps = node.left.properties.filter((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                isErrorKey(prop.key, prop.computed ?? false));
            const localNames = errorProps
                .map((prop) => getLocalNameFromPattern(prop.value))
                .filter((name) => Boolean(name));
            const isConsole = this.isConsoleObject(right, scope);
            for (const name of localNames) {
                const v = findVariable(scope, name);
                if (isConsole)
                    this.markError(v);
                else
                    this.untrack(v);
            }
        }
    }
}
/**
 * Tracks `useAlertDialog` hook usage and its `open` function to allow
 * `console.error` calls when an error dialog is being shown.
 */
class UseAlertDialogTracker {
    constructor(context) {
        this.context = context;
        this.hookVariables = new Set();
        this.instanceVariables = new Set();
        this.openVariables = new Set();
        this.hasUseAlertDialogCall = false;
    }
    getScope(node) {
        return getScopeForNode(this.context, node);
    }
    static hasErrorSeverity(node) {
        for (const prop of node.properties) {
            if (prop.type !== utils_1.AST_NODE_TYPES.Property)
                continue;
            const isSeverityProperty = (!prop.computed &&
                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                prop.key.name === 'severity') ||
                (prop.computed &&
                    prop.key.type === utils_1.AST_NODE_TYPES.Literal &&
                    prop.key.value === 'severity');
            if (!isSeverityProperty)
                continue;
            if (prop.value.type === utils_1.AST_NODE_TYPES.Literal &&
                typeof prop.value.value === 'string') {
                return prop.value.value === 'error';
            }
            // Non-literal severities cannot be verified at lint time, so treat them
            // conservatively as non-error to prevent false negatives.
            return false;
        }
        return false;
    }
    trackImport(node) {
        const importPath = String(node.source.value);
        if (!isUseAlertDialogImportPath(importPath))
            return;
        for (const specifier of node.specifiers) {
            for (const v of getDeclaredVariablesForNode(this.context, specifier)) {
                this.hookVariables.add(v);
            }
        }
    }
    trackVariableDeclarator(node) {
        if (!node.init)
            return;
        const scope = this.getScope(node);
        // const dialog = useAlertDialog(...) OR const { open } = useAlertDialog(...)
        if (node.init.type === utils_1.AST_NODE_TYPES.CallExpression &&
            this.isHookCall(node.init)) {
            this.hasUseAlertDialogCall = true;
            if (node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                const v = findDeclaredVariableByName(node.id.name, getDeclaredVariablesForNode(this.context, node));
                if (v)
                    this.instanceVariables.add(v);
            }
            else if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                this.trackDestructuredOpen(node.id, node);
            }
            return;
        }
        // const { open } = dialog
        if (node.init.type === utils_1.AST_NODE_TYPES.Identifier &&
            node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            const initVar = getResolvedVariable(scope, node.init);
            if (initVar && this.instanceVariables.has(initVar)) {
                this.trackDestructuredOpen(node.id, node);
            }
        }
    }
    trackDestructuredOpen(pattern, node) {
        const declaredVariables = getDeclaredVariablesForNode(this.context, node);
        for (const prop of pattern.properties) {
            if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                !prop.computed &&
                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                prop.key.name === 'open') {
                const localName = getLocalNameFromPattern(prop.value);
                if (localName) {
                    const v = findDeclaredVariableByName(localName, declaredVariables);
                    if (v)
                        this.openVariables.add(v);
                }
            }
        }
    }
    isHookCall(node) {
        const callee = unwrapChainExpression(node.callee);
        if (!callee || callee.type !== utils_1.AST_NODE_TYPES.Identifier)
            return false;
        const v = getResolvedVariable(this.getScope(callee), callee);
        if (v && this.hookVariables.has(v))
            return true;
        return ((v === null || v.scope.type === 'global') &&
            callee.name === 'useAlertDialog');
    }
    isOpenCall(node) {
        const callee = unwrapChainExpression(node.callee);
        if (!callee)
            return false;
        const scope = this.getScope(node);
        if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
            const v = getResolvedVariable(scope, callee);
            return v !== null && this.openVariables.has(v);
        }
        if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            if (callee.computed ||
                callee.property.type !== utils_1.AST_NODE_TYPES.Identifier ||
                callee.property.name !== 'open') {
                return false;
            }
            const obj = unwrapChainExpression(callee.object);
            if (obj && obj.type === utils_1.AST_NODE_TYPES.Identifier) {
                const v = getResolvedVariable(scope, obj);
                return v !== null && this.instanceVariables.has(v);
            }
        }
        return false;
    }
}
/**
 * Manages function scopes and pending `console.error` calls that may be
 * allowed if a `useAlertDialog` call with error severity follows.
 */
class PendingCallTracker {
    constructor() {
        this.functionScopeStack = [];
        this.functionsWithErrorDialogOpen = new WeakSet();
        this.pendingConsoleErrorCalls = new Map();
    }
    pushScope(node) {
        this.functionScopeStack.push(node);
    }
    popScope() {
        return this.functionScopeStack.pop() ?? null;
    }
    getCurrentScope() {
        return this.functionScopeStack[this.functionScopeStack.length - 1] ?? null;
    }
    markFunctionWithErrorDialog(node) {
        this.functionsWithErrorDialogOpen.add(node);
    }
    queueCall(scope, node) {
        const pending = this.pendingConsoleErrorCalls.get(scope) ?? [];
        pending.push(node);
        this.pendingConsoleErrorCalls.set(scope, pending);
    }
    flushForScope(scope, reportFn, allowWithUseAlertDialog, hasUseAlertDialogCall) {
        const pending = this.pendingConsoleErrorCalls.get(scope);
        if (!pending)
            return;
        const shouldAllow = allowWithUseAlertDialog &&
            hasUseAlertDialogCall &&
            scope !== null &&
            this.functionsWithErrorDialogOpen.has(scope);
        if (!shouldAllow) {
            for (const node of pending) {
                reportFn(node);
            }
        }
        this.pendingConsoleErrorCalls.delete(scope);
    }
}
exports.noConsoleError = (0, createRule_1.createRule)({
    name: 'no-console-error',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow console.error so errors flow through structured handling (HttpsError/useErrorAlert on frontend, structured loggers on backend).',
            recommended: 'warn',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    ignorePatterns: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                    allowWithUseAlertDialog: { type: 'boolean' },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            noConsoleError: 'console.error bypasses the structured error pipeline → failures are harder to monitor, debug, and surface consistently to users → use structured error handling instead (frontend: throw HttpsError or route through useErrorAlert; backend: log with a structured logger such as firebase-functions/v2 logger and propagate/convert the error so monitoring captures it).',
        },
    },
    defaultOptions: [{}],
    create(context, [options]) {
        const shouldIgnoreFile = createFileIgnorePredicate(options);
        const filename = context.filename ??
            context.getFilename();
        if (shouldIgnoreFile(filename))
            return {};
        const allowWithUseAlertDialog = options.allowWithUseAlertDialog === true;
        const aliasTracker = new AliasTracker(context);
        const dialogTracker = new UseAlertDialogTracker(context);
        const pendingTracker = new PendingCallTracker();
        const report = (node) => {
            context.report({ node, messageId: 'noConsoleError' });
        };
        const onFunctionEnter = (node) => {
            pendingTracker.pushScope(node);
        };
        const onFunctionExit = (node) => {
            pendingTracker.flushForScope(node, report, allowWithUseAlertDialog, dialogTracker.hasUseAlertDialogCall);
            pendingTracker.popScope();
        };
        return {
            ImportDeclaration(node) {
                dialogTracker.trackImport(node);
            },
            FunctionDeclaration: onFunctionEnter,
            FunctionExpression: onFunctionEnter,
            ArrowFunctionExpression: onFunctionEnter,
            'FunctionDeclaration:exit': onFunctionExit,
            'FunctionExpression:exit': onFunctionExit,
            'ArrowFunctionExpression:exit': onFunctionExit,
            'Program:exit'() {
                pendingTracker.flushForScope(null, report, allowWithUseAlertDialog, dialogTracker.hasUseAlertDialogCall);
            },
            VariableDeclarator(node) {
                dialogTracker.trackVariableDeclarator(node);
                aliasTracker.handleVariableDeclarator(node);
            },
            AssignmentExpression(node) {
                aliasTracker.handleAssignmentExpression(node);
            },
            CallExpression(node) {
                if (dialogTracker.isOpenCall(node) &&
                    node.arguments[0]?.type === utils_1.AST_NODE_TYPES.ObjectExpression &&
                    UseAlertDialogTracker.hasErrorSeverity(node.arguments[0])) {
                    const scope = pendingTracker.getCurrentScope();
                    if (scope)
                        pendingTracker.markFunctionWithErrorDialog(scope);
                }
                const scope = getScopeForNode(context, node);
                if (!aliasTracker.isConsoleErrorCall(node, scope))
                    return;
                // Queueing is limited to direct global `console.error(...)` calls because deferral relies on
                // linear control flow. Aliased or destructured references can escape the current scope
                // (stored, passed, invoked later), so they are reported immediately to avoid missing non-local calls.
                if (allowWithUseAlertDialog &&
                    aliasTracker.isDirectGlobalConsoleErrorCall(node, scope)) {
                    pendingTracker.queueCall(pendingTracker.getCurrentScope(), node);
                    return;
                }
                report(node);
            },
        };
    },
});
//# sourceMappingURL=no-console-error.js.map