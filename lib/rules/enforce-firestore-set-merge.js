"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreSetMerge = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceFirestoreSetMerge = (0, createRule_1.createRule)({
    name: 'enforce-firestore-set-merge',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using set() with { merge: true } instead of update() for Firestore operations',
            recommended: 'error',
            requiresTypeChecking: false,
            extendsBaseRule: false,
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferSetMerge: 'Use set() with { merge: true } instead of update() for more predictable Firestore operations',
        },
    },
    defaultOptions: [],
    create(context) {
        const updateAliases = new Set();
        function isFirestoreUpdateCall(node) {
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const property = node.callee.property;
                return (property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    property.name === 'update');
            }
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                return updateAliases.has(node.callee.name);
            }
            return false;
        }
        function convertUpdateToSetMerge(node, sourceCode) {
            const args = node.arguments;
            if (args.length === 0)
                return '';
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const object = sourceCode.getText(node.callee.object);
                if (object.includes('transaction')) {
                    const docRef = sourceCode.getText(args[0]);
                    const data = sourceCode.getText(args[1]);
                    return `${object}.set(${docRef}, ${data}, { merge: true })`;
                }
                const data = sourceCode.getText(args[0]);
                return `${object}.set(${data}, { merge: true })`;
            }
            // For updateDoc from firebase/firestore
            const docRef = sourceCode.getText(args[0]);
            const data = args.length > 1 ? sourceCode.getText(args[1]) : '{}';
            return `setDoc(${docRef}, ${data}, { merge: true })`;
        }
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'firebase/firestore' ||
                    node.source.value === 'firebase-admin') {
                    node.specifiers.forEach((specifier) => {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
                            if (specifier.imported.name === 'updateDoc') {
                                updateAliases.add(specifier.local.name);
                            }
                        }
                    });
                }
            },
            ImportExpression(node) {
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    (node.source.value === 'firebase/firestore' ||
                        node.source.value === 'firebase-admin')) {
                    // Dynamic imports are handled in VariableDeclarator
                }
            },
            VariableDeclarator(node) {
                if (node.init?.type === utils_1.AST_NODE_TYPES.AwaitExpression &&
                    node.init.argument.type === utils_1.AST_NODE_TYPES.ImportExpression) {
                    const importSource = node.init.argument.source;
                    if (importSource.type === utils_1.AST_NODE_TYPES.Literal &&
                        (importSource.value === 'firebase/firestore' ||
                            importSource.value === 'firebase-admin')) {
                        // Handle destructured imports
                        if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                            node.id.properties.forEach((prop) => {
                                if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                    prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                    prop.key.name === 'updateDoc') {
                                    if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier) {
                                        updateAliases.add(prop.value.name);
                                    }
                                }
                            });
                        }
                    }
                }
            },
            CallExpression(node) {
                if (isFirestoreUpdateCall(node)) {
                    context.report({
                        node,
                        messageId: 'preferSetMerge',
                        fix(fixer) {
                            const newText = convertUpdateToSetMerge(node, context.getSourceCode());
                            return fixer.replaceText(node, newText);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-set-merge.js.map