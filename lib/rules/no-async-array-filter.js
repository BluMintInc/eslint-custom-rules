"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noAsyncArrayFilter = void 0;
const createRule_1 = require("../utils/createRule");
exports.noAsyncArrayFilter = (0, createRule_1.createRule)({
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type === 'MemberExpression' &&
                    node.callee.property.type === 'Identifier' &&
                    node.callee.property.name === 'filter' &&
                    node.arguments.length > 0) {
                    const callback = node.arguments[0];
                    if ((callback.type === 'FunctionExpression' ||
                        callback.type === 'ArrowFunctionExpression') &&
                        callback.async === true) {
                        context.report({
                            node: callback,
                            messageId: 'unexpected',
                            data: {
                                methodName: node.callee.property.name,
                            },
                        });
                    }
                }
            },
        };
    },
    name: 'no-async-array-filter',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow async callbacks in Array.filter(). Async predicates return Promises that are always truthy to the filter, so no element is ever removed. Resolve async checks first (Promise.all + map) or use a synchronous predicate to decide which items to keep.',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Async predicate in {{methodName}} keeps every element because Array.filter does not await Promises, so the returned Promise is always treated as truthy. Resolve the async checks before filtering (e.g., const results = await Promise.all(items.map(check)); const filtered = items.filter((_, i) => results[i]);) or switch to a synchronous predicate.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=no-async-array-filter.js.map