"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceMemoizeAsync = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceMemoizeAsync = (0, createRule_1.createRule)({
    name: 'enforce-memoize-async',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce @Memoize() decorator on async methods with 0-1 parameters',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            requireMemoize: 'Async methods with 0-1 parameters should be decorated with @Memoize()',
        },
    },
    defaultOptions: [],
    create(context) {
        let hasMemoizeImport = false;
        let memoizeAlias = 'Memoize';
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'typescript-memoize') {
                    const memoizeSpecifier = node.specifiers.find(spec => spec.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                        spec.imported.name === 'Memoize');
                    if (memoizeSpecifier) {
                        hasMemoizeImport = true;
                        if (memoizeSpecifier.local) {
                            memoizeAlias = memoizeSpecifier.local.name;
                        }
                    }
                }
            },
            MethodDefinition(node) {
                // Only process async methods
                if (node.value.type !== utils_1.AST_NODE_TYPES.FunctionExpression || !node.value.async) {
                    return;
                }
                // Skip methods with more than one parameter
                if (node.value.params.length > 1) {
                    return;
                }
                // Check if method already has @Memoize decorator
                const hasDecorator = node.decorators?.some(decorator => {
                    if (decorator.expression.type !== utils_1.AST_NODE_TYPES.CallExpression) {
                        return false;
                    }
                    const callee = decorator.expression.callee;
                    return (callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        callee.name === memoizeAlias);
                });
                if (!hasDecorator && hasMemoizeImport) {
                    context.report({
                        node,
                        messageId: 'requireMemoize',
                        fix(fixer) {
                            // Add import if needed
                            // Add decorator
                            return fixer.insertTextBefore(node, `@${memoizeAlias}()\n${' '.repeat(node.loc.start.column)}`);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-memoize-async.js.map