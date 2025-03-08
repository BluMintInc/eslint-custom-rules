"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genericStartsWithT = void 0;
const createRule_1 = require("../utils/createRule");
exports.genericStartsWithT = (0, createRule_1.createRule)({
    create(context) {
        return {
            TSTypeParameterDeclaration(node) {
                for (const param of node.params) {
                    if (typeof param.name.name === 'string' &&
                        param.name.name[0] !== 'T') {
                        context.report({
                            node: param,
                            messageId: 'genericStartsWithT',
                        });
                    }
                }
            },
        };
    },
    name: 'generic-starts-with-t',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce TypeScript generic types to start with T',
            recommended: 'error',
        },
        schema: [],
        messages: {
            genericStartsWithT: 'Generic type parameter should start with T.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=generic-starts-with-t.js.map