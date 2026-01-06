"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFirestoreSetMerge = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const ASTHelpers_1 = require("../utils/ASTHelpers");
exports.enforceFirestoreSetMerge = (0, createRule_1.createRule)({
    name: 'enforce-firestore-set-merge',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Enforce using set() with { merge: true } instead of update() for Firestore operations to ensure consistent behavior. The update() method fails if the document does not exist, while set() with { merge: true } creates the document if needed and safely merges fields, making it more reliable and predictable.',
            recommended: 'error',
            requiresTypeChecking: false,
            extendsBaseRule: false,
        },
        fixable: 'code',
        schema: [],
        messages: {
            preferSetMerge: 'Use set() with { merge: true } instead of update() for more predictable Firestore operations. Instead of `docRef.update({ field: value })`, use `docRef.set({ field: value }, { merge: true })`. This ensures consistent behavior when the document does not exist.',
        },
    },
    defaultOptions: [],
    create(context) {
        const updateAliases = new Set();
        function isFirestoreUpdateCall(node) {
            // Check if it's a set() call with merge: true
            if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                const property = node.callee.property;
                if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
                    // If it's a set() call, check if it has merge: true
                    if (property.name === 'set') {
                        const lastArg = node.arguments[node.arguments.length - 1];
                        if (lastArg?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                            const hasMergeTrue = lastArg.properties.some((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.key.name === 'merge' &&
                                prop.value.type === utils_1.AST_NODE_TYPES.Literal &&
                                prop.value.value === true);
                            if (hasMergeTrue) {
                                return false; // Already using set with merge: true
                            }
                        }
                    }
                    // Only flag update() calls that are Firestore operations
                    if (property.name === 'update') {
                        const object = node.callee.object;
                        // Check for BatchManager update calls
                        if (object.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                            object.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                            object.property.name === 'batchManager') {
                            return true;
                        }
                        if (object.type === utils_1.AST_NODE_TYPES.CallExpression) {
                            // Check if it's a createHash().update() call
                            if (object.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                object.callee.name === 'createHash') {
                                return false;
                            }
                        }
                        // Check if it's a Firestore document reference or transaction
                        let current = node;
                        while (current?.parent) {
                            current = current.parent;
                            if (current.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                                const obj = current.object;
                                if (obj.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    // Check for common Firestore variable names
                                    if (obj.name === 'db' ||
                                        obj.name === 'firestore' ||
                                        obj.name === 'transaction' ||
                                        obj.name === 'docRef' ||
                                        obj.name === 'userRef' ||
                                        obj.name.endsWith('Ref')) {
                                        return true;
                                    }
                                }
                            }
                        }
                        // Check if it's a Firestore document reference method chain
                        let currentObj = object;
                        while (currentObj.type === utils_1.AST_NODE_TYPES.MemberExpression) {
                            if (currentObj.property.type === utils_1.AST_NODE_TYPES.Identifier) {
                                const methodName = currentObj.property.name;
                                if (methodName === 'collection' || methodName === 'doc') {
                                    return true;
                                }
                            }
                            currentObj = currentObj.object;
                        }
                        // Check if it's a transaction.update() call
                        if (object.type === utils_1.AST_NODE_TYPES.Identifier &&
                            object.name === 'transaction') {
                            return true;
                        }
                        // Check if it's a Firestore document reference by looking at imports
                        const program = ASTHelpers_1.ASTHelpers.getAncestors(context, node).find((node) => node.type === utils_1.AST_NODE_TYPES.Program);
                        if (program) {
                            for (const node of program.body) {
                                if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                                    for (const decl of node.declarations) {
                                        if (decl.init?.type === utils_1.AST_NODE_TYPES.CallExpression &&
                                            decl.init.callee.type ===
                                                utils_1.AST_NODE_TYPES.MemberExpression &&
                                            decl.init.callee.property.type ===
                                                utils_1.AST_NODE_TYPES.Identifier &&
                                            decl.init.callee.property.name === 'firestore') {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                        return false;
                    }
                    return false;
                }
            }
            if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                // Check if it's a setDoc() call with merge: true
                if (node.callee.name === 'setDoc') {
                    const lastArg = node.arguments[node.arguments.length - 1];
                    if (lastArg?.type === utils_1.AST_NODE_TYPES.ObjectExpression) {
                        const hasMergeTrue = lastArg.properties.some((prop) => prop.type === utils_1.AST_NODE_TYPES.Property &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                            prop.key.name === 'merge' &&
                            prop.value.type === utils_1.AST_NODE_TYPES.Literal &&
                            prop.value.value === true);
                        if (hasMergeTrue) {
                            return false; // Already using setDoc with merge: true
                        }
                    }
                }
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
                if (object.includes('batchManager')) {
                    const docRef = sourceCode.getText(args[0]);
                    const data = sourceCode.getText(args[1]);
                    return `${object}.set({
          ref: ${docRef},
          data: ${data},
          merge: true,
        })`;
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
                            const newText = convertUpdateToSetMerge(node, context.sourceCode);
                            return fixer.replaceText(node, newText);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-firestore-set-merge.js.map