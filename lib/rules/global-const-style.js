"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const isUpperSnakeCase = (str) => /^[A-Z][A-Z0-9_]*$/.test(str);
exports.default = (0, createRule_1.createRule)({
    name: 'global-const-style',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce UPPER_SNAKE_CASE and as const for global static constants',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            upperSnakeCase: 'Global constants should be in UPPER_SNAKE_CASE',
            asConst: 'Global constants should use "as const"',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            VariableDeclaration(node) {
                // Only check top-level const declarations
                if (node.kind !== 'const') {
                    return;
                }
                // Skip if not at program level
                if (node.parent?.type !== utils_1.AST_NODE_TYPES.Program) {
                    return;
                }
                // Skip if any declaration is a function component or arrow function
                const shouldSkip = node.declarations.some(declaration => {
                    if (declaration.id.type !== utils_1.AST_NODE_TYPES.Identifier) {
                        return false;
                    }
                    const name = declaration.id.name;
                    const init = declaration.init;
                    return (
                    // Skip function components (uppercase name + arrow function)
                    (/^[A-Z]/.test(name) && init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) ||
                        // Skip any arrow function
                        init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression);
                });
                if (shouldSkip) {
                    return;
                }
                node.declarations.forEach((declaration) => {
                    // Skip destructuring patterns
                    if (declaration.id.type !== utils_1.AST_NODE_TYPES.Identifier) {
                        return;
                    }
                    const { name } = declaration.id;
                    const init = declaration.init;
                    // Skip if no initializer or if it's a dynamic value
                    if (!init ||
                        init.type === utils_1.AST_NODE_TYPES.CallExpression ||
                        init.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                        return;
                    }
                    // Check for UPPER_SNAKE_CASE
                    if (!isUpperSnakeCase(name)) {
                        context.report({
                            node: declaration.id,
                            messageId: 'upperSnakeCase',
                            fix(fixer) {
                                const newName = name
                                    .replace(/([A-Z])/g, '_$1')
                                    .toUpperCase()
                                    .replace(/^_/, '');
                                return fixer.replaceText(declaration.id, newName);
                            },
                        });
                    }
                    // Check for as const
                    const isAsConstExpression = (node) => {
                        if (node.type === utils_1.AST_NODE_TYPES.TSAsExpression) {
                            return (node.typeAnnotation?.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                                node.typeAnnotation?.typeName?.name === 'const');
                        }
                        return false;
                    };
                    const shouldHaveAsConst = (node) => {
                        // Skip if it's already an as const expression
                        if (isAsConstExpression(node)) {
                            return false;
                        }
                        // Check if it's a literal, array, or object that should have as const
                        return (node.type === utils_1.AST_NODE_TYPES.Literal ||
                            node.type === utils_1.AST_NODE_TYPES.ArrayExpression ||
                            node.type === utils_1.AST_NODE_TYPES.ObjectExpression);
                    };
                    if (shouldHaveAsConst(init)) {
                        context.report({
                            node: init,
                            messageId: 'asConst',
                            fix(fixer) {
                                const sourceCode = context.getSourceCode();
                                const initText = sourceCode.getText(init);
                                return fixer.replaceText(init, `${initText} as const`);
                            },
                        });
                    }
                });
            },
        };
    },
});
//# sourceMappingURL=global-const-style.js.map