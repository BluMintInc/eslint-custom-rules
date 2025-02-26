"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceObjectLiteralAsConst = void 0;
const createRule_1 = require("../utils/createRule");
exports.enforceObjectLiteralAsConst = (0, createRule_1.createRule)({
    name: 'enforce-object-literal-as-const',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce that object literals returned from functions should be marked with `as const` to ensure type safety and immutability.',
            recommended: 'error',
        },
        fixable: 'code',
        messages: {
            enforceAsConst: 'Object literals returned from functions should be marked with `as const` to ensure type safety and immutability',
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        return {
            ReturnStatement(node) {
                // Skip if there's no argument in the return statement
                if (!node.argument) {
                    return;
                }
                // Check if the return statement is inside a function
                const sourceCode = context.getSourceCode();
                // Use context.getAncestors() for now, but note it's deprecated
                // We'll need to update this when upgrading to ESLint v9
                const ancestors = context.getAncestors();
                const isInFunction = ancestors.some((ancestor) => ancestor.type === 'FunctionDeclaration' ||
                    ancestor.type === 'ArrowFunctionExpression' ||
                    ancestor.type === 'FunctionExpression' ||
                    ancestor.type === 'MethodDefinition');
                if (!isInFunction) {
                    return;
                }
                // Check if the return value is an object or array literal
                const { argument } = node;
                // Skip if the return value already has 'as const' assertion
                if (argument.type === 'TSAsExpression') {
                    const tsAsExpression = argument;
                    // Check if the type annotation is 'const'
                    if (tsAsExpression.typeAnnotation.type === 'TSTypeReference' &&
                        tsAsExpression.typeAnnotation.typeName.type === 'Identifier' &&
                        tsAsExpression.typeAnnotation.typeName.name === 'const') {
                        return;
                    }
                    // If it has another type assertion but not 'as const', we still need to check
                    // if the expression is an object/array literal
                    if (tsAsExpression.expression.type !== 'ObjectExpression' &&
                        tsAsExpression.expression.type !== 'ArrayExpression') {
                        return;
                    }
                }
                else if (argument.type !== 'ObjectExpression' &&
                    argument.type !== 'ArrayExpression') {
                    // Skip if not an object/array literal and not a type assertion
                    return;
                }
                // Skip if the return value uses spread operator
                if ((argument.type === 'ObjectExpression' &&
                    argument.properties.some((prop) => prop.type === 'SpreadElement')) ||
                    (argument.type === 'ArrayExpression' &&
                        argument.elements.some((elem) => elem !== null && elem.type === 'SpreadElement'))) {
                    return;
                }
                // Report the issue and provide a fix
                context.report({
                    node,
                    messageId: 'enforceAsConst',
                    fix(fixer) {
                        const text = sourceCode.getText(argument);
                        // If it's already a type assertion but not 'as const'
                        if (argument.type === 'TSAsExpression') {
                            // Get the expression part (before the 'as')
                            const expressionText = sourceCode.getText(argument.expression);
                            return fixer.replaceText(argument, `${expressionText} as const`);
                        }
                        return fixer.replaceText(argument, `${text} as const`);
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-object-literal-as-const.js.map