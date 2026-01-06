"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceStableStringify = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
exports.enforceStableStringify = (0, createRule_1.createRule)({
    name: 'enforce-safe-stringify',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce using safe-stable-stringify instead of JSON.stringify to handle circular references and ensure deterministic output. JSON.stringify can throw errors on circular references and produce inconsistent output for objects with the same properties in different orders. safe-stable-stringify handles these cases safely.',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            useStableStringify: 'Use safe-stable-stringify instead of JSON.stringify for safer serialization. Replace `JSON.stringify(obj)` with `stringify(obj)`. First import it: `import stringify from "safe-stable-stringify"`. This handles circular references and provides deterministic output.',
        },
    },
    defaultOptions: [],
    create(context) {
        let hasStringifyImport = false;
        return {
            ImportDeclaration(node) {
                if (node.source.value === 'safe-stable-stringify' &&
                    node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier &&
                        specifier.local.name === 'stringify')) {
                    hasStringifyImport = true;
                }
            },
            MemberExpression(node) {
                if (node.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.object.name === 'JSON' &&
                    node.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.property.name === 'stringify') {
                    context.report({
                        node,
                        messageId: 'useStableStringify',
                        fix(fixer) {
                            const fixes = [];
                            // Add import if not present
                            if (!hasStringifyImport) {
                                const program = context.sourceCode.ast;
                                const firstImport = program.body.find((node) => node.type === utils_1.AST_NODE_TYPES.ImportDeclaration);
                                const importStatement = "import stringify from 'safe-stable-stringify';\n";
                                if (firstImport) {
                                    fixes.push(fixer.insertTextBefore(firstImport, importStatement));
                                }
                                else {
                                    fixes.push(fixer.insertTextBefore(program.body[0], importStatement));
                                }
                                hasStringifyImport = true;
                            }
                            // Replace JSON.stringify with stringify
                            fixes.push(fixer.replaceText(node, 'stringify'));
                            return fixes;
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-safe-stringify.js.map