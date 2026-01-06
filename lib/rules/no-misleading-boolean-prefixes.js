"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMisleadingBooleanPrefixes = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const DEFAULT_PREFIXES = ['is', 'has', 'should'];
function unwrapTypeNode(node) {
    let current = node;
    while (current.type === 'TSParenthesizedType' &&
        current.typeAnnotation) {
        current = current.typeAnnotation;
    }
    return current;
}
function isUppercaseLetter(char) {
    return char >= 'A' && char <= 'Z';
}
function isDigit(char) {
    return char >= '0' && char <= '9';
}
function startsWithBooleanPrefix(name, prefixes) {
    if (!name)
        return false;
    const lower = name.toLowerCase();
    for (const prefix of prefixes) {
        const p = prefix.toLowerCase();
        if (lower.startsWith(p)) {
            if (name.length === p.length)
                return true; // edge: exact match like "is"
            const next = name[p.length];
            if (isUppercaseLetter(next) || next === '_' || isDigit(next)) {
                return true;
            }
        }
    }
    return false;
}
function isTsBooleanLike(typeNode) {
    if (!typeNode)
        return false;
    typeNode = unwrapTypeNode(typeNode);
    if (typeNode.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword)
        return true;
    if (typeNode.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
        typeof typeNode.literal.value === 'boolean') {
        return true;
    }
    const isBooleanishUnionMember = (t) => {
        const unwrapped = unwrapTypeNode(t);
        return (unwrapped.type === utils_1.AST_NODE_TYPES.TSBooleanKeyword ||
            (unwrapped.type === utils_1.AST_NODE_TYPES.TSLiteralType &&
                typeof unwrapped.literal.value ===
                    'boolean') ||
            unwrapped.type === utils_1.AST_NODE_TYPES.TSUndefinedKeyword ||
            unwrapped.type === utils_1.AST_NODE_TYPES.TSNullKeyword ||
            unwrapped.type === utils_1.AST_NODE_TYPES.TSVoidKeyword);
    };
    // Allow unions like boolean | undefined | null | void
    if (typeNode.type === utils_1.AST_NODE_TYPES.TSUnionType) {
        return typeNode.types.every((t) => isBooleanishUnionMember(t));
    }
    // Promise<boolean> (or Promise<boolean | undefined | null>)
    if (typeNode.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
        typeNode.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
        typeNode.typeName.name === 'Promise' &&
        typeNode.typeParameters?.params?.length) {
        const inner = typeNode.typeParameters.params[0];
        if (!inner)
            return false;
        const resolvedInner = unwrapTypeNode(inner);
        if (isBooleanishUnionMember(resolvedInner))
            return true;
        const innerType = resolvedInner;
        if (innerType.type === utils_1.AST_NODE_TYPES.TSUnionType &&
            Array.isArray(innerType.types) &&
            innerType.types.every((t) => isBooleanishUnionMember(t))) {
            return true;
        }
    }
    return false;
}
function isExpressionBooleanLike(expr) {
    switch (expr.type) {
        case utils_1.AST_NODE_TYPES.Literal:
            return typeof expr.value === 'boolean' ? true : 'non';
        case utils_1.AST_NODE_TYPES.TemplateLiteral:
            return 'non';
        case utils_1.AST_NODE_TYPES.ObjectExpression:
        case utils_1.AST_NODE_TYPES.ArrayExpression:
        case utils_1.AST_NODE_TYPES.NewExpression:
        case utils_1.AST_NODE_TYPES.ClassExpression:
        case utils_1.AST_NODE_TYPES.FunctionExpression:
        case utils_1.AST_NODE_TYPES.ArrowFunctionExpression:
            return 'non';
        case utils_1.AST_NODE_TYPES.UnaryExpression:
            if (expr.operator === '!')
                return true; // !x or !!x
            if (expr.operator === 'void')
                return 'non';
            return 'unknown';
        case utils_1.AST_NODE_TYPES.BinaryExpression: {
            const cmp = ['===', '!==', '==', '!=', '>', '<', '>=', '<='];
            return cmp.includes(expr.operator) ? true : 'unknown';
        }
        case utils_1.AST_NODE_TYPES.LogicalExpression:
            // && and || often return non-boolean operands; don't infer true
            return 'unknown';
        case utils_1.AST_NODE_TYPES.MemberExpression: {
            if (expr.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                expr.property.name === 'length') {
                return 'non';
            }
            return 'unknown';
        }
        case utils_1.AST_NODE_TYPES.ConditionalExpression: {
            const cons = isExpressionBooleanLike(expr.consequent);
            const alt = isExpressionBooleanLike(expr.alternate);
            if (cons === true && alt === true)
                return true;
            if (cons === 'non' || alt === 'non')
                return 'non';
            return 'unknown';
        }
        case utils_1.AST_NODE_TYPES.CallExpression: {
            if (expr.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                expr.callee.name === 'Boolean') {
                return true;
            }
            return 'unknown';
        }
        case utils_1.AST_NODE_TYPES.Identifier:
            if (expr.name === 'undefined')
                return 'non';
            return 'unknown';
        case utils_1.AST_NODE_TYPES.AwaitExpression:
            return 'unknown';
        default:
            return 'unknown';
    }
}
function getReturnTypeNode(node) {
    if (node.returnType?.typeAnnotation)
        return node.returnType.typeAnnotation;
    return undefined;
}
function hasTypePredicate(node) {
    return (node.returnType?.typeAnnotation?.type === utils_1.AST_NODE_TYPES.TSTypePredicate);
}
function collectReturnExpressions(fn) {
    const results = [];
    const visited = new Set();
    function visit(n) {
        if (!n || visited.has(n))
            return;
        visited.add(n);
        // Do not traverse into nested functions/classes
        if (n.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            n.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            n.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            n.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            n.type === utils_1.AST_NODE_TYPES.ClassExpression) {
            if (n === fn) {
                // traverse this function's body
                // continue
            }
            else {
                return;
            }
        }
        if (n.type === utils_1.AST_NODE_TYPES.ReturnStatement) {
            if (n.argument && n.argument.type) {
                results.push(n.argument);
            }
            else {
                // return; without value
                // Represent as Identifier 'undefined' to treat as non-boolean
                // We won't push undefined, but handle later by a flag
                results.noValueReturn = true;
            }
        }
        for (const key of Object.keys(n)) {
            if (key === 'parent' || key === 'range' || key === 'loc')
                continue;
            const value = n[key];
            if (!value)
                continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child === 'object' && 'type' in child)
                        visit(child);
                }
            }
            else if (value && typeof value === 'object' && 'type' in value) {
                visit(value);
            }
        }
    }
    if (fn.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression && fn.expression) {
        // expression-bodied arrow function: synthesize a return
        const bodyExpr = fn.body;
        results.push(bodyExpr);
        return results;
    }
    if (fn.body && fn.body.type === utils_1.AST_NODE_TYPES.BlockStatement)
        visit(fn.body);
    return results;
}
exports.noMisleadingBooleanPrefixes = (0, createRule_1.createRule)({
    name: 'no-misleading-boolean-prefixes',
    meta: {
        type: 'problem',
        docs: {
            description: 'Reserve boolean-style prefixes (is/has/should) for functions that actually return boolean values to avoid misleading call sites.',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    prefixes: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            nonBooleanReturn: 'Function "{{name}}" uses a boolean-style prefix but its return value is not guaranteed to be boolean. Boolean prefixes promise a yes/no answer; returning strings, objects, or void misleads callers and hides incorrect branching. Return a real boolean (e.g., add an explicit comparison or Boolean(...)) or rename the function to drop the boolean-style prefix (prefixes treated as boolean: {{prefixes}}).',
        },
    },
    defaultOptions: [{ prefixes: DEFAULT_PREFIXES }],
    create(context, [options]) {
        const prefixes = (options && options.prefixes) || DEFAULT_PREFIXES;
        function shouldCheckName(name) {
            return startsWithBooleanPrefix(name, prefixes);
        }
        function report(node, name) {
            context.report({
                node,
                messageId: 'nonBooleanReturn',
                data: { name, prefixes: prefixes.join(', ') },
            });
        }
        function checkFunctionLike(node, name, reportNode) {
            if (!shouldCheckName(name))
                return;
            // Type predicate allows boolean-like
            if (hasTypePredicate(node))
                return;
            const typeNode = getReturnTypeNode(node);
            if (typeNode) {
                if (isTsBooleanLike(typeNode))
                    return;
                // Explicit non-boolean annotation
                report(reportNode, name);
                return;
            }
            const returns = collectReturnExpressions(node);
            const noValueReturn = returns.noValueReturn === true;
            if (noValueReturn) {
                report(reportNode, name);
                return;
            }
            if (returns.length === 0) {
                // No returns implies void
                report(reportNode, name);
                return;
            }
            for (const expr of returns) {
                const kind = isExpressionBooleanLike(expr);
                if (kind === 'non') {
                    report(reportNode, name);
                    return;
                }
            }
            // If we can't determine it's non-boolean, do not report to avoid false positives
        }
        return {
            FunctionDeclaration(node) {
                if (!node.id)
                    return;
                checkFunctionLike(node, node.id.name, node.id);
            },
            FunctionExpression(node) {
                // Prefer variable declarator or method/property name
                if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    checkFunctionLike(node, node.parent.id.name, node.parent.id);
                    return;
                }
                // If part of a property or method, let dedicated visitors handle it to avoid duplicates
                if (node.parent?.type === utils_1.AST_NODE_TYPES.Property)
                    return;
                if (node.parent?.type === utils_1.AST_NODE_TYPES.MethodDefinition)
                    return;
                if (node.id) {
                    checkFunctionLike(node, node.id.name, node.id);
                }
            },
            ArrowFunctionExpression(node) {
                if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    node.parent.id.type === utils_1.AST_NODE_TYPES.Identifier) {
                    checkFunctionLike(node, node.parent.id.name, node.parent.id);
                    return;
                }
                // If part of a property, let the Property visitor handle it to avoid duplicates
                if (node.parent?.type === utils_1.AST_NODE_TYPES.Property)
                    return;
            },
            MethodDefinition(node) {
                if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                const name = node.key.name;
                const fn = node.value;
                if (fn.type === utils_1.AST_NODE_TYPES.TSEmptyBodyFunctionExpression)
                    return;
                checkFunctionLike(fn, name, node.key);
            },
            Property(node) {
                if (node.key.type !== utils_1.AST_NODE_TYPES.Identifier)
                    return;
                if (node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
                    node.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                    checkFunctionLike(node.value, node.key.name, node.key);
                }
            },
        };
    },
});
//# sourceMappingURL=no-misleading-boolean-prefixes.js.map