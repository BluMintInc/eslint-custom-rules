"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncOnwriteNameFunc = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.syncOnwriteNameFunc = (0, createRule_1.createRule)({
    name: 'sync-onwrite-name-func',
    meta: {
        type: 'problem',
        docs: {
            description: 'Ensure that the name field matches the func field in onWrite handlers',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            mismatchedName: 'The name field should match the func field in onWrite handlers',
        },
    },
    defaultOptions: [],
    create(context) {
        return {
            ObjectExpression(node) {
                let nameProperty;
                let funcProperty;
                for (const property of node.properties) {
                    if (property.type !== utils_1.AST_NODE_TYPES.Property)
                        continue;
                    if (property.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        property.key.name === 'name' &&
                        property.value.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof property.value.value === 'string') {
                        nameProperty = property;
                    }
                    if (property.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                        property.key.name === 'func') {
                        funcProperty = property;
                    }
                }
                if (!nameProperty || !funcProperty) {
                    return;
                }
                const nameValue = nameProperty.value
                    .value;
                let funcName;
                // Handle variable references
                if (funcProperty.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                    const funcIdentifier = funcProperty.value;
                    const scope = context.getScope();
                    const variable = scope.references.find((ref) => ref.identifier === funcIdentifier)?.resolved;
                    if (variable?.defs[0]?.node.type ===
                        utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        variable.defs[0].node.init?.type === utils_1.AST_NODE_TYPES.Identifier) {
                        // If the variable is initialized with another identifier, use that name
                        funcName = variable.defs[0].node.init.name;
                    }
                    else {
                        // Otherwise use the variable name itself
                        funcName = funcIdentifier.name;
                    }
                }
                else {
                    return; // Skip if func is not an identifier
                }
                if (nameValue !== funcName) {
                    const value = nameProperty.value;
                    if (value.type === utils_1.AST_NODE_TYPES.Literal) {
                        context.report({
                            node: nameProperty,
                            messageId: 'mismatchedName',
                            fix(fixer) {
                                return fixer.replaceText(value, `'${funcName}'`);
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=sync-onwrite-name-func.js.map