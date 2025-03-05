"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGlobalConstants = void 0;
const ASTHelpers_1 = require("../utils/ASTHelpers");
const createRule_1 = require("../utils/createRule");
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
function isImmutableValue(node) {
    if (!node)
        return false;
    switch (node.type) {
        case 'Literal':
            return true;
        case 'TemplateLiteral':
            return node.expressions.length === 0;
        case 'UnaryExpression':
            return isImmutableValue(node.argument);
        case 'BinaryExpression':
            if (node.left.type === 'PrivateIdentifier')
                return false;
            return isImmutableValue(node.left) && isImmutableValue(node.right);
        default:
            return false;
    }
}
function isMutableValue(node) {
    if (!node)
        return false;
    // Check for JSX elements (always mutable due to props/context)
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        return true;
    }
    // Check for object expressions (always mutable)
    if (node.type === 'ObjectExpression') {
        return true;
    }
    // Check array literals - mutable if empty or if they contain mutable values
    if (node.type === 'ArrayExpression') {
        // Empty arrays are mutable since they can be modified later
        if (node.elements.length === 0)
            return true;
        // Arrays with spread elements are mutable
        if (node.elements.some(element => !element || element.type === 'SpreadElement'))
            return true;
        // Arrays with non-immutable values are mutable
        return node.elements.some(element => !isImmutableValue(element));
    }
    // Check for new expressions (e.g., new Map(), new Set())
    if (node.type === 'NewExpression') {
        return true;
    }
    // Check for array/object methods that return mutable values
    if (node.type === 'CallExpression') {
        const callee = node.callee;
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
                'fill'
            ];
            return mutatingMethods.includes(methodName);
        }
    }
    return false;
}
function isNumericLiteral(node) {
    if (!node)
        return false;
    return node.type === 'Literal' && typeof node.value === 'number';
}
function isZeroOrOne(node) {
    if (!isNumericLiteral(node))
        return false;
    const value = node.value;
    return value === 0 || value === 1;
}
function isAsConstExpression(node) {
    if (!node)
        return false;
    if (node.type === 'TSAsExpression') {
        if (node.typeAnnotation.type === 'TSTypeReference' &&
            node.typeAnnotation.typeName.type === 'Identifier' &&
            node.typeAnnotation.typeName.name === 'const') {
            return true;
        }
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
                    isInsideFunction(node)) {
                    const constName = node.declarations[0].id
                        .name;
                    context.report({
                        node,
                        messageId: 'extractGlobalConstants',
                        data: {
                            declarationName: constName,
                        },
                    });
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
                        if (decl.init && isNumericLiteral(decl.init) && !isZeroOrOne(decl.init) && !isAsConstExpression(decl.init)) {
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
                    if (isNumericLiteral(node.test.right) && !isZeroOrOne(node.test.right) && !isAsConstExpression(node.test.right)) {
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
                        if (node.update.right && isNumericLiteral(node.update.right) && !isZeroOrOne(node.update.right) && !isAsConstExpression(node.update.right)) {
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
                        if (isNumericLiteral(node.update.right) && !isZeroOrOne(node.update.right) && !isAsConstExpression(node.update.right)) {
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
                    if (isNumericLiteral(node.test.right) && !isZeroOrOne(node.test.right) && !isAsConstExpression(node.test.right)) {
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
                    if (isNumericLiteral(node.test.right) && !isZeroOrOne(node.test.right) && !isAsConstExpression(node.test.right)) {
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