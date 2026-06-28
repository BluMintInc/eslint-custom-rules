"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceFExtensionForEntryPoints = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const path_1 = __importDefault(require("path"));
const ASTHelpers_1 = require("../utils/ASTHelpers");
const DEFAULT_ENTRY_POINTS = [
    'onCall',
    'onCallVaripotent',
    'onRequest',
    'onQueueTask',
    'onWebhook',
    'sequentialDocumentWritten',
    'onDocumentWritten',
    'onDocumentCreated',
    'onDocumentDeleted',
    'onDocumentUpdated',
    'onSchedule',
    'onValueWritten',
    'onValueCreated',
    'onValueUpdated',
    'onValueDeleted',
    'sequentialValueWritten',
    'sequentialValueCreated',
    'sequentialValueUpdated',
    'sequentialValueDeleted',
];
/**
 * Entry points must be defined at the top level because Firebase deployment
 * discovers and registers them by evaluating the module scope. Nested definitions
 * inside functions or classes won't be discovered during the deployment process.
 */
function isTopLevel(node) {
    let current = node.parent;
    while (current) {
        if (current.type === utils_1.AST_NODE_TYPES.FunctionDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.FunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === utils_1.AST_NODE_TYPES.ClassDeclaration ||
            current.type === utils_1.AST_NODE_TYPES.ClassExpression ||
            current.type === utils_1.AST_NODE_TYPES.MethodDefinition) {
            return false;
        }
        current = current.parent;
    }
    return true;
}
/**
 * Checks if a node directly defines an entry point as a function or variable declaration.
 * This exempts wrapper implementation files (e.g., functions/src/v2/) but intentionally
 * does not exempt re-export files (e.g., `const myCall = onCall; export { myCall }`).
 * Re-export files that also invoke entry points must still follow the .f.ts naming convention
 * and will be flagged by the CallExpression handler.
 *
 * This function specifically checks AST node types FunctionDeclaration and
 * VariableDeclaration but does not catch ExportSpecifiers used in re-exports.
 */
function isNodeDefiningEntryPoint(node, entryPoints) {
    // Handle function declaration: export function onCall() {}
    if (node.type === utils_1.AST_NODE_TYPES.FunctionDeclaration &&
        node.id &&
        entryPoints.has(node.id.name)) {
        return true;
    }
    // Handle variable declaration: export const onCall = ...
    if (node.type === utils_1.AST_NODE_TYPES.VariableDeclaration) {
        return node.declarations.some((decl) => decl.id.type === utils_1.AST_NODE_TYPES.Identifier &&
            entryPoints.has(decl.id.name));
    }
    return false;
}
/**
 * Obtains the scope for a node in an ESLint 9+ compatible way.
 *
 * Note: In ESLint 8, falls back to context.getScope() which returns the scope
 * of the currently visited node—only call this from within visitor handlers
 * for the target node.
 */
function getScopeForNode(context, node) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    if (isEslint9OrLater(sourceCode)) {
        return getEslint9Scope(sourceCode, node);
    }
    return context.getScope();
}
/**
 * Checks if the current environment is ESLint 9 or later.
 */
function isEslint9OrLater(sourceCode) {
    return typeof sourceCode.getScope === 'function';
}
/**
 * Gets the scope for a node using the ESLint 9+ SourceCode.getScope() method.
 */
function getEslint9Scope(sourceCode, node) {
    return sourceCode.getScope(node);
}
/**
 * Gets the import definition for a given name in the current scope.
 */
function getImportDef(context, calleeName, node) {
    const scope = getScopeForNode(context, node);
    const variable = ASTHelpers_1.ASTHelpers.findVariableInScope(scope, calleeName);
    if (!variable) {
        return null;
    }
    return variable.defs.find((def) => def.type === 'ImportBinding') ?? null;
}
/**
 * Checks if the import comes from an allowed Firebase or internal wrapper source.
 */
function isFromAllowedSource(importDef) {
    if (!importDef || !importDef.parent) {
        return false;
    }
    const importDeclaration = importDef.parent;
    if (importDeclaration.type !== utils_1.AST_NODE_TYPES.ImportDeclaration) {
        return false;
    }
    const source = importDeclaration.source.value;
    return (source.startsWith('firebase-functions') ||
        /(^|\/)v2(\/|$)/.test(source) ||
        /(^|\/)util\/webhook(\/|$)/.test(source));
}
/**
 * Helper function to extract name from import specifier.
 */
function getNameFromImportSpecifier(node) {
    const { imported } = node;
    if (imported.type === utils_1.AST_NODE_TYPES.Identifier) {
        return imported.name;
    }
    // Handle Literal imports (string-named imports in ESLint 8+)
    const importedNode = imported;
    if (importedNode.type === utils_1.AST_NODE_TYPES.Literal &&
        typeof importedNode.value === 'string') {
        return importedNode.value;
    }
    return undefined;
}
/**
 * Helper function to extract name from module path.
 */
