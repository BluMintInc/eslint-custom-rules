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
const isArrayMethodName = (value) => exports.ARRAY_METHODS.includes(value);
exports.arrayMethodsThisContext = (0, createRule_1.createRule)({
    create(context) {
        const sourceCode = context.getSourceCode();
        return {
            CallExpression(node) {
                if (node.callee.type !== 'MemberExpression') {
                    return;
                }
                const property = node.callee.property;
                if (property.type !== 'Identifier') {
                    return;
                }
                if (!isArrayMethodName(property.name)) {
                    return;
                }
                const [firstArg] = node.arguments;
                // Array method called with a class method reference
                if (firstArg &&
                    firstArg.type === 'MemberExpression' &&
                    firstArg.object.type === 'ThisExpression') {
                    const methodProperty = firstArg.property;
                    const methodAccessor = firstArg.computed
                        ? `[${sourceCode.getText(methodProperty)}]`
                        : methodProperty.type === 'Identifier'
                            ? `.${methodProperty.name}`
                            : methodProperty.type === 'PrivateIdentifier'
                                ? `.#${methodProperty.name}`
                                : `.${sourceCode.getText(methodProperty)}`;
                    const methodReference = `this${methodAccessor}`;
                    context.report({
                        node: firstArg,
                        messageId: 'unexpected',
                        data: {
                            arrayMethod: property.name,
                            methodAccessor,
                            methodReference,
                        },
                    });
                    return;
                }
                // Function expression bound to `this` in array method
                if (firstArg &&
                    firstArg.type === 'CallExpression' &&
                    firstArg.callee.type === 'MemberExpression' &&
                    firstArg.callee.object.type === 'FunctionExpression' &&
                    firstArg.callee.property.type === 'Identifier' &&
                    firstArg.callee.property.name === 'bind' &&
                    firstArg.arguments.length > 0 &&
                    firstArg.arguments[0].type === 'ThisExpression') {
                    context.report({
                        node: firstArg,
                        messageId: 'preferArrow',
                        data: {
                            arrayMethod: property.name,
                        },
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
            unexpected: 'Array method "{{arrayMethod}}" receives the class method reference {{methodReference}}, which strips its "this" binding when the callback runs. Use an arrow callback so the class instance remains available, e.g. {{arrayMethod}}((item) => this{{methodAccessor}}(item)).',
            preferArrow: 'Array method "{{arrayMethod}}" binds a callback with ".bind(this)", which allocates a new function and hides that the code depends on the class instance. Prefer an arrow callback that captures "this" without rebinding, e.g. {{arrayMethod}}((item) => this.handleItem(item)).',
        },
    },
    defaultOptions: [],
});
//# sourceMappingURL=array-methods-this-context.js.map