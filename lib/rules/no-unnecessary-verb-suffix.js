"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noUnnecessaryVerbSuffix = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const COMMON_PREPOSITION_SUFFIXES = new Set([
    // Basic prepositions
    'From',
    'For',
    'With',
    'To',
    'By',
    'In',
    'On',
    'At',
    'Of',
    // Temporal prepositions
    'During',
    'Until',
    'Till',
    'Since',
    'Within',
    // Logical/causal prepositions
    'Because',
    'Despite',
    'Instead',
    'Via',
    'Without',
    'Versus',
    'Vs',
    // Comparative prepositions
    'Than',
    'As',
    // Phrasal prepositions (common endings)
    'Against',
    'Among',
    'Amongst',
    'Beside',
    'Besides',
    'Between',
    'Beyond',
    'Concerning',
    'Considering',
    'Regarding',
    'Respecting',
    'Towards',
    'Toward',
    'Upon',
    // Preposition-like adverbs
    'Again',
    'Already',
    'Always',
    'Ever',
    'Never',
    'Now',
    'Soon',
    'Then',
    'There',
    'Where',
    'When',
    'While',
    // Programming-specific suffixes
    'Async',
    'Sync',
]);
exports.noUnnecessaryVerbSuffix = (0, createRule_1.createRule)({
    name: 'no-unnecessary-verb-suffix',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Prevent unnecessary verb suffixes in function and method names',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            unnecessaryVerbSuffix: 'Function name "{{name}}" ends with verb suffix "{{suffix}}" that does not add meaning beyond its parameters. Redundant verb-preposition endings make call sites harder to scan and hide the primary action. Rename to "{{suggestion}}" so the name stays action-oriented while arguments express the relationship.',
        },
    },
    defaultOptions: [],
    create(context) {
        function checkFunctionName(node, name) {
            if (!name)
                return;
            for (const suffix of COMMON_PREPOSITION_SUFFIXES) {
                // Check if the name ends with the suffix
                if (name.endsWith(suffix)) {
                    // Make sure there's a verb before the suffix (camelCase format)
                    // This regex checks for a verb pattern before the suffix
                    // It looks for a word character followed by lowercase letters before the suffix
                    const verbBeforeSuffixPattern = new RegExp(`\\w[a-z]+${suffix}$`);
                    if (verbBeforeSuffixPattern.test(name)) {
                        const suggestion = name.substring(0, name.length - suffix.length);
                        // Skip if the suggestion would be empty or just a single character
                        if (suggestion.length <= 1)
                            continue;
                        context.report({
                            node,
                            messageId: 'unnecessaryVerbSuffix',
                            data: {
                                name,
                                suffix,
                                suggestion,
                            },
                            fix(fixer) {
                                if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration) {
                                    return fixer.replaceText(node.id, suggestion);
                                }
                                else if (node.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                                    node.type === utils_1.AST_NODE_TYPES.FunctionExpression) {
                                    const parent = node.parent;
                                    if (parent &&
                                        (parent.type === utils_1.AST_NODE_TYPES.VariableDeclarator ||
                                            parent.type === utils_1.AST_NODE_TYPES.Property ||
                                            parent.type === utils_1.AST_NODE_TYPES.MethodDefinition)) {
                                        if ('key' in parent) {
                                            return fixer.replaceText(parent.key, suggestion);
                                        }
                                        else if ('id' in parent && parent.id) {
                                            return fixer.replaceText(parent.id, suggestion);
                                        }
                                    }
                                }
                                return null;
                            },
                        });
                    }
                }
            }
        }
        return {
            FunctionDeclaration(node) {
                if (node.id) {
                    checkFunctionName(node, node.id.name);
                }
            },
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.init?.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        node.init?.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                    checkFunctionName(node.init, node.id.name);
                }
            },
            MethodDefinition(node) {
                if (node.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    checkFunctionName(node.value, node.key.name);
                }
            },
            TSMethodSignature(node) {
                // Handle interface method signatures
                if (node.key.type === utils_1.AST_NODE_TYPES.Identifier) {
                    checkFunctionName(node, node.key.name);
                }
            },
            Property(node) {
                if (node.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    (node.value.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
                        node.value.type === utils_1.AST_NODE_TYPES.FunctionExpression)) {
                    checkFunctionName(node.value, node.key.name);
                }
            },
            FunctionExpression(node) {
                // Handle named function expressions
                if (node.id) {
                    checkFunctionName(node, node.id.name);
                }
            },
        };
    },
});
//# sourceMappingURL=no-unnecessary-verb-suffix.js.map