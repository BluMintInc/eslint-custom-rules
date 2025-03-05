"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnnecessaryDestructuring = void 0;
const createRule_1 = require("../utils/createRule");
exports.noUnnecessaryDestructuring = (0, createRule_1.createRule)({
    name: 'no-unnecessary-destructuring',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Avoid unnecessary object destructuring when there is only one property inside the destructured object',
            recommended: 'error',
        },
        messages: {
            noUnnecessaryDestructuring: 'Avoid unnecessary object destructuring with a single rest property. Use the object directly instead of `{ ...obj }`.',
        },
        schema: [],
        fixable: 'code',
    },
    defaultOptions: [],
    create(context) {
        return {
            // Handle variable declarations
            VariableDeclarator(node) {
                if (node.id.type === 'ObjectPattern' &&
                    node.id.properties.length === 1 &&
                    node.id.properties[0].type === 'RestElement') {
                    const restElement = node.id.properties[0];
                    // Report the issue
                    context.report({
                        node,
                        messageId: 'noUnnecessaryDestructuring',
                        fix(fixer) {
                            const sourceCode = context.getSourceCode();
                            const restName = sourceCode.getText(restElement.argument);
                            // Handle the case where init might be null
                            if (!node.init) {
                                return null;
                            }
                            const initText = sourceCode.getText(node.init);
                            // Replace the destructuring with direct assignment
                            return fixer.replaceText(node, `${restName} = ${initText}`);
                        },
                    });
                }
            },
            // Handle assignments like { ...obj } = value
            AssignmentExpression(node) {
                if (node.operator === '=' &&
                    node.left.type === 'ObjectPattern' &&
                    node.left.properties.length === 1 &&
                    node.left.properties[0].type === 'RestElement') {
                    const restElement = node.left.properties[0];
                    context.report({
                        node,
                        messageId: 'noUnnecessaryDestructuring',
                        fix(fixer) {
                            const sourceCode = context.getSourceCode();
                            const restName = sourceCode.getText(restElement.argument);
                            const rightText = sourceCode.getText(node.right);
                            // Replace the destructuring with direct assignment
                            return fixer.replaceText(node, `${restName} = ${rightText}`);
                        },
                    });
                }
            }
        };
    },
});
//# sourceMappingURL=no-unnecessary-destructuring.js.map