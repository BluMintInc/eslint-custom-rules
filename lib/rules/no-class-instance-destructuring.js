"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noClassInstanceDestructuring = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noClassInstanceDestructuring = (0, createRule_1.createRule)({
    name: 'no-class-instance-destructuring',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow destructuring of class instances to prevent loss of `this` context',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            noClassInstanceDestructuring: 'Avoid destructuring class instances as it can lead to loss of `this` context. Use direct property access instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        function isClassInstance(node) {
            // Check for new expressions
            if (node.type === utils_1.AST_NODE_TYPES.NewExpression) {
                return true;
            }
            // Check for identifiers that might be class instances
            if (node.type === utils_1.AST_NODE_TYPES.Identifier) {
                const variableDef = context
                    .getScope()
                    .variables.find((variableDef) => variableDef.name === node.name);
                if (variableDef?.defs[0]?.node.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                    const init = variableDef.defs[0].node
                        .init;
                    return init?.type === utils_1.AST_NODE_TYPES.NewExpression;
                }
            }
            return false;
        }
        return {
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                    node.init &&
                    isClassInstance(node.init)) {
                    const objectPattern = node.id;
                    context.report({
                        node,
                        messageId: 'noClassInstanceDestructuring',
                        fix(fixer) {
                            const sourceCode = context.getSourceCode();
                            const properties = objectPattern.properties;
                            // Skip if there's no init expression
                            if (!node.init)
                                return null;
                            // For single property, use simple replacement
                            if (properties.length === 1) {
                                const prop = properties[0];
                                if (prop.type === utils_1.AST_NODE_TYPES.Property) {
                                    const key = prop.key.type === utils_1.AST_NODE_TYPES.Identifier
                                        ? prop.key.name
                                        : sourceCode.getText(prop.key);
                                    const value = prop.value.type === utils_1.AST_NODE_TYPES.Identifier
                                        ? prop.value.name
                                        : sourceCode.getText(prop.value);
                                    const initText = sourceCode.getText(node.init);
                                    return fixer.replaceText(node, `${value} = ${initText}.${key}`);
                                }
                                return null;
                            }
                            // For multiple properties, create multiple declarations
                            const declarations = properties
                                .filter((prop) => prop.type === utils_1.AST_NODE_TYPES.Property)
                                .map((prop) => {
                                const key = prop.key.type === utils_1.AST_NODE_TYPES.Identifier
                                    ? prop.key.name
                                    : sourceCode.getText(prop.key);
                                const value = prop.value.type === utils_1.AST_NODE_TYPES.Identifier
                                    ? prop.value.name
                                    : sourceCode.getText(prop.value);
                                const initText = sourceCode.getText(node.init);
                                return `${value} = ${initText}.${key}`;
                            })
                                .join(';\nconst ');
                            // Only apply the fix if we have valid declarations
                            if (!declarations)
                                return null;
                            return fixer.replaceText(node, declarations);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-class-instance-destructuring.js.map