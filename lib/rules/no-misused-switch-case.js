"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noMisusedSwitchCase = void 0;
const createRule_1 = require("../utils/createRule");
exports.noMisusedSwitchCase = (0, createRule_1.createRule)({
    name: 'no-misused-switch-case',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent misuse of logical OR (||) in switch case statements, which can lead to confusing and error-prone code. Instead of using OR operators in case expressions, use multiple case statements in sequence to handle multiple values. This improves code readability and follows the standard switch-case pattern.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            noMisusedSwitchCase: 'Avoid using logical OR (||) in switch case statements. Instead of `case x || y:`, use cascading cases like `case x: case y:`.',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            SwitchStatement(node) {
                for (const switchCase of node.cases) {
                    if (switchCase.test?.type === 'LogicalExpression' &&
                        switchCase.test.operator === '||') {
                        context.report({
                            node: switchCase,
                            messageId: 'noMisusedSwitchCase',
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=no-misused-switch-case.js.map