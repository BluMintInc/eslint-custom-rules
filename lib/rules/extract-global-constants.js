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
                // Only check function/block scoped constants without dependencies
                if (!hasDependencies &&
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
        };
    },
    name: 'extract-global-constants',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Extract static constants and functions to the global scope when possible',
            recommended: 'error',
        },
        schema: [],
        messages: {
            extractGlobalConstants: 'Move this declaration {{ declarationName }} to the global scope and rename it to UPPER_SNAKE_CASE if necessary.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=extract-global-constants.js.map