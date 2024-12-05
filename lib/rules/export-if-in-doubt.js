"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportIfInDoubt = void 0;
/* eslint-disable @blumintinc/blumint/extract-global-constants */
// import { ASTHelpers } from '../utils/ASTHelpers';
const createRule_1 = require("../utils/createRule");
exports.exportIfInDoubt = (0, createRule_1.createRule)({
    name: 'export-if-in-doubt',
    meta: {
        type: 'suggestion',
        docs: {
            description: 'All top-level const definitions, type definitions, and functions should be exported',
            recommended: 'warn',
        },
        schema: [],
        messages: {
            exportIfInDoubt: 'Top-level const definitions, type definitions, and functions should be exported.',
        },
    },
    defaultOptions: [],
    create(context) {
        // List of top-level declarations
        // List of exported identifiers
        const topLevelDeclarations = [];
        const exportedIdentifiers = [];
        return {
            'Program > VariableDeclaration > VariableDeclarator, Program > FunctionDeclaration, Program > TSTypeAliasDeclaration'(node) {
                topLevelDeclarations.push(node);
            },
            ExportNamedDeclaration: (node) => {
                if (node.specifiers) {
                    node.specifiers.forEach((specifier) => {
                        if (specifier.type === 'ExportSpecifier') {
                            // Handle both normal and default export
                            const exportedName = specifier.exported.name;
                            if (!exportedIdentifiers.includes(exportedName)) {
                                exportedIdentifiers.push(exportedName);
                            }
                            // If the specifier is a default export
                            if (specifier.local.name !== exportedName) {
                                const localName = specifier.local.name;
                                if (!exportedIdentifiers.includes(localName)) {
                                    exportedIdentifiers.push(localName);
                                }
                            }
                        }
                    });
                }
            },
            'Program:exit': () => {
                topLevelDeclarations.forEach((node) => {
                    if ('id' in node &&
                        node.id &&
                        (node.type === 'VariableDeclarator' ||
                            node.type === 'FunctionDeclaration' ||
                            node.type === 'TSTypeAliasDeclaration') &&
                        node.id.type === 'Identifier' &&
                        !exportedIdentifiers.includes(node.id.name)) {
                        context.report({
                            node,
                            messageId: 'exportIfInDoubt',
                        });
                    }
                });
            },
        };
    },
});
//# sourceMappingURL=export-if-in-doubt.js.map