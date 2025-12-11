"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferUrlToStringOverToJson = void 0;
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
// Helpers to identify URL constructor expressions
function isUrlConstructor(newExpr) {
    const callee = newExpr.callee;
    if (callee.type === utils_1.AST_NODE_TYPES.Identifier) {
        return callee.name === 'URL';
    }
    if (callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        // e.g., new globalThis.URL(...), new window.URL(...)
        return (callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
            callee.property.name === 'URL');
    }
    return false;
}
function isJSONStringifyCall(node) {
    const { callee } = node;
    if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
        return false;
    let objectExpr = callee.object;
    while (objectExpr.type === utils_1.AST_NODE_TYPES.MemberExpression) {
        objectExpr = objectExpr.object;
    }
    const isJsonIdentifier = objectExpr.type === utils_1.AST_NODE_TYPES.Identifier && objectExpr.name === 'JSON';
    const isStringifyProperty = callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
        callee.property.name === 'stringify';
    return isJsonIdentifier && isStringifyProperty;
}
function findEnclosingJSONStringify(node) {
    let current = node;
    while (current && current.parent) {
        const parent = current.parent;
        if (parent.type === utils_1.AST_NODE_TYPES.CallExpression) {
            if (isJSONStringifyCall(parent) &&
                parent.arguments.includes(current)) {
                return parent;
            }
        }
        current = parent;
    }
    return null;
}
function isOptionalMemberExpression(expr) {
    // @typescript-eslint defines optional?: boolean on MemberExpression for optional chaining
    // Cast to any to safely access it across minor version diffs
    return expr.optional === true;
}
exports.preferUrlToStringOverToJson = (0, createRule_1.createRule)({
    create(context) {
        const sourceCode = context.getSourceCode();
        const parserServices = sourceCode.parserServices;
        const urlIdentifierNames = new Set();
        let checker = null;
        if (parserServices &&
            parserServices.program &&
            typeof parserServices.program.getTypeChecker === 'function') {
            try {
                checker = parserServices.program.getTypeChecker();
            }
            catch {
                checker = null;
            }
        }
        function isUrlType(expr) {
            // Heuristic without types
            if (expr.type === utils_1.AST_NODE_TYPES.NewExpression &&
                isUrlConstructor(expr)) {
                return true;
            }
            if (expr.type === utils_1.AST_NODE_TYPES.Identifier) {
                if (urlIdentifierNames.has(expr.name))
                    return true;
            }
            // Typed check via TS when available
            if (checker &&
                parserServices &&
                parserServices.esTreeNodeToTSNodeMap) {
                try {
                    const tsNode = parserServices.esTreeNodeToTSNodeMap.get(expr);
                    const type = checker.getTypeAtLocation(tsNode);
                    const isUrl = (t) => {
                        const sym = t.getSymbol();
                        if (sym?.getName() === 'URL')
                            return true;
                        const unionTypes = t.types;
                        return Array.isArray(unionTypes) && unionTypes.some(isUrl);
                    };
                    if (isUrl(type))
                        return true;
                }
                catch {
                    // ignore type errors and fall through
                }
            }
            return false;
        }
        return {
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.init &&
                    node.init.type === utils_1.AST_NODE_TYPES.NewExpression &&
                    isUrlConstructor(node.init)) {
                    urlIdentifierNames.add(node.id.name);
                }
            },
            AssignmentExpression(node) {
                if (node.left.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.right.type === utils_1.AST_NODE_TYPES.NewExpression &&
                    isUrlConstructor(node.right)) {
                    urlIdentifierNames.add(node.left.name);
                }
            },
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== utils_1.AST_NODE_TYPES.MemberExpression)
                    return;
                // property should be .toJSON or ['toJSON']
                if ((callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    callee.property.name !== 'toJSON') ||
                    (callee.property.type === utils_1.AST_NODE_TYPES.Literal &&
                        callee.property.value !== 'toJSON')) {
                    return;
                }
                const objectExpr = callee.object;
                if (!isUrlType(objectExpr))
                    return;
                const insideJSONStringify = findEnclosingJSONStringify(node);
                const memberExpr = callee;
                context.report({
                    node,
                    messageId: 'preferToString',
                    fix(fixer) {
                        // If inside JSON.stringify and not optional chain, replace the entire call with just the object
                        if (insideJSONStringify &&
                            !isOptionalMemberExpression(memberExpr)) {
                            const objText = sourceCode.getText(objectExpr);
                            return fixer.replaceText(node, objText);
                        }
                        // Default: change .toJSON() -> .toString()
                        const propertyRange = memberExpr.property.range;
                        return fixer.replaceTextRange(propertyRange, 'toString');
                    },
                });
            },
        };
    },
    name: 'prefer-url-tostring-over-tojson',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce the use of toString() over toJSON() on URL objects. Prefer passing URL objects directly to JSON.stringify, which will call toJSON automatically. See docs/rules/prefer-url-tostring-over-tojson.md for examples.',
            recommended: 'error',
            requiresTypeChecking: false,
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferToString: 'Use toString() instead of toJSON() on URL objects. When serializing with JSON.stringify, pass the URL object directly.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=prefer-url-tostring-over-tojson.js.map