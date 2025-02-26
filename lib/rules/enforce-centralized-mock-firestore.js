"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceCentralizedMockFirestore = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const MOCK_FIRESTORE_PATH = '../../../../../__test-utils__/mockFirestore';
exports.enforceCentralizedMockFirestore = (0, createRule_1.createRule)({
    name: 'enforce-centralized-mock-firestore',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce usage of centralized mockFirestore from predefined location',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useCentralizedMockFirestore: 'Use the centralized mockFirestore from the predefined location instead of creating a new mock',
        },
    },
    defaultOptions: [],
    create(context) {
        let hasCentralizedImport = false;
        const mockFirestoreNodes = new Set();
        const customMockFirestoreNames = new Set();
        const customMockFirestoreCallExpressions = new Set();
        const thisExpressions = [];
        return {
            ImportDeclaration(node) {
                if (node.source.value.endsWith(MOCK_FIRESTORE_PATH)) {
                    hasCentralizedImport = true;
                    // Check for renamed imports
                    for (const specifier of node.specifiers) {
                        if (specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                            specifier.imported.type === utils_1.AST_NODE_TYPES.Identifier &&
                            specifier.imported.name === 'mockFirestore' &&
                            specifier.local.name !== 'mockFirestore') {
                            customMockFirestoreNames.add(specifier.local.name);
                        }
                    }
                }
            },
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.id.name === 'mockFirestore') {
                    mockFirestoreNodes.add(node);
                }
                else if (node.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    for (const prop of node.id.properties) {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                            prop.key.name === 'mockFirestore') {
                            mockFirestoreNodes.add(node);
                            // Track renamed destructured imports
                            if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.value.name !== 'mockFirestore') {
                                customMockFirestoreNames.add(prop.value.name);
                            }
                            break;
                        }
                    }
                }
            },
            PropertyDefinition(node) {
                if (node.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.key.name === 'mockFirestore') {
                    mockFirestoreNodes.add(node);
                }
            },
            CallExpression(node) {
                // Track calls to custom mockFirestore names
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    customMockFirestoreNames.has(node.callee.name)) {
                    customMockFirestoreCallExpressions.add(node);
                }
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'require' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal &&
                    typeof node.arguments[0].value === 'string' &&
                    !node.arguments[0].value.endsWith(MOCK_FIRESTORE_PATH)) {
                    const parent = node.parent;
                    if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                        parent.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                        for (const prop of parent.id.properties) {
                            if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                                prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.key.name === 'mockFirestore') {
                                mockFirestoreNodes.add(parent);
                                // Track renamed destructured imports
                                if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier &&
                                    prop.value.name !== 'mockFirestore') {
                                    customMockFirestoreNames.add(prop.value.name);
                                }
                                break;
                            }
                        }
                    }
                }
            },
            // Handle dynamic imports
            'AwaitExpression > CallExpression[callee.type="ImportExpression"]'(node) {
                const parent = node.parent;
                if (parent?.type === utils_1.AST_NODE_TYPES.AwaitExpression &&
                    parent.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator &&
                    parent.parent.id.type === utils_1.AST_NODE_TYPES.ObjectPattern) {
                    for (const prop of parent.parent.id.properties) {
                        if (prop.type === utils_1.AST_NODE_TYPES.Property &&
                            prop.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                            prop.key.name === 'mockFirestore') {
                            mockFirestoreNodes.add(parent.parent);
                            // Track renamed destructured imports
                            if (prop.value.type === utils_1.AST_NODE_TYPES.Identifier &&
                                prop.value.name !== 'mockFirestore') {
                                customMockFirestoreNames.add(prop.value.name);
                            }
                            break;
                        }
                    }
                }
            },
            // Handle complex object destructuring
            'ObjectPattern > Property > ObjectPattern > Property > ObjectPattern > Property[key.name="mockFirestore"]'(node) {
                let current = node;
                while (current.parent) {
                    if (current.parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
                        mockFirestoreNodes.add(current.parent);
                        break;
                    }
                    current = current.parent;
                }
            },
            // Capture this.mockFirestore expressions
            MemberExpression(node) {
                if (node.object.type === utils_1.AST_NODE_TYPES.ThisExpression &&
                    node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.property.name === 'mockFirestore') {
                    thisExpressions.push(node);
                }
            },
            'Program:exit'() {
                if (mockFirestoreNodes.size > 0) {
                    const sourceCode = context.getSourceCode();
                    // Report only once for the entire file
                    context.report({
                        node: Array.from(mockFirestoreNodes)[0],
                        messageId: 'useCentralizedMockFirestore',
                        fix(fixer) {
                            // Instead of trying to modify the code incrementally, we'll generate the entire fixed code
                            const originalText = sourceCode.getText();
                            const lines = originalText.split('\n');
                            // Find the indentation of the code
                            const indentMatch = lines[0].match(/^(\s*)/);
                            const indent = indentMatch ? indentMatch[1] : '';
                            // Create the import statement
                            const importLine = `${indent}import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';`;
                            // Find all the lines that need to be removed
                            const linesToRemove = new Set();
                            // Process all nodes that need to be removed
                            mockFirestoreNodes.forEach(node => {
                                const startLine = sourceCode.getLocFromIndex(node.range[0]).line - 1;
                                const endLine = sourceCode.getLocFromIndex(node.range[1]).line - 1;
                                if (node.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
                                    // If it's the only declarator, remove the entire declaration
                                    if (node.parent.declarations.length === 1) {
                                        const declStartLine = sourceCode.getLocFromIndex(node.parent.range[0]).line - 1;
                                        const declEndLine = sourceCode.getLocFromIndex(node.parent.range[1]).line - 1;
                                        for (let i = declStartLine; i <= declEndLine; i++) {
                                            linesToRemove.add(i);
                                        }
                                    }
                                    else {
                                        // Otherwise, just remove this declarator
                                        for (let i = startLine; i <= endLine; i++) {
                                            linesToRemove.add(i);
                                        }
                                    }
                                }
                                else if (node.type === utils_1.AST_NODE_TYPES.PropertyDefinition) {
                                    // Remove class property
                                    for (let i = startLine; i <= endLine; i++) {
                                        linesToRemove.add(i);
                                    }
                                }
                            });
                            // Replace custom mockFirestore references with the standard one
                            const replacements = [];
                            // Add replacements for custom mockFirestore names
                            customMockFirestoreCallExpressions.forEach(node => {
                                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier) {
                                    replacements.push([
                                        node.callee.range[0],
                                        node.callee.name,
                                        'mockFirestore'
                                    ]);
                                }
                            });
                            // Add replacements for this.mockFirestore
                            thisExpressions.forEach(expr => {
                                replacements.push([
                                    expr.range[0],
                                    sourceCode.getText(expr),
                                    'mockFirestore'
                                ]);
                            });
                            // Sort replacements in reverse order to avoid range issues
                            replacements.sort((a, b) => b[0] - a[0]);
                            // Apply replacements to the original text
                            let fixedText = originalText;
                            for (const [pos, oldText, newText] of replacements) {
                                fixedText =
                                    fixedText.substring(0, pos) +
                                        newText +
                                        fixedText.substring(pos + oldText.length);
                            }
                            // Filter out the lines to remove
                            const fixedLines = fixedText.split('\n').filter((_, i) => !linesToRemove.has(i));
                            // Add the import statement at the beginning
                            if (!hasCentralizedImport) {
                                fixedLines.unshift(importLine);
                            }
                            // Join the lines back together
                            const result = fixedLines.join('\n');
                            // Return the fixed text
                            return fixer.replaceText(sourceCode.ast, result);
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-centralized-mock-firestore.js.map