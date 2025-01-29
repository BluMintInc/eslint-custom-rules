"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noEntireObjectHookDeps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const typescript_1 = require("typescript");
const HOOK_NAMES = new Set(['useEffect', 'useCallback', 'useMemo']);
function isHookCall(node) {
    const callee = node.callee;
    return (callee.type === utils_1.AST_NODE_TYPES.Identifier && HOOK_NAMES.has(callee.name));
}
function isArrayOrPrimitive(checker, esTreeNode, nodeMap) {
    const tsNode = nodeMap.get(esTreeNode);
    if (!tsNode)
        return false;
    const type = checker.getTypeAtLocation(tsNode);
    // Check if it's a primitive type
    if (type.flags &
        (typescript_1.TypeFlags.String |
            typescript_1.TypeFlags.StringLike |
            typescript_1.TypeFlags.StringLiteral |
            typescript_1.TypeFlags.Number |
            typescript_1.TypeFlags.Boolean |
            typescript_1.TypeFlags.Null |
            typescript_1.TypeFlags.Undefined |
            typescript_1.TypeFlags.Void |
            typescript_1.TypeFlags.Never |
            typescript_1.TypeFlags.Any |
            typescript_1.TypeFlags.Unknown |
            typescript_1.TypeFlags.BigInt |
            typescript_1.TypeFlags.ESSymbol)) {
        return true;
    }
    // Check if it's an array type
    const typeNode = checker.typeToTypeNode(type, undefined, undefined);
    if (type.symbol?.name === 'Array' ||
        type.symbol?.escapedName === 'Array' ||
        (typeNode && ((0, typescript_1.isArrayTypeNode)(typeNode) || (0, typescript_1.isTupleTypeNode)(typeNode)))) {
        return true;
    }
    // Check if it's a string type with methods (like String object)
    if (type.symbol?.name === 'String' || type.symbol?.escapedName === 'String') {
        return true;
    }
    // If it's not a primitive or array, and has properties, it's an object
    return false;
}
function getObjectUsagesInHook(hookBody, objectName) {
    const usages = new Set();
    const visited = new Set();
    let needsEntireObject = false;
    function buildAccessPath(node) {
        const parts = [];
        let current = node;
        let hasOptionalChaining = false;
        // Collect all parts from leaf to root
        while (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            const memberExpr = current;
            if (memberExpr.computed) {
                return null; // Skip computed properties
            }
            if (memberExpr.property.type !== utils_1.AST_NODE_TYPES.Identifier) {
                return null;
            }
            parts.unshift(memberExpr.property.name);
            if (memberExpr.optional) {
                hasOptionalChaining = true;
            }
            current = memberExpr.object;
        }
        // Check if we reached the target identifier
        if (current.type === utils_1.AST_NODE_TYPES.Identifier && current.name === objectName) {
            // Build the path with optional chaining
            const path = objectName + (hasOptionalChaining ? '?' : '') + parts.map(part => '.' + part).join('');
            return path;
        }
        return null;
    }
    function visit(node) {
        if (visited.has(node))
            return;
        visited.add(node);
        if (node.type === utils_1.AST_NODE_TYPES.CallExpression) {
            // Check if the object is directly passed as an argument
            node.arguments.forEach((arg) => {
                if (arg.type === utils_1.AST_NODE_TYPES.Identifier &&
                    arg.name === objectName) {
                    needsEntireObject = true;
                }
            });
        }
        else if (node.type === utils_1.AST_NODE_TYPES.SpreadElement) {
            // If we find a spread operator with our target object, consider it as accessing all properties
            if (node.argument.type === utils_1.AST_NODE_TYPES.Identifier &&
                node.argument.name === objectName) {
                needsEntireObject = true;
                return;
            }
        }
        else if (node.type === utils_1.AST_NODE_TYPES.MemberExpression) {
            const path = buildAccessPath(node);
            if (path) {
                usages.add(path);
            }
        }
        // Visit all child nodes
        for (const key in node) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const child = node[key];
            if (child && typeof child === 'object') {
                if (Array.isArray(child)) {
                    child.forEach((item) => {
                        if (item && typeof item === 'object') {
                            visit(item);
                        }
                    });
                }
                else if ('type' in child) {
                    visit(child);
                }
            }
        }
    }
    visit(hookBody);
    // If the entire object is needed, return an empty set to indicate valid usage
    if (needsEntireObject) {
        return new Set();
    }
    // Filter out intermediate paths
    const paths = Array.from(usages);
    const filteredPaths = paths.filter((path) => !paths.some((otherPath) => otherPath !== path && otherPath.startsWith(path + '.')));
    return new Set(filteredPaths);
}
exports.noEntireObjectHookDeps = (0, createRule_1.createRule)({
    name: 'no-entire-object-hook-deps',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Avoid using entire objects in React hook dependency arrays when only specific fields are used. Requires TypeScript and `parserOptions.project` to be configured.',
            recommended: 'error',
            requiresTypeChecking: true,
        },
        fixable: 'code',
        schema: [],
        messages: {
            avoidEntireObject: 'Avoid using entire object "{{objectName}}" in dependency array. Use specific fields: {{fields}}',
        },
    },
    defaultOptions: [],
    create(context) {
        const parserServices = context.parserServices;
        // Check if we have access to TypeScript services
        if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
            throw new Error('You have to enable the `project` setting in parser options to use this rule');
        }
        const checker = parserServices.program.getTypeChecker();
        const nodeMap = parserServices.esTreeNodeToTSNodeMap;
        return {
            CallExpression(node) {
                if (!isHookCall(node)) {
                    return;
                }
                // Get the dependency array argument
                const depsArg = node.arguments[node.arguments.length - 1];
                if (!depsArg || depsArg.type !== utils_1.AST_NODE_TYPES.ArrayExpression) {
                    return;
                }
                // Get the hook callback function
                const callbackArg = node.arguments[0];
                if (!callbackArg ||
                    (callbackArg.type !== utils_1.AST_NODE_TYPES.ArrowFunctionExpression &&
                        callbackArg.type !== utils_1.AST_NODE_TYPES.FunctionExpression)) {
                    return;
                }
                // Check each dependency in the array
                depsArg.elements.forEach((element) => {
                    if (element && element.type === utils_1.AST_NODE_TYPES.Identifier) {
                        const objectName = element.name;
                        // Skip if the dependency is an array or primitive type
                        if (isArrayOrPrimitive(checker, element, nodeMap)) {
                            return;
                        }
                        const usages = getObjectUsagesInHook(callbackArg.body, objectName);
                        // If we found specific field usages and the entire object is in deps
                        // Skip reporting if usages is empty (indicates spread operator usage)
                        if (usages.size > 0) {
                            const fields = Array.from(usages).join(', ');
                            context.report({
                                node: element,
                                messageId: 'avoidEntireObject',
                                data: {
                                    objectName,
                                    fields,
                                },
                                fix(fixer) {
                                    // Only provide fix if we have specific fields to suggest
                                    if (usages.size > 0) {
                                        return fixer.replaceText(element, Array.from(usages).join(', '));
                                    }
                                    return null;
                                },
                            });
                        }
                    }
                });
            },
        };
    },
});
//# sourceMappingURL=no-entire-object-hook-deps.js.map