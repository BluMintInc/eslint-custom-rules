"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.noFirestoreJestMock = void 0;
const path_1 = __importDefault(require("path"));
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const FIRESTORE_JEST_MOCK = 'firestore-jest-mock';
const MOCK_FIRESTORE_TARGET = '__test-utils__/mockFirestore';
const toPosixPath = (filePath) => filePath.replace(/\\/g, '/');
const ensureRelativeSpecifier = (specifier) => specifier.startsWith('.') ? specifier : `./${specifier}`;
const isWindowsDrivePath = (filePath) => /^[A-Za-z]:[\\/]/.test(filePath);
const isValidRelativePath = (relativePath) => !path_1.default.isAbsolute(relativePath) && !isWindowsDrivePath(relativePath);
const buildReplacementPath = (sourceFilePath, cwd) => {
    const absoluteFilename = path_1.default.isAbsolute(sourceFilePath)
        ? sourceFilePath
        : path_1.default.join(cwd, sourceFilePath);
    const targetPath = path_1.default.join(cwd, MOCK_FIRESTORE_TARGET);
    const relativePath = path_1.default.relative(path_1.default.dirname(absoluteFilename), targetPath);
    if (!isValidRelativePath(relativePath)) {
        return '';
    }
    return ensureRelativeSpecifier(toPosixPath(relativePath));
};
const findVariableDeclarator = (node) => {
    const { parent } = node;
    if (parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
        return parent;
    }
    if (parent?.type === utils_1.AST_NODE_TYPES.AwaitExpression &&
        parent.parent?.type === utils_1.AST_NODE_TYPES.VariableDeclarator) {
        return parent.parent;
    }
    return null;
};
const buildDestructuringFix = (fixer, pattern) => {
    if (pattern.properties.length !== 1) {
        return null;
    }
    const [property] = pattern.properties;
    if (property.type !== utils_1.AST_NODE_TYPES.Property) {
        return null;
    }
    if (property.value.type === utils_1.AST_NODE_TYPES.AssignmentPattern) {
        return null;
    }
    if (property.value.type !== utils_1.AST_NODE_TYPES.Identifier) {
        return null;
    }
    const localName = property.value.name;
    const replacement = localName === 'mockFirestore'
        ? '{ mockFirestore }'
        : `{ mockFirestore: ${localName} }`;
    return fixer.replaceText(pattern, replacement);
};
const constructImportStatement = (localName, replacementPath) => {
    const binding = localName === 'mockFirestore'
        ? 'mockFirestore'
        : `mockFirestore as ${localName}`;
    return `import { ${binding} } from '${replacementPath}';`;
};
const getSingleValueImportSpecifier = (node) => {
    const valueSpecifiers = node.specifiers.filter((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind !== 'type');
    const hasTypeSpecifiers = node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportSpecifier &&
        specifier.importKind === 'type');
    const hasUnsupportedSpecifier = node.specifiers.some((specifier) => specifier.type === utils_1.AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === utils_1.AST_NODE_TYPES.ImportNamespaceSpecifier);
    if (valueSpecifiers.length !== 1 ||
        hasTypeSpecifiers ||
        hasUnsupportedSpecifier) {
        return null;
    }
    return valueSpecifiers[0];
};
const buildImportDeclarationFix = (node, replacementPath) => {
    if (!replacementPath) {
        return null;
    }
    const specifier = getSingleValueImportSpecifier(node);
    if (!specifier) {
        return null;
    }
    return constructImportStatement(specifier.local.name, replacementPath);
};
exports.noFirestoreJestMock = (0, createRule_1.createRule)({
    name: 'no-firestore-jest-mock',
    meta: {
        type: 'problem',
        docs: {
            description: 'Prevent importing firestore-jest-mock in test files',
            recommended: 'error',
        },
        fixable: 'code',
        schema: [],
        messages: {
            noFirestoreJestMock: 'What\'s wrong: This test imports "{{moduleName}}" directly → Why it matters: it bypasses the centralized mockFirestore helper that mirrors production schema and keeps seeding/cleanup consistent, which leads to inconsistent data and flaky tests → How to fix: import { mockFirestore } from "{{replacementPath}}" instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        const sourceFilePath = context.getFilename();
        // Only apply rule to test files
        if (!sourceFilePath.endsWith('.test.ts')) {
            return {};
        }
        const cwd = typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
        const replacementPath = buildReplacementPath(sourceFilePath, cwd);
        const messageReplacementPath = replacementPath ||
            ensureRelativeSpecifier(toPosixPath(MOCK_FIRESTORE_TARGET));
        const reportData = {
            moduleName: FIRESTORE_JEST_MOCK,
            replacementPath: messageReplacementPath,
        };
        return {
            ImportDeclaration(node) {
                // Skip type imports completely
                if (node.importKind === 'type') {
                    return;
                }
                if (node.source.value === FIRESTORE_JEST_MOCK) {
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                        data: reportData,
                        fix: (fixer) => {
                            const replacementImport = buildImportDeclarationFix(node, replacementPath);
                            if (!replacementImport) {
                                return null;
                            }
                            return fixer.replaceText(node, replacementImport);
                        },
                    });
                }
            },
            ImportExpression(node) {
                if (node.source.type === utils_1.AST_NODE_TYPES.Literal &&
                    node.source.value === FIRESTORE_JEST_MOCK) {
                    const variableDeclarator = findVariableDeclarator(node);
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                        data: reportData,
                        fix: (fixer) => {
                            if (!replacementPath) {
                                return null;
                            }
                            if (!variableDeclarator) {
                                return null;
                            }
                            if (variableDeclarator.id.type !== utils_1.AST_NODE_TYPES.ObjectPattern) {
                                return null;
                            }
                            const destructuringFix = buildDestructuringFix(fixer, variableDeclarator.id);
                            if (!destructuringFix) {
                                return null;
                            }
                            return [
                                fixer.replaceText(node.source, `'${replacementPath}'`),
                                destructuringFix,
                            ];
                        },
                    });
                }
            },
            CallExpression(node) {
                // Check for jest.mock('firestore-jest-mock')
                if (node.callee.type === utils_1.AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.object.name === 'jest' &&
                    node.callee.property.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'mock' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal &&
                    node.arguments[0].value === FIRESTORE_JEST_MOCK) {
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                        data: reportData,
                    });
                }
                // Check for require('firestore-jest-mock')
                if (node.callee.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'require' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === utils_1.AST_NODE_TYPES.Literal &&
                    node.arguments[0].value === FIRESTORE_JEST_MOCK) {
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                        data: reportData,
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=no-firestore-jest-mock.js.map