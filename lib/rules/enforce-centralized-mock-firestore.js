"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceCentralizedMockFirestore = void 0;
const utils_1 = require("@typescript-eslint/utils");
const createRule_1 = require("../utils/createRule");
const MOCK_FIRESTORE_PATH = '../../../../../__mocks__/functions/src/config/mockFirestore';
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
        let mockFirestoreNodes = [];
        return {
            ImportDeclaration(node) {
                if (node.source.value.endsWith(MOCK_FIRESTORE_PATH)) {
                    hasCentralizedImport = true;
                }
            },
            VariableDeclarator(node) {
                if (node.id.type === utils_1.AST_NODE_TYPES.Identifier &&
                    node.id.name === 'mockFirestore') {
                    mockFirestoreNodes.push(node);
                }
            },
            'Program:exit'() {
                if (!hasCentralizedImport && mockFirestoreNodes.length > 0) {
                    for (const node of mockFirestoreNodes) {
                        context.report({
                            node,
                            messageId: 'useCentralizedMockFirestore',
                            fix(fixer) {
                                const importFix = fixer.insertTextBefore(context.getSourceCode().ast.body[0], `import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';\n\n`);
                                const declarationFix = fixer.remove(node.parent);
                                return [importFix, declarationFix];
                            },
                        });
                    }
                }
            },
        };
    },
});
//# sourceMappingURL=enforce-centralized-mock-firestore.js.map