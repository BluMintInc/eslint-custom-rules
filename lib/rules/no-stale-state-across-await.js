"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noStaleStateAcrossAwait = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noStaleStateAcrossAwait = (0, createRule_1.createRule)({
    name: 'no-stale-state-across-await',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent stale intermediate state by disallowing useState setter calls both before and after async boundaries (await, .then(), yield) within the same function',
            recommended: 'error',
        },
        fixable: undefined,
        schema: [],
        messages: {
            staleStateAcrossAwait: 'State setter "{{setterName}}" runs on both sides of {{boundaryType}}. Updates issued before the async boundary can resolve after later updates and overwrite fresher data, leaving the UI in a stale loading or placeholder state. Keep "{{setterName}}" updates on one side of the async boundary or consolidate into a single atomic update after the async work; if you intentionally use a sentinel value, document it with // eslint-disable-next-line @blumintinc/blumint/no-stale-state-across-await and a short comment explaining why.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            // Check functions for violations
            'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
                const sourceCode = context.sourceCode;
                const scopeManager = sourceCode.scopeManager;
                if (!scopeManager)
                    return;
                const acquiredScope = scopeManager.acquire(node);
                if (!acquiredScope)
                    return;
                const scope = acquiredScope;
                // Build local set of setter identifiers declared via useState in this scope
                const localSetterNames = new Set();
                let scopeCursor = scope;
                while (scopeCursor) {
                    for (const variable of scopeCursor.variables) {
                        for (const def of variable.defs) {
                            if (def.type === 'Variable' &&
                                def.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                                def.node.id.type === utils_1.AST_NODE_TYPES.ArrayPattern &&
                                def.node.init?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                                def.node.init.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                def.node.init.callee.name === 'useState') {
                                const arrayPattern = def.node.id;
                                if (arrayPattern.elements.length >= 2 &&
                                    arrayPattern.elements[1]?.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    localSetterNames.add(arrayPattern.elements[1].name);
                                }
                            }
                        }
                    }
                    scopeCursor = scopeCursor.upper;
                }
                function isLocalSetter(identifier) {
                    return localSetterNames.has(identifier.name);
                }
                // Collect all setter calls and async boundaries in this function
                const setterCalls = [];
                const asyncBoundaries = [];
                // Walk through the function body to find setter calls and async boundaries
                function walkNode(n, skipNestedFunctions = true) {
                    if (n.type === utils_1.AST_NODE_TYPES.CallExpression) {
                        // Check for setter calls
                        if (n.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                            isLocalSetter(n.callee)) {
                            setterCalls.push({
                                name: n.callee.name,
                                position: n.range[0],
                            });
                        }
                        // Check for .then()/.catch()/.finally() calls
                        if (n.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                            n.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                            (n.callee.property.name === 'then' ||
                                n.callee.property.name === 'catch' ||
                                n.callee.property.name === 'finally')) {
                            const methodName = n.callee.property.name;
                            if (methodName === 'then' || methodName === 'catch') {
                                asyncBoundaries.push({
                                    position: n.range[0],
                                    label: `a .${methodName}() callback`,
                                });
                            }
                            // Walk into callback arguments to find setter calls
                            if (n.arguments && n.arguments.length > 0) {
                                for (const arg of n.arguments) {
                                    if (arg.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                                        arg.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                                        // Walk into the callback function body
                                        walkNode(arg, false);
                                    }
                                }
                            }
                        }
                    }
                    if (n.type === utils_1.AST_NODE_TYPES.AwaitExpression) {
                        asyncBoundaries.push({
                            position: n.range[0],
                            label: 'an await boundary',
                        });
                    }
                    if (n.type === utils_1.AST_NODE_TYPES.YieldExpression) {
                        asyncBoundaries.push({
                            position: n.range[0],
                            label: 'a yield boundary',
                        });
                    }
                    if (n.type === utils_1.AST_NODE_TYPES.ForOfStatement &&
                        n.await === true) {
                        asyncBoundaries.push({
                            position: n.range[0],
                            label: 'a yield boundary',
                        });
                    }
                    // Recursively walk child nodes
                    for (const key in n) {
                        if (key === 'parent')
                            continue;
                        const value = n[key];
                        if (Array.isArray(value)) {
                            for (const item of value) {
                                if (item && typeof item === 'object' && item.type) {
                                    // Skip nested functions unless we're explicitly walking into callbacks
                                    if (skipNestedFunctions &&
                                        (item.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                                            item.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                                            item.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                                        continue;
                                    }
                                    walkNode(item, skipNestedFunctions);
                                }
                            }
                        }
                        else if (value && typeof value === 'object' && value.type) {
                            // Skip nested functions unless we're explicitly walking into callbacks
                            if (skipNestedFunctions &&
                                (value.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
                                    value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                                    value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression)) {
                                return;
                            }
                            walkNode(value, skipNestedFunctions);
                        }
                    }
                }
                // Walk the function body
                if (node.body) {
                    walkNode(node.body);
                }
                // Check for violations
                const setterCallsByName = new Map();
                for (const call of setterCalls) {
                    if (!setterCallsByName.has(call.name)) {
                        setterCallsByName.set(call.name, []);
                    }
                    setterCallsByName.get(call.name).push(call);
                }
                // Check each setter for violations
                for (const [setterName, calls] of setterCallsByName) {
                    if (calls.length < 2)
                        continue; // Need at least 2 calls to have a violation
                    // Check if there are calls both before and after any async boundary
                    for (const boundary of asyncBoundaries) {
                        const callsBefore = calls.filter((call) => call.position < boundary.position);
                        const callsAfter = calls.filter((call) => call.position > boundary.position);
                        if (callsBefore.length > 0 && callsAfter.length > 0) {
                            // Report violation on the function node
                            context.report({
                                node,
                                messageId: 'staleStateAcrossAwait',
                                data: {
                                    setterName,
                                    boundaryType: boundary.label,
                                },
                            });
                            break; // Only report once per setter
                        }
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-stale-state-across-await.js.map