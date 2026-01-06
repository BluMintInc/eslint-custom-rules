"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnnecessaryDestructuring = void 0;
const createRule_1 = require("../utils/createRule");
exports.noUnnecessaryDestructuring = (0, createRule_1.createRule)({
    name: 'no-unnecessary-destructuring',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Avoid object patterns that only spread an existing object, since they clone the whole value without selecting properties',
            recommended: 'error',
        },
        messages: {
            noUnnecessaryDestructuring: 'Destructuring only the rest of "{{source}}" into "{{target}}" just clones the entire object. The shallow copy adds allocations and hides that you keep every property unchanged. Assign the object directly instead, for example `{{target}} = {{source}}`.',
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
                    const sourceCode = context.getSourceCode();
                    const restElement = node.id.properties[0];
                    // Report the issue
                    context.report({
                        node,
                        messageId: 'noUnnecessaryDestructuring',
                        data: {
                            target: sourceCode.getText(restElement.argument),
                            source: node.init
                                ? sourceCode.getText(node.init)
                                : 'the source object',
                        },
                        fix(fixer) {
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
                    const sourceCode = context.getSourceCode();
                    const restElement = node.left.properties[0];
                    context.report({
                        node,
                        messageId: 'noUnnecessaryDestructuring',
                        data: {
                            target: sourceCode.getText(restElement.argument),
                            source: sourceCode.getText(node.right),
                        },
                        fix(fixer) {
                            const restName = sourceCode.getText(restElement.argument);
                            const rightText = sourceCode.getText(node.right);
                            // Replace the destructuring with direct assignment
                            return fixer.replaceText(node, `${restName} = ${rightText}`);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-unnecessary-destructuring.js.map