function getNameFromModulePath(importDeclaration, entryPoints) {
    const modulePath = importDeclaration.source.value;
    // Extract the module name from the path.
    // Example: '../../v2/https/onCall' -> 'onCall'
    const match = modulePath.match(/[/\\]([^/\\]+)$/);
    const segment = (match ? match[1] : modulePath).replace(/\.[jt]sx?$/, '');
    return entryPoints.has(segment) ? segment : undefined;
}
/**
 * Resolves the original name of the imported function, handling aliases and default imports.
 */
function getOriginalName(importDef, calleeName, entryPoints) {
    if (!importDef || !importDef.node) {
        return calleeName;
    }
    // Handle named imports: import { onCall as myCall } from ...
    if (importDef.node.type === utils_1.AST_NODE_TYPES.ImportSpecifier) {
        return getNameFromImportSpecifier(importDef.node) ?? calleeName;
    }
    // Handle default imports: import onCall from '../../v2/https/onCall'
    // or namespace imports: import * as onCall from '../../v2/https/onCall'
    if (importDef.node.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
        importDef.node.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier) {
        return (getNameFromModulePath(importDef.parent, entryPoints) ?? calleeName);
    }
    return calleeName;
}
exports.enforceFExtensionForEntryPoints = (0, createRule_1.createRule)({
    name: 'enforce-f-extension-for-entry-points',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce .f.ts extension for entry points',
            recommended: 'error',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    entryPoints: {
                        type: 'array',
                        items: { type: 'string' },
                    },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            requireFExtension: 'File "{{fileName}}" contains a Firebase Cloud Function entry point "{{entryPoint}}" but lacks the ".f.ts" extension. ' +
                'Entry points must use ".f.ts" to clearly mark the public function surface to avoid accidental export/name collisions, ' +
                'unintended exposure of internal implementation during deployment, confusion during imports/tests, and maintenance bugs. ' +
                'Rename this file to "{{suggestedName}}" to mark it as a public entry point.',
        },
    },
    defaultOptions: [{ entryPoints: DEFAULT_ENTRY_POINTS }],
    create(context, [options]) {
        const filePath = context.filename ??
            context.getFilename();
        const fileName = path_1.default.basename(filePath);
        const entryPoints = new Set(options.entryPoints?.length ? options.entryPoints : DEFAULT_ENTRY_POINTS);
        // Only apply to files under functions/src/
        const normalizedPath = filePath.replace(/\\/g, '/');
        if (!normalizedPath.includes('/functions/src/') &&
            !normalizedPath.startsWith('functions/src/')) {
            return {};
        }
        // Exclude test files and declaration files
        if (/\.(test|spec)\.tsx?$|\.d\.ts$/.test(fileName)) {
            return {};
        }
        // Only apply to .ts and .tsx files, but not files already using .f.ts or .f.tsx
        const isTsOrTsx = /\.tsx?$/.test(fileName);
        const isFExtension = /\.f\.tsx?$/.test(fileName);
        if (!isTsOrTsx || isFExtension) {
            return {};
        }
        let isDefiningEntryPoint = false;
        let reported = false;
        return {
            ExportNamedDeclaration(node) {
                if (isDefiningEntryPoint || !node.declaration) {
                    return;
                }
                if (isNodeDefiningEntryPoint(node.declaration, entryPoints)) {
                    isDefiningEntryPoint = true;
                }
            },
            ExportDefaultDeclaration(node) {
                if (isDefiningEntryPoint) {
                    return;
                }
                if (isNodeDefiningEntryPoint(node.declaration, entryPoints)) {
                    isDefiningEntryPoint = true;
                }
            },
            CallExpression(node) {
                if (reported || isDefiningEntryPoint) {
                    return;
                }
                // We only care about simple identifier calls (e.g., onCall())
                if (node.callee.type !== utils_1.AST_NODE_TYPES.Identifier) {
                    return;
                }
                const calleeName = node.callee.name;
                // Optimization: Early return if it's not a top-level call
                if (!isTopLevel(node)) {
                    return;
                }
                // Variable lookup logic and import source validation
                const importDef = getImportDef(context, calleeName, node);
                if (!importDef || !isFromAllowedSource(importDef)) {
                    return;
                }
                // Entry point checking
                const originalName = getOriginalName(importDef, calleeName, entryPoints);
                if (!entryPoints.has(originalName)) {
                    return;
                }
                reported = true;
                const suggestedName = fileName.replace(/\.tsx?$/, '.f$&');
                context.report({
                    node,
                    messageId: 'requireFExtension',
                    data: {
                        fileName,
                        entryPoint: calleeName === originalName
                            ? calleeName
                            : `${calleeName} (${originalName})`,
                        suggestedName,
                    },
                });
            },
        };
    },
});
//# sourceMappingURL=enforce-f-extension-for-entry-points.js.map