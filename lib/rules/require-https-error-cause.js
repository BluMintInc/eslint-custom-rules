"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireHttpsErrorCause = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const isHttpsErrorCallee = (callee) => {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === 'HttpsError';
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        return (callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
            callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            callee.property.name === 'HttpsError');
    }
    return false;
};
const findVariableInScopeChain = (scope, name) => {
    let currentScope = scope;
    while (currentScope) {
        const variable = currentScope.variables.find((item) => item.name === name);
        if (variable) {
            return variable;
        }
        currentScope = currentScope.upper;
    }
    return null;
};
exports.requireHttpsErrorCause = (0, createRule_1.createRule)({
    name: 'require-https-error-cause',
    meta: {
        type: 'problem',
        docs: {
            description: 'Ensure HttpsError calls inside catch blocks pass the caught error as the fourth "cause" argument to preserve stack traces for monitoring.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            missingCause: 'HttpsError inside a catch block must pass the caught error as the fourth "cause" argument. Without the original error, the stack is lost and monitoring fingerprints degrade. Add {{catchName}} as the cause argument after the optional details parameter.',
            causeNotCatchBinding: 'The fourth HttpsError argument should be the catch binding {{catchName}} so the original error stack is preserved for monitoring. Pass the catch variable instead of {{actual}}.',
            missingCatchBinding: 'HttpsError inside a catch block needs a named catch binding so the original error can be forwarded as the fourth "cause" argument. Bind the error value (e.g., `catch (error)`) and pass that variable as the cause to keep the upstream stack trace.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceCode = context.getSourceCode();
        const catchStack = [];
        // ESLint 9 moves getScope onto sourceCode; ESLint 8 exposes context.getScope().
        // This shim keeps the rule compatible until the codebase drops ESLint 8 support.
        const getScopeForNode = (node) => {
            const sourceCodeWithScope = sourceCode;
            if (typeof sourceCodeWithScope.getScope === 'function') {
                return sourceCodeWithScope.getScope(node);
            }
            return context.getScope();
        };
        const reportMissingCause = (node, catchName) => {
            context.report({
                node,
                messageId: 'missingCause',
                data: {
                    catchName,
                },
            });
        };
        const reportWrongCause = (node, catchName, actual) => {
            context.report({
                node,
                messageId: 'causeNotCatchBinding',
                data: {
                    catchName,
                    actual,
                },
            });
        };
        const isCatchBindingReference = (identifier, frame) => {
            if (!frame.paramName || identifier.name !== frame.paramName) {
                return false;
            }
            const variable = findVariableInScopeChain(getScopeForNode(identifier), identifier.name);
            return (variable?.defs.some((definition) => definition.type === 'CatchClause' && definition.node === frame.node) ?? false);
        };
        const validateHttpsError = (node) => {
            if (!catchStack.length) {
                return;
            }
            if (!isHttpsErrorCallee(node.callee)) {
                return;
            }
            const activeCatch = catchStack[catchStack.length - 1];
            if (!activeCatch.paramName) {
                context.report({
                    node,
                    messageId: 'missingCatchBinding',
                });
                return;
            }
            const catchName = activeCatch.paramName;
            if (node.arguments.length < 4) {
                reportMissingCause(node, catchName);
                return;
            }
            const causeArg = node.arguments[3];
            if (!causeArg || causeArg.type !== utils_1.AST_NODE_TYPES.Identifier) {
                reportWrongCause(causeArg ?? node, catchName, causeArg
                    ? sourceCode.getText(causeArg)
                    : 'the missing cause argument');
                return;
            }
            if (!isCatchBindingReference(causeArg, activeCatch)) {
                reportWrongCause(causeArg, catchName, sourceCode.getText(causeArg));
            }
        };
        return {
            CatchClause(node) {
                if (node.param?.type === utils_1.AST_NODE_TYPES.Identifier) {
                    catchStack.push({ paramName: node.param.name, node });
                    return;
                }
                // Destructured catch params (e.g., `catch ({ message })`) do not bind the
                // full error object, so they cannot be forwarded as the HttpsError cause.
                // Users should bind the error value (e.g., `catch (error)`) before rethrowing.
                catchStack.push({ paramName: null, node });
            },
            'CatchClause:exit'() {
                catchStack.pop();
            },
            NewExpression(node) {
                validateHttpsError(node);
            },
            CallExpression(node) {
                validateHttpsError(node);
            },
        };
    },
});
//# sourceMappingURL=require-https-error-cause.js.map