"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoizeRootLevelHocs = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const defaultOptions = [{ additionalHocNames: [] }];
const isFunctionNode = (node) => node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
    node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
    node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression;
const isHookName = (name) => /^use[A-Z]/.test(name);
const isComponentName = (name) => /^[A-Z]/.test(name);
const forEachChildNode = (node, callback) => {
    for (const key of Object.keys(node)) {
        if (key === 'parent')
            continue;
        const value = node[key];
        if (!value)
            continue;
        if (Array.isArray(value)) {
            for (const child of value) {
                if (child && typeof child.type === 'string') {
                    if (callback(child)) {
                        return true;
                    }
                }
            }
        }
        else if (value && typeof value.type === 'string') {
            if (callback(value)) {
                return true;
            }
        }
    }
    return false;
};
const getFunctionName = (node) => {
    if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration && node.id) {
        return node.id.name;
    }
    if (node.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
        const parent = node.parent;
        if (parent &&
            parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
            parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
            return parent.id.name;
        }
        if (parent &&
            parent.type === utils_1.AST_NODE_TYPES.Property &&
            parent.key.type === utils_1.AST_NODE_TYPES.Identifier) {
            return parent.key.name;
        }
    }
    return null;
};
const containsJsx = (node, options) => {
    if (!node)
        return false;
    if (node.type === utils_1.AST_NODE_TYPES.JSXElement ||
        node.type === utils_1.AST_NODE_TYPES.JSXFragment) {
        return true;
    }
    return forEachChildNode(node, (child) => {
        if (options?.skipFunctionBodies && isFunctionNode(child)) {
            return false;
        }
        return containsJsx(child, options);
    });
};
const hasFunctionParent = (node) => {
    let current = node.parent;
    while (current) {
        if (isFunctionNode(current)) {
            return true;
        }
        current = current.parent;
    }
    return false;
};
const getBodyNodeForJsxCheck = (node) => {
    if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
        node.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
        return node.body;
    }
    if (node.body && node.body.type !== utils_1.AST_NODE_TYPES.BlockStatement) {
        return node.body;
    }
    return node.body;
};
const isComponentOrHook = (node) => {
    const name = getFunctionName(node);
    const hook = name ? isHookName(name) : false;
    const component = name ? isComponentName(name) : false;
    const nestedFunction = hasFunctionParent(node);
    const jsxBody = containsJsx(getBodyNodeForJsxCheck(node), {
        skipFunctionBodies: !hook && !component,
    });
    if (!hook && !component && nestedFunction) {
        return null;
    }
    if (!hook && !component && !jsxBody) {
        return null;
    }
    if (hook) {
        return { contextLabel: `hook${name ? ` ${name}` : ''}` };
    }
    return { contextLabel: `component${name ? ` ${name}` : ''}` };
};
const getCallableIdentifierName = (callee) => {
    const maybeChain = callee;
    if (maybeChain.type === utils_1.AST_NODE_TYPES.ChainExpression) {
        return getCallableIdentifierName(maybeChain.expression);
    }
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name;
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
        !callee.computed &&
        callee.property.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.property.name;
    }
    return null;
};
const isHocIdentifier = (name, additionalHocs) => {
    if (additionalHocs.has(name)) {
        return true;
    }
    if (!name.startsWith('with')) {
        return false;
    }
    const suffix = name.charAt(4);
    return Boolean(suffix) && /^[A-Z]$/.test(suffix);
};
const findHocName = (node, additionalHocs) => {
    const identifier = getCallableIdentifierName(node.callee);
    if (identifier && isHocIdentifier(identifier, additionalHocs)) {
        return identifier;
    }
    if (node.callee.type === utils_1.AST_NODE_TYPES.CallExpression) {
        return findHocName(node.callee, additionalHocs);
    }
    return null;
};
/**
 * Detects chained HOC calls where an inner call is immediately invoked by
 * another call (for example, withHoc(Component)()). We only treat calls as
 * part of the same chain when the current CallExpression is the callee of its
 * parent and both resolve to the same HOC name, which prevents duplicate
 * reports for patterns like withHoc(Component)(props).
 */
const getParentCallExpression = (callExpr) => callExpr.parent &&
    callExpr.parent.type === utils_1.AST_NODE_TYPES.CallExpression &&
    callExpr.parent.callee === callExpr
    ? callExpr.parent
    : null;
const isPartOfHocChain = (hocName, parentHocName) => Boolean(parentHocName && parentHocName === hocName);
exports.memoizeRootLevelHocs = (0, createRule_1.createRule)({
    name: 'memoize-root-level-hocs',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent creating Higher-Order Components at the root level of React components/hooks without wrapping them in useMemo to keep wrapped component identities stable across renders.',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [
            {
                type: 'object',
                properties: {
                    additionalHocNames: {
                        type: 'array',
                        items: { type: 'string' },
                        default: [],
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            wrapHocInUseMemo: 'HOC "{{hocName}}" is created inside {{contextLabel}} during render, so every render creates a brand-new wrapped component reference. React treats that as a different component, unmounting/remounting it (resetting internal state) and forcing children to re-render even when props stay the same. Wrap the HOC creation in useMemo with the correct dependencies or hoist it outside the {{contextLabel}} so the wrapped component identity stays stable.',
        },
    },
    defaultOptions,
    create(context, [options]) {
        const additionalHocs = new Set(options?.additionalHocNames ?? []);
        const reportUnmemoizedHoc = (node, hocName, contextInfo) => {
            context.report({
                node,
                messageId: 'wrapHocInUseMemo',
                data: {
                    hocName,
                    contextLabel: contextInfo.contextLabel,
                },
            });
        };
        const checkHocCall = (callExpr, contextInfo) => {
            const hocName = findHocName(callExpr, additionalHocs);
            const parentCall = getParentCallExpression(callExpr);
            const parentHocName = parentCall && findHocName(parentCall, additionalHocs);
            if (hocName && !isPartOfHocChain(hocName, parentHocName)) {
                reportUnmemoizedHoc(callExpr, hocName, contextInfo);
            }
        };
        const traverseFunctionBody = (node, contextInfo) => {
            const visitNode = (current) => {
                if (isFunctionNode(current) && current !== node) {
                    return;
                }
                if (current.type === utils_1.AST_NODE_TYPES.CallExpression) {
                    checkHocCall(current, contextInfo);
                }
                forEachChildNode(current, (child) => {
                    visitNode(child);
                    return false;
                });
            };
            if (!node.body) {
                return;
            }
            if (node.body.type === utils_1.AST_NODE_TYPES.BlockStatement) {
                for (const statement of node.body.body) {
                    visitNode(statement);
                }
                return;
            }
            visitNode(node.body);
        };
        const analyzeFunction = (node) => {
            const contextInfo = isComponentOrHook(node);
            if (!contextInfo) {
                return;
            }
            traverseFunctionBody(node, contextInfo);
        };
        return {
            FunctionDeclaration: analyzeFunction,
            FunctionExpression: analyzeFunction,
            ArrowFunctionExpression: analyzeFunction,
        };
    },
});
//# sourceMappingURL=memoize-root-level-hocs.js.map