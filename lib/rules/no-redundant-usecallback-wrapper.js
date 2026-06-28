"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noRedundantUseCallbackWrapper = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
function isHookLikeName(name) {
    return name.startsWith('use');
}
function isKnownHookCallee(callee, knownHooks, assumeAllUseAreMemoized) {
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return ((assumeAllUseAreMemoized && isHookLikeName(callee.name)) ||
            knownHooks.has(callee.name));
    }
    // Support namespaced hook calls, e.g., Hooks.useAuthSubmit()
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        const prop = callee.property.name;
        return ((assumeAllUseAreMemoized && isHookLikeName(prop)) || knownHooks.has(prop));
    }
    return false;
}
function isPreventDefaultCall(stmt, params) {
    if (stmt.type !== utils_1.AST_NODE_TYPES.ExpressionStatement)
        return false;
    const expr = stmt.expression;
    if (expr.type !== utils_1.AST_NODE_TYPES.CallExpression)
        return false;
    if (expr.callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
        return false;
    const member = expr.callee;
    if (member.object.type === utils_1.AST_NODE_TYPES.Identifier &&
        params.includes(member.object.name) &&
        member.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        (member.property.name === 'preventDefault' ||
            member.property.name === 'stopPropagation' ||
            member.property.name === 'stopImmediatePropagation')) {
        return true;
    }
    return false;
}
function getParams(node) {
    const names = new Set();
    for (const p of node.params) {
        if (p.type === utils_1.AST_NODE_TYPES.Identifier) {
            names.add(p.name);
        }
        else if (p.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
            for (const prop of p.properties) {
                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                    // Collect bound identifier names (aliases/defaults)
                    if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                        names.add(prop.value.name);
                    }
                    else if (prop.value.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                        prop.value.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                        names.add(prop.value.left.name);
                    }
                }
                else if (prop.type === utils_1.AST_NODE_TYPES.RestElement) {
                    if (prop.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                        names.add(prop.argument.name);
                    }
                }
            }
        }
        else if (p.type === utils_1.AST_NODE_TYPES.ArrayPattern) {
            for (const element of p.elements) {
                if (!element)
                    continue;
                if (element.type === utils_1.AST_NODE_TYPES.Identifier) {
                    names.add(element.name);
                }
                else if (element.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                    element.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                    names.add(element.left.name);
                }
                else if (element.type === utils_1.AST_NODE_TYPES.RestElement &&
                    element.argument.type === utils_1.AST_NODE_TYPES.Identifier) {
                    names.add(element.argument.name);
                }
            }
        }
    }
    return Array.from(names);
}
function isIdentifierOrMemberOn(obj, nameSet) {
    if (obj.type === utils_1.AST_NODE_TYPES.Identifier) {
        return nameSet.has(obj.name);
    }
    if (obj.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        obj.object.type === utils_1.AST_NODE_TYPES.Identifier) {
        return nameSet.has(obj.object.name);
    }
    return false;
}
function unwrapChainExpression(node) {
    if (!node)
        return null;
    if (node.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return node.expression;
    }
    return node;
}
// intentionally removed: helper for param-only detection not needed after simplification
// reserved for potential future options/heuristics
exports.noRedundantUseCallbackWrapper = (0, createRule_1.createRule)({
    name: 'no-redundant-usecallback-wrapper',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prevent wrapping already memoized/stable callbacks from hooks/contexts in an extra useCallback()',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    memoizedHookNames: {
                        type: 'array',
                        items: { type: 'string' },
                        default: [],
                    },
                    assumeAllUseAreMemoized: {
                        type: 'boolean',
                        default: false,
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            redundantWrapper: 'useCallback is wrapping memoized callback "{{callbackName}}", adding a redundant dependency array without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.',
        },
    },
    defaultOptions: [{}],
    create(context) {
        const option = context.options?.[0] ?? {};
        const knownHooks = new Set(option.memoizedHookNames ?? []);
        const assumeAllUseAreMemoized = option.assumeAllUseAreMemoized === true;
        const sourceCode = context.sourceCode;
        // Track identifiers coming from hook-like calls
        const hookReturnObjects = new Set(); // variables assigned to a hook call result (object or function)
        const hookReturnProps = new Set(); // properties destructured from a hook call result
        return {
            VariableDeclarator(node) {
                if (!node.init)
                    return;
                const initCall = unwrapChainExpression(node.init);
                if (!initCall || initCall.type !== utils_1.AST_NODE_TYPES.CallExpression) {
                    return;
                }
                const callee = unwrapChainExpression(initCall.callee);
                if (!callee)
                    return;
                if (!isKnownHookCallee(callee, knownHooks, assumeAllUseAreMemoized))
                    return;
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    hookReturnObjects.add(node.id.name);
                    return;
                }
                if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    for (const prop of node.id.properties) {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                            if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                                hookReturnProps.add(prop.value.name);
                            }
                            else if (prop.value.type === utils_1.AST_NODE_TYPES.AssignmentPattern &&
                                prop.value.left.type === utils_1.AST_NODE_TYPES.Identifier) {
                                hookReturnProps.add(prop.value.left.name);
                            }
                        }
                    }
                    return;
                }
            },
            CallExpression(node) {
                // Detect useCallback wrappers (including React.useCallback)
                const calleeNode = unwrapChainExpression(node.callee);
                if (!calleeNode)
                    return;
                const isUseCallback = (calleeNode.type === utils_1.AST_NODE_TYPES.Identifier &&
                    calleeNode.name === 'useCallback') ||
                    (calleeNode.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                        !calleeNode.computed &&
                        calleeNode.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                        calleeNode.property.name === 'useCallback');
                if (isUseCallback && node.arguments.length >= 1) {
                    const arg = node.arguments[0];
                    const unwrappedArg = unwrapChainExpression(arg);
                    // Case 1: useCallback(memoizedFn, ...) or useCallback(ctx.memoized, ...)
                    if (unwrappedArg &&
                        (unwrappedArg.type === utils_1.AST_NODE_TYPES.Identifier ||
                            unwrappedArg.type === utils_1.AST_NODE_TYPES.MemberExpression)) {
                        if ((unwrappedArg.type === utils_1.AST_NODE_TYPES.Identifier &&
                            (hookReturnProps.has(unwrappedArg.name) ||
                                hookReturnObjects.has(unwrappedArg.name))) ||
                            (unwrappedArg.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                unwrappedArg.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                                hookReturnObjects.has(unwrappedArg.object.name))) {
                            if (unwrappedArg.type === utils_1.AST_NODE_TYPES.Identifier) {
                                const replaceText = unwrappedArg.name;
                                context.report({
                                    node,
                                    messageId: 'redundantWrapper',
                                    data: { callbackName: sourceCode.getText(unwrappedArg) },
                                    fix: (fixer) => fixer.replaceText(node, replaceText),
                                });
                            }
                            else {
                                // Member function — report only, no fix to avoid breaking `this`.
                                context.report({
                                    node,
                                    messageId: 'redundantWrapper',
                                    data: { callbackName: sourceCode.getText(unwrappedArg) },
                                });
                            }
                        }
                        return;
                    }
                    // Case 2: useCallback(() => memoizedFn(...), ...)
                    if (unwrappedArg &&
                        (unwrappedArg.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                            unwrappedArg.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                        const fn = unwrappedArg;
                        const params = getParams(fn);
                        // Handle implicit return: () => memoizedFn()
                        if (fn.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                            fn.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
                            const bodyExpr = unwrapChainExpression(fn.body);
                            if (bodyExpr && bodyExpr.type === utils_1.AST_NODE_TYPES.CallExpression) {
                                const callee = unwrapChainExpression(bodyExpr.callee);
                                if ((callee &&
                                    isIdentifierOrMemberOn(callee, hookReturnObjects)) ||
                                    (callee &&
                                        callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                        hookReturnProps.has(callee.name))) {
                                    if (bodyExpr.arguments.length > 0) {
                                        // Passing any arguments: treat as non-redundant (avoid false positives)
                                        return;
                                    }
                                    else {
                                        if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                                            const replaceText = callee.name;
                                            context.report({
                                                node,
                                                messageId: 'redundantWrapper',
                                                data: { callbackName: sourceCode.getText(callee) },
                                                fix: (fixer) => fixer.replaceText(node, replaceText),
                                            });
                                        }
                                        else {
                                            // Member function — report only, no fix to avoid breaking `this`.
                                            context.report({
                                                node,
                                                messageId: 'redundantWrapper',
                                                data: { callbackName: sourceCode.getText(callee) },
                                            });
                                        }
                                    }
                                }
                            }
                            return;
                        }
                        // Handle block body: () => { [maybe e.preventDefault()]; return memoizedFn(); }
                        if (fn.body && fn.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                            const stmts = fn.body.body.filter(Boolean);
                            if (stmts.length >= 1 && stmts.length <= 2) {
                                let idx = 0;
                                if (stmts.length === 2 &&
                                    isPreventDefaultCall(stmts[0], params)) {
                                    idx = 1;
                                }
                                const last = stmts[idx];
                                if (last.type === utils_1.AST_NODE_TYPES.ReturnStatement ||
                                    last.type === utils_1.AST_NODE_TYPES.ExpressionStatement) {
                                    const expr = last.type === utils_1.AST_NODE_TYPES.ReturnStatement
                                        ? last.argument
                                        : last.expression;
                                    if (expr && expr.type === utils_1.AST_NODE_TYPES.CallExpression) {
                                        const callee = unwrapChainExpression(expr.callee);
                                        const isHookProp = callee &&
                                            callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                            hookReturnProps.has(callee.name);
                                        const isHookObjMember = callee &&
                                            callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                                            callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                                            hookReturnObjects.has(callee.object.name);
                                        if (isHookProp || isHookObjMember) {
                                            if ((expr.arguments?.length ?? 0) > 0) {
                                                // Passing any arguments: treat as non-redundant
                                                return;
                                            }
                                            else {
                                                // No args and trivial wrapper
                                                if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                                                    const replaceText = callee
                                                        .name;
                                                    context.report({
                                                        node,
                                                        messageId: 'redundantWrapper',
                                                        data: { callbackName: sourceCode.getText(callee) },
                                                        fix: (fixer) => fixer.replaceText(node, replaceText),
                                                    });
                                                }
                                                else {
                                                    // Member function — report only, no fix to avoid breaking `this`.
                                                    context.report({
                                                        node,
                                                        messageId: 'redundantWrapper',
                                                        data: { callbackName: sourceCode.getText(callee) },
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
        };
    },
});
exports.default = exports.noRedundantUseCallbackWrapper;
//# sourceMappingURL=no-redundant-usecallback-wrapper.js.map