"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceIdentifiableFirestoreType = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const path_1 = __importDefault(require("path"));
const toPascalCase = (name) => {
    const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (parts.length === 0) {
        const stripped = name.replace(/^[^A-Za-z_]+/, '');
        if (!stripped)
            return '_Type';
        return /^[0-9]/.test(stripped) ? `_${stripped}` : stripped;
    }
    const pascal = parts
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    if (!pascal)
        return '_Type';
    return /^[0-9]/.test(pascal) ? `_${pascal}` : pascal;
};
exports.enforceIdentifiableFirestoreType = (0, createRule_1.createRule)({
    name: 'enforce-identifiable-firestore-type',
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce that Firestore type definitions extend Identifiable and match their folder name',
            recommended: 'error',
        },
        schema: [],
        messages: {
            missingType: 'Expected exported type "{{ typeName }}" in index.ts under folder "{{ folderName }}". Create a type that matches the folder name: `export type {{ typeName }} = { /* fields */ }`.',
            notExtendingIdentifiable: 'Type "{{ typeName }}" must extend "Identifiable" to ensure all Firestore documents have an ID field. Add `extends Identifiable` or include `id: string`: `export type {{ typeName }} = { id: string; /* other fields */ }`.',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        const normalizedFilename = filename.replace(/\\/g, '/');
        const firestoreTypesPattern = /\/?functions\/src\/types\/firestore\/.*\/index\.ts$/;
        // Only apply rule to index.ts files in the firestore types directory
        if (!firestoreTypesPattern.test(normalizedFilename)) {
            return {};
        }
        // Get the expected type name from the parent folder
        const folderName = path_1.default.posix.basename(path_1.default.posix.dirname(normalizedFilename));
        const expectedTypeName = toPascalCase(folderName);
        const typeAliasMap = new Map();
        let hasExpectedType = false;
        let typeHasIdentifiable = false;
        let targetTypeAnnotation = null;
        const findIdentifiable = (type, checkedTypes = new Set()) => {
            if (!type)
                return false;
            if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                type.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                const typeName = type.typeName.name;
                if (typeName === 'Identifiable') {
                    return true;
                }
                if (!checkedTypes.has(typeName)) {
                    checkedTypes.add(typeName);
                    const alias = typeAliasMap.get(typeName);
                    if (alias?.typeAnnotation) {
                        if (findIdentifiable(alias.typeAnnotation, checkedTypes)) {
                            return true;
                        }
                    }
                    if (type.typeParameters?.params?.[0]) {
                        if (findIdentifiable(type.typeParameters.params[0], checkedTypes)) {
                            return true;
                        }
                    }
                }
            }
            else if (type.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                return type.types.some((part) => findIdentifiable(part, checkedTypes));
            }
            return false;
        };
        // Check if type has id: string field
        const checkIdField = (type) => {
            if (!type)
                return false;
            if (type.type === utils_1.AST_NODE_TYPES.TSTypeLiteral) {
                return type.members.some((member) => member.type === utils_1.AST_NODE_TYPES.TSPropertySignature &&
                    member.key.type === utils_1.AST_NODE_TYPES.Identifier &&
                    member.key.name === 'id' &&
                    member.typeAnnotation?.typeAnnotation.type ===
                        utils_1.AST_NODE_TYPES.TSStringKeyword);
            }
            if (type.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                return type.types.some(checkIdField);
            }
            return false;
        };
        // Check if type is wrapped in a utility type
        const isUtilityType = (type) => {
            return (!!type &&
                type.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                type.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                type.typeName.name === 'Resolve');
        };
        const checkIdentifiableExtension = (type) => {
            if (!type)
                return false;
            return findIdentifiable(type);
        };
        // Recursively check the type and its parameters
        const checkType = (type) => {
            if (!type)
                return false;
            if (checkIdentifiableExtension(type)) {
                return true;
            }
            if (checkIdField(type)) {
                return true;
            }
            if (isUtilityType(type) && type.typeParameters?.params?.[0]) {
                const wrapped = type.typeParameters.params[0];
                if (checkIdField(wrapped) || checkType(wrapped)) {
                    return true;
                }
            }
            if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                type.typeName.type === utils_1.AST_NODE_TYPES.Identifier) {
                const alias = typeAliasMap.get(type.typeName.name);
                if (alias?.typeAnnotation) {
                    if (checkType(alias.typeAnnotation)) {
                        return true;
                    }
                }
                if (type.typeParameters?.params?.[0]) {
                    return checkType(type.typeParameters.params[0]);
                }
            }
            if (type.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                return type.types.some(checkType);
            }
            return false;
        };
        return {
            Program() {
                // Reset flags for each file
                hasExpectedType = false;
                typeHasIdentifiable = false;
                targetTypeAnnotation = null;
                typeAliasMap.clear();
            },
            TSTypeAliasDeclaration(node) {
                typeAliasMap.set(node.id.name, node);
                if (node.id.name === expectedTypeName) {
                    hasExpectedType = true;
                    targetTypeAnnotation = node.typeAnnotation;
                }
            },
            'Program:exit'(node) {
                if (hasExpectedType && targetTypeAnnotation) {
                    typeHasIdentifiable = checkType(targetTypeAnnotation);
                }
                if (!hasExpectedType) {
                    context.report({
                        node,
                        messageId: 'missingType',
                        data: {
                            typeName: expectedTypeName,
                            folderName,
                        },
                    });
                }
                else if (!typeHasIdentifiable) {
                    context.report({
                        node,
                        messageId: 'notExtendingIdentifiable',
                        data: {
                            typeName: expectedTypeName,
                        },
                    });
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-identifiable-firestore-type.js.map