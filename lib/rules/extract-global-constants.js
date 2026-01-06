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
function analyzeDeclarator(declaration) {
    const init = declaration.init ?? null;
    const isFunctionOrMutable = isFunctionDefinition(init) || isMutableValue(init);
    return {
        isFunctionOrMutable,
        hasDependencies: !isFunctionOrMutable && init
            ? ASTHelpers_1.ASTHelpers.declarationIncludesIdentifier(init)
            : false,
        hasAsConstAssertion: !isFunctionOrMutable && init ? isAsConstExpression(init) : false,
        hasReportableIdentifier: declaration.id?.type === utils_1.AST_NODE_TYPES.Identifier &&
            !isFunctionOrMutable,
    };
}
exports.extractGlobalConstants = (0, createRule_1.createRule)({
    create(context) {
        return {
            VariableDeclaration(node) {
                if (node.kind !== 'const') {
                    return;
                }
                const declarations = node.declarations.filter((declaration) => declaration !== null && declaration !== undefined);
                if (declarations.length === 0) {
                    return;
                }
                let hasFunctionOrMutableValue = false;
                let hasDependencies = false;
                let hasAsConstAssertion = false;
                let hasReportableIdentifierDeclaration = false;
                for (const declaration of declarations) {
                    const analysis = analyzeDeclarator(declaration);
                    if (analysis.isFunctionOrMutable) {
                        hasFunctionOrMutableValue = true;
                        break;
                    }
                    hasDependencies ||= analysis.hasDependencies;
                    hasAsConstAssertion ||= analysis.hasAsConstAssertion;
                    hasReportableIdentifierDeclaration ||=
                        analysis.hasReportableIdentifier;
                }
                if (hasFunctionOrMutableValue) {
                    return;
                }
                const scope = context.getScope();
                // Only check function/block scoped constants without dependencies
                if (!hasDependencies &&
                    !hasAsConstAssertion &&
                    (scope.type === 'function' || scope.type === 'block') &&
                    isInsideFunction(node) &&
                    hasReportableIdentifierDeclaration) {
                    for (const declaration of declarations) {
                        if (declaration.id?.type !== utils_1.AST_NODE_TYPES.Identifier)
                            continue;
                        const constName = declaration.id.name;
                        context.report({
                            node: declaration,
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
            extractGlobalConstants: 'What\'s wrong: Declaration "{{declarationName}}" does not reference values from this scope.\nWhy it matters: Keeping it nested recreates the same constant/helper on every call, which adds avoidable allocations and obscures that the value can be shared.\nHow to fix: Hoist it to module scope (use UPPER_SNAKE_CASE for immutable constants) so it is created once and can be imported.',
            requireAsConst: 'What\'s wrong: Numeric literal {{value}} is used directly as a loop boundary.\nWhy it matters: Without "as const", TypeScript widens it to number, so if you later extract or reuse the value you lose the literal-type boundary and it is easier for related loops to drift out of sync.\nHow to fix: Extract it to a named constant with "as const" (or add "as const" inline) to keep the boundary explicit and reusable.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=extract-global-constants.js.map