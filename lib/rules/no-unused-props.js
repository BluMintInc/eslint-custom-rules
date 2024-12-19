"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnusedProps = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.noUnusedProps = (0, createRule_1.createRule)({
    name: 'no-unused-props',
    meta: {
        type: 'problem',
        docs: {
            description: 'Detect unused props in React component type definitions',
            recommended: 'error',
        },
        schema: [],
        messages: {
            unusedProp: 'Prop "{{propName}}" is defined in type but not used in component',
        },
        fixable: 'code',
    },
    defaultOptions: [],
    create(context) {
        const propsTypes = new Map();
        const usedProps = new Map();
        let currentComponent = null;
        return {
            TSTypeAliasDeclaration(node) {
                if (node.id.name.endsWith('Props')) {
                    if (node.typeAnnotation.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                        const props = {};
                        node.typeAnnotation.members.forEach((member) => {
                            if (member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                                member.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                                props[member.key.name] = member.key;
                            }
                        });
                        propsTypes.set(node.id.name, props);
                    }
                }
            },
            VariableDeclaration(node) {
                if (node.declarations.length === 1) {
                    const declaration = node.declarations[0];
                    if (declaration.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression) {
                        const param = declaration.init.params[0];
                        if (param?.type === utils_1.AST_NODE_TYPES.ObjectPattern &&
                            param.typeAnnotation?.typeAnnotation.type ===
                                utils_1.AST_NODE_TYPES.TSTypeReference &&
                            param.typeAnnotation.typeAnnotation.typeName.type ===
                                utils_1.AST_NODE_TYPES.Identifier) {
                            const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
                            if (typeName.endsWith('Props')) {
                                currentComponent = { node, typeName };
                                const used = new Set();
                                param.properties.forEach((prop) => {
                                    if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                        prop.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        used.add(prop.key.name);
                                    }
                                });
                                usedProps.set(typeName, used);
                            }
                        }
                    }
                }
            },
            'VariableDeclaration:exit'(node) {
                if (currentComponent?.node === node) {
                    const { typeName } = currentComponent;
                    const propsType = propsTypes.get(typeName);
                    const used = usedProps.get(typeName);
                    if (propsType && used) {
                        Object.keys(propsType).forEach((prop) => {
                            if (!used.has(prop)) {
                                context.report({
                                    node: propsType[prop],
                                    messageId: 'unusedProp',
                                    data: { propName: prop },
                                });
                            }
                        });
                    }
                    // Reset state for this component
                    propsTypes.delete(typeName);
                    usedProps.delete(typeName);
                    currentComponent = null;
                }
            },
        };
    },
});
//# sourceMappingURL=no-unused-props.js.map