"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceIdentifiableFirestoreType = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const path_1 = __importDefault(require("path"));
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
            missingType: 'Expected exported type "{{ typeName }}" in index.ts under folder "{{ folderName }}"',
            notExtendingIdentifiable: 'Type "{{ typeName }}" must extend "Identifiable", including an "id: string" field',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();
        const firestoreTypesPattern = /functions\/src\/types\/firestore\/.*\/index\.ts$/;
        // Only apply rule to index.ts files in the firestore types directory
        if (!firestoreTypesPattern.test(filename)) {
            return {};
        }
        // Get the expected type name from the parent folder
        const folderName = path_1.default.basename(path_1.default.dirname(filename));
        let hasExpectedType = false;
        let typeHasIdentifiable = false;
        return {
            Program() {
                // Reset flags for each file
                hasExpectedType = false;
                typeHasIdentifiable = false;
            },
            'Program:exit'(node) {
                if (!hasExpectedType) {
                    context.report({
                        node,
                        messageId: 'missingType',
                        data: {
                            typeName: folderName,
                            folderName,
                        },
                    });
                }
                else if (!typeHasIdentifiable) {
                    context.report({
                        node,
                        messageId: 'notExtendingIdentifiable',
                        data: {
                            typeName: folderName,
                        },
                    });
                }
            },
            TSTypeAliasDeclaration(node) {
                if (node.id.name === folderName) {
                    hasExpectedType = true;
                    // Check if type extends Identifiable
                    // Check if type extends Identifiable directly or through a generic type
                    const checkIdentifiable = (type) => {
                        if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                            type.typeName.type === utils_1.AST_NODE_TYPES.Identifier &&
                            type.typeName.name === 'Identifiable') {
                            return true;
                        }
                        if (type.type === utils_1.AST_NODE_TYPES.TSIntersectionType) {
                            return type.types.some(checkIdentifiable);
                        }
                        if (type.type === utils_1.AST_NODE_TYPES.TSTypeReference &&
                            type.typeParameters?.params) {
                            return type.typeParameters.params.some(checkIdentifiable);
                        }
                        return false;
                    };
                    typeHasIdentifiable = checkIdentifiable(node.typeAnnotation);
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-identifiable-firestore-type.js.map