"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGlobalConstants = void 0;
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
const utils_1 = require("@typescript-eslint/utils");
function isInsideFunction(node) {
    let current = node;
    while (current) {
        if (current.type === 'FunctionDeclaration' ||
            current.type === 'FunctionExpression' ||
            current.type === 'ArrowFunctionExpression') {
            return true;
        }
        current = current.parent;
    }
    return false;
}
function isFunctionDefinition(node) {
    return (node?.type === 'FunctionExpression' ||
        node?.type === 'ArrowFunctionExpression');
}
const unwrapOnce = (node) => {
    if (!node)
        return null;
    const maybeParen = node;
    if (maybeParen.type === 'ParenthesizedExpression') {
        return maybeParen.expression ?? null;
    }
    switch (node.type) {
        case utils_1.AST_NODE_TYPES.TSAsExpression:
        case utils_1.AST_NODE_TYPES.TSSatisfiesExpression:
        case utils_1.AST_NODE_TYPES.TSNonNullExpression:
        case utils_1.AST_NODE_TYPES.ChainExpression:
        case utils_1.AST_NODE_TYPES.TSTypeAssertion:
            return node.expression;
        default:
            return null;
    }
};
function unwrapExpression(node) {
    let current = node;
    while (current) {
        const inner = unwrapOnce(current);
        if (!inner)
            break;
        current = inner;
    }
    return current;
}
function isMutableValue(node) {
    const unwrapped = unwrapExpression(node);
    if (!unwrapped)
        return false;
    // If explicitly marked readonly with `as const`, treat as immutable
    if (node && isAsConstExpression(node)) {
        return false;
    }
    // Check for JSX elements (always mutable due to props/context)
    if (unwrapped.type === 'JSXElement' || unwrapped.type === 'JSXFragment') {
        return true;
    }
    // Check for object expressions (always mutable)
    if (unwrapped.type === 'ObjectExpression') {
        return true;
    }
    // Arrays are mutable objects unless explicitly narrowed with `as const`.
    if (unwrapped.type === 'ArrayExpression') {
        return true;
    }
    // Check for new expressions (e.g., new Map(), new Set())
    if (unwrapped.type === 'NewExpression') {
        return true;
    }
    // Check for array/object methods that return mutable values
    if (unwrapped.type === 'CallExpression') {
        const callee = unwrapped.callee;
        if (callee.type === 'MemberExpression') {
            // Handle both Identifier and non-Identifier property nodes
            if (callee.property.type !== 'Identifier') {
                return false;
            }
            const methodName = callee.property.name;
            const mutatingMethods = [
                'slice',
                'map',
                'filter',
                'concat',
                'from',
                'reduce',
                'flatMap',
                'splice',
                'reverse',
                'sort',
                'fill',
            ];
            return mutatingMethods.includes(methodName);
        }
    }
    return false;
}
function isNumericLiteral(node) {
    if (!node)
        return false;
    return (node.type === 'Literal' &&
        typeof node.value === 'number');
}
function isZeroOrOne(node) {
    if (!isNumericLiteral(node))
        return false;
    const value = node.value;
    return value === 0 || value === 1;
}
function isAsConstExpression(node) {
    let current = node;
    while (current) {
        if (current.type === 'TSAsExpression' &&
            current.typeAnnotation.type === 'TSTypeReference' &&
            current.typeAnnotation.typeName.type === 'Identifier' &&
            current.typeAnnotation.typeName.name === 'const') {
            return true;
        }
        current = unwrapOnce(current);
    }
    return false;
}
exports.extractGlobalConstants = (0, createRule_1.createRule)({
    create(context) {
        return {
            VariableDeclaration(node) {
                if (node.kind !== 'const') {
                    return;
                }
                // Skip if any of the declarations are function definitions or mutable values
                if (node.declarations.some((d) => isFunctionDefinition(d.init) || isMutableValue(d.init))) {
                    return;
                }
                const scope = context.getScope();
                const hasDependencies = node.declarations.some((declaration) => declaration.init &&
                    ASTHelpers_1.ASTHelpers.declarationIncludesIdentifier(declaration.init));
                // Skip constants with 'as const' type assertions used in loops
                const hasAsConstAssertion = node.declarations.some((declaration) => declaration.init && isAsConstExpression(declaration.init));
                // Only check function/block scoped constants without dependencies
                if (!hasDependencies &&
                    !hasAsConstAssertion &&
                    (scope.type === 'function' || scope.type === 'block') &&
                    isInsideFunction(node) &&
                    node.declarations.some((d) => d.id.type === 'Identifier')) {
                    for (const d of node.declarations) {
                        if (d.id.type !== 'Identifier')
                            continue;
                        const constName = d.id.name;
                        context.report({
                            node: d,
                            messageId: 'extractGlobalConstants',
                            data: { declarationName: constName },
                        });
                    }
                }
            },
            FunctionDeclaration(node) {
                if (node.parent &&
                    (node.parent.type === 'FunctionDeclaration' ||
                        node.parent.type === 'FunctionExpression' ||
                        node.parent.type === 'ArrowFunctionExpression')) {
                    const scope = context.getScope();
                    const hasDependencies = ASTHelpers_1.ASTHelpers.blockIncludesIdentifier(node.body);
                    if (!hasDependencies && scope.type === 'function') {
                        const funcName = node.id?.name;
                        context.report({
                            node,
                            messageId: 'extractGlobalConstants',
                            data: {
                                declarationName: funcName,
                            },
                        });
                    }
                }
            },
            ForStatement(node) {
                // Check initialization
                if (node.init && node.init.type === 'VariableDeclaration') {
                    for (const decl of node.init.declarations) {
                        if (decl.init &&
                            isNumericLiteral(decl.init) &&
                            !isZeroOrOne(decl.init) &&
                            !isAsConstExpression(decl.init)) {
                            context.report({
                                node: decl.init,
                                messageId: 'requireAsConst',
                                data: {
                                    value: decl.init.value,
                                },
                            });
                        }
                    }
                }
                // Check test condition
                if (node.test && node.test.type === 'BinaryExpression') {
                    if (isNumericLiteral(node.test.right) &&
                        !isZeroOrOne(node.test.right) &&
                        !isAsConstExpression(node.test.right)) {
                        context.report({
                            node: node.test.right,
                            messageId: 'requireAsConst',
                            data: {
                                value: node.test.right.value,
                            },
                        });
                    }
                }
                // Check update expression
                if (node.update) {
                    if (node.update.type === 'AssignmentExpression') {
                        if (node.update.right &&
                            isNumericLiteral(node.update.right) &&
                            !isZeroOrOne(node.update.right) &&
                            !isAsConstExpression(node.update.right)) {
                            context.report({
                                node: node.update.right,
                                messageId: 'requireAsConst',
                                data: {
                                    value: node.update.right.value,
                                },
                            });
                        }
                    }
                    else if (node.update.type === 'BinaryExpression') {
                        if (isNumericLiteral(node.update.right) &&
                            !isZeroOrOne(node.update.right) &&
                            !isAsConstExpression(node.update.right)) {
                            context.report({
                                node: node.update.right,
                                messageId: 'requireAsConst',
                                data: {
                                    value: node.update.right.value,
                                },
                            });
                        }
                    }
                }
            },
            WhileStatement(node) {
                // Check test condition
                if (node.test.type === 'BinaryExpression') {
                    if (isNumericLiteral(node.test.right) &&
                        !isZeroOrOne(node.test.right) &&
                        !isAsConstExpression(node.test.right)) {
                        context.report({
                            node: node.test.right,
                            messageId: 'requireAsConst',
                            data: {
                                value: node.test.right.value,
                            },
                        });
                    }
                }
            },
            DoWhileStatement(node) {
                // Check test condition
                if (node.test.type === 'BinaryExpression') {
                    if (isNumericLiteral(node.test.right) &&
                        !isZeroOrOne(node.test.right) &&
                        !isAsConstExpression(node.test.right)) {
                        context.report({
                            node: node.test.right,
                            messageId: 'requireAsConst',
                            data: {
                                value: node.test.right.value,
                            },
                        });
                    }
                }
            },
        };
    },
    name: 'extract-global-constants',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Extract static constants and functions to the global scope when possible, and enforce type narrowing with as const for numeric literals in loops',
            recommended: 'error',
        },
        schema: [],
        messages: {
            extractGlobalConstants: 'Move this declaration {{ declarationName }} to the global scope and rename it to UPPER_SNAKE_CASE if necessary.',
            requireAsConst: 'Numeric literal {{ value }} in loop expression should be extracted to a constant with "as const" type assertion.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=extract-global-constants.js.map