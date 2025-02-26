"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceAssertSafeObjectKey = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceAssertSafeObjectKey = (0, createRule_1.createRule)({
    name: 'enforce-assertSafe-object-key',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useAssertSafe: 'Use assertSafe() for object key access to ensure safe property access. Replace `obj[String(id)]` or `obj[`${id}`]` with `obj[assertSafe(id)]`.',
        },
    },
    defaultOptions: [],
    create(context) {
        let hasAssertSafeImport = false;
        /**
         * Helper function to add assertSafe import if needed
         */
        const addAssertSafeImport = (fixer) => {
            const program = context.getSourceCode().ast;
            const firstImport = program.body.find((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
            const importStatement = "import { assertSafe } from 'utils/assertions';\n";
            if (firstImport) {
                return fixer.insertTextBefore(firstImport, importStatement);
            }
            else {
                return fixer.insertTextBefore(program.body[0], importStatement);
            }
        };
        /**
         * Helper function to create fixes for a node
         */
        const createFixes = (fixer, node, argText) => {
            const fixes = [];
            // Add import if not present
            if (!hasAssertSafeImport) {
                fixes.push(addAssertSafeImport(fixer));
                hasAssertSafeImport = true;
            }
            // Replace the node with assertSafe(argText)
            fixes.push(fixer.replaceText(node, `assertSafe(${argText})`));
            return fixes;
        };
        return {
            ImportDeclaration(node) {
                // Check if assertSafe is already imported
                if (node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
                    specifier.imported.name === 'assertSafe')) {
                    hasAssertSafeImport = true;
                }
            },
            // Handle computed property in object destructuring
            Property(node) {
                if (node.computed && node.key) {
                    const key = node.key;
                    // Check for String(id) pattern
                    if (key.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        key.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        key.callee.name === 'String') {
                        context.report({
                            node: key,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const arg = key.arguments[0];
                                const argText = context.getSourceCode().getText(arg);
                                return createFixes(fixer, key, argText);
                            },
                        });
                    }
                    // Check for template literals like `${id}`
                    if (key.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
                        key.expressions.length === 1 &&
                        key.quasis.length === 2 &&
                        key.quasis[0].value.raw === '' &&
                        key.quasis[1].value.raw === '') {
                        context.report({
                            node: key,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const expr = key.expressions[0];
                                const exprText = context.getSourceCode().getText(expr);
                                return createFixes(fixer, key, exprText);
                            },
                        });
                    }
                }
            },
            // Handle binary expressions like 'key' in obj
            BinaryExpression(node) {
                if (node.operator === 'in') {
                    const left = node.left;
                    // Check for String(id) pattern
                    if (left.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        left.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        left.callee.name === 'String') {
                        context.report({
                            node: left,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const arg = left.arguments[0];
                                const argText = context.getSourceCode().getText(arg);
                                return createFixes(fixer, left, argText);
                            },
                        });
                    }
                    // Check for template literals like `${id}`
                    if (left.type === utils_1.AST_NODE_TYPES.TemplateLiteral &&
                        left.expressions.length === 1 &&
                        left.quasis.length === 2 &&
                        left.quasis[0].value.raw === '' &&
                        left.quasis[1].value.raw === '') {
                        context.report({
                            node: left,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const expr = left.expressions[0];
                                const exprText = context.getSourceCode().getText(expr);
                                return createFixes(fixer, left, exprText);
                            },
                        });
                    }
                }
            },
            MemberExpression(node) {
                if (node.computed) {
                    const property = node.property;
                    // Skip if already using assertSafe
                    if (property.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        property.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        property.callee.name === 'assertSafe') {
                        // Already using assertSafe, this is valid
                        return;
                    }
                    // Try to determine if this is likely an array or dictionary
                    const objectNode = node.object;
                    let objectName = '';
                    let isLikelyArray = false;
                    if (objectNode.type === utils_1.AST_NODE_TYPES.Identifier) {
                        objectName = objectNode.name.toLowerCase();
                        isLikelyArray =
                            /^(array|arr|items|elements|list|collection|data)s?$/i.test(objectName);
                    }
                    // Check for string literals - allow them for dictionaries but not for regular objects
                    if (property.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof property.value === 'string') {
                        // String literals are fine, no need for assertSafe
                        return;
                    }
                    // Check for numeric literals - always allow for arrays
                    if (property.type === utils_1.AST_NODE_TYPES.Literal &&
                        typeof property.value === 'number') {
                        // Numeric literals are fine, no need for assertSafe
                        return;
                    }
                    // Check if we're using String(id) pattern
                    if (property.type === utils_1.AST_NODE_TYPES.CallExpression &&
                        property.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                        property.callee.name === 'String') {
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const arg = property.arguments[0];
                                const argText = context.getSourceCode().getText(arg);
                                return createFixes(fixer, property, argText);
                            },
                        });
                        return;
                    }
                    // Check for template literals
                    if (property.type === utils_1.AST_NODE_TYPES.TemplateLiteral) {
                        // If it's a template literal in an array, allow it
                        if (isLikelyArray) {
                            return;
                        }
                        // Only flag simple template literals that are just `${id}`
                        // Complex templates with additional text like `prefix_${id}_suffix` are allowed
                        const isSimpleVarInterpolation = property.expressions.length === 1 &&
                            property.quasis.length === 2 &&
                            property.quasis[0].value.raw === '' &&
                            property.quasis[1].value.raw === '';
                        if (!isSimpleVarInterpolation) {
                            // Complex template literals with additional text are fine
                            return;
                        }
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                // Extract the expression from the template literal
                                const expr = property.expressions[0];
                                const exprText = context.getSourceCode().getText(expr);
                                return createFixes(fixer, property, exprText);
                            },
                        });
                        return;
                    }
                    // Check for direct variable usage (identifiers)
                    if (property.type === utils_1.AST_NODE_TYPES.Identifier) {
                        // Skip numeric literals, they're safe
                        if (/^\d+$/.test(property.name)) {
                            return;
                        }
                        // If it looks like an array access, allow it
                        if (isLikelyArray) {
                            return;
                        }
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                // For direct variable use, just use the variable name
                                const propText = context.getSourceCode().getText(property);
                                return createFixes(fixer, property, propText);
                            },
                        });
                        return;
                    }
                    // Check for binary expressions (like index + 1)
                    if (property.type === utils_1.AST_NODE_TYPES.BinaryExpression) {
                        // Allow binary expressions in array access
                        if (isLikelyArray) {
                            return;
                        }
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const propText = context.getSourceCode().getText(property);
                                return createFixes(fixer, property, propText);
                            },
                        });
                        return;
                    }
                    // Check for boolean expressions and other literals
                    if (property.type === utils_1.AST_NODE_TYPES.Literal ||
                        property.type === utils_1.AST_NODE_TYPES.LogicalExpression ||
                        property.type === utils_1.AST_NODE_TYPES.ConditionalExpression) {
                        // Allow these expressions in array access
                        if (isLikelyArray) {
                            return;
                        }
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const propText = context.getSourceCode().getText(property);
                                return createFixes(fixer, property, propText);
                            },
                        });
                        return;
                    }
                    // Check for function calls (anything that isn't handled above)
                    if (property.type === utils_1.AST_NODE_TYPES.MemberExpression ||
                        (property.type === utils_1.AST_NODE_TYPES.CallExpression &&
                            !(property.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                                property.callee.name === 'String'))) {
                        // Allow member expressions and function calls in array access
                        if (isLikelyArray) {
                            return;
                        }
                        context.report({
                            node: property,
                            messageId: 'useAssertSafe',
                            fix(fixer) {
                                const propText = context.getSourceCode().getText(property);
                                return createFixes(fixer, property, propText);
                            },
                        });
                        return;
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-assertSafe-object-key.js.map