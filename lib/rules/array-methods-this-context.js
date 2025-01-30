"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrayMethodsThisContext = exports.ARRAY_METHODS = void 0;
const createRule_1 = require("../utils/createRule");
exports.ARRAY_METHODS = [
    'map',
    'filter',
    'forEach',
    'reduce',
    'some',
    'every',
];
exports.arrayMethodsThisContext = (0, createRule_1.createRule)({
    create(context) {
        return {
            CallExpression(node) {
                // Array method called with a class method reference
                if (node.callee.type === 'MemberExpression' &&
                    node.callee.property.type === 'Identifier' &&
                    exports.ARRAY_METHODS.includes(node.callee.property.name) &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === 'MemberExpression' &&
                    node.arguments[0].object.type === 'ThisExpression') {
                    context.report({
                        node: node.arguments[0],
                        messageId: 'unexpected',
                    });
                }
                // Function expression bound to `this` in array method
                else if (node.callee.type === 'MemberExpression' &&
                    node.callee.property.type === 'Identifier' &&
                    exports.ARRAY_METHODS.includes(node.callee.property.name) &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === 'CallExpression' &&
                    node.arguments[0].callee.type === 'MemberExpression' &&
                    node.arguments[0].callee.object.type === 'FunctionExpression' &&
                    node.arguments[0].callee.property.type === 'Identifier' &&
                    node.arguments[0].callee.property.name === 'bind' &&
                    node.arguments[0].arguments.length > 0 &&
                    node.arguments[0].arguments[0].type === 'ThisExpression') {
                    context.report({
                        node: node.arguments[0],
                        messageId: 'preferArrow',
                    });
                }
            },
        };
    },
    name: 'array-methods-this-context',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent misuse of Array methods in OOP',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unexpected: 'Use an arrow function to preserve "this" context in array methods. Instead of `array.map(this.method)`, use `array.map((x) => this.method(x))`.',
            preferArrow: 'Use an arrow function instead of binding "this". Instead of `array.map(function(x) {}.bind(this))`, use `array.map((x) => {...})`.',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=array-methods-this-context.js.map