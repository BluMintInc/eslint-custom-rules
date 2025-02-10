import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFirestoreJestMock';

export const noFirestoreJestMock = createRule<[], MessageIds>({
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
            noFirestoreJestMock: 'Do not import from firestore-jest-mock. Use mockFirestore from the centralized mock utility instead.',
        },
    },
    defaultOptions: [],
    create(context) {
        const filename = context.getFilename();

        // Only apply rule to test files
        if (!filename.endsWith('.test.ts')) {
            return {};
        }

        return {
            ImportDeclaration(node) {
                if (node.source.value === 'firestore-jest-mock') {
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                        fix(fixer) {
                            // Replace with mockFirestore import
                            return fixer.replaceText(
                                node,
                                "import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';"
                            );
                        },
                    });
                }
            },
            CallExpression(node) {
                // Check for jest.mock('firestore-jest-mock')
                if (
                    node.callee.type === AST_NODE_TYPES.MemberExpression &&
                    node.callee.object.type === AST_NODE_TYPES.Identifier &&
                    node.callee.object.name === 'jest' &&
                    node.callee.property.type === AST_NODE_TYPES.Identifier &&
                    node.callee.property.name === 'mock' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === AST_NODE_TYPES.Literal &&
                    node.arguments[0].value === 'firestore-jest-mock'
                ) {
                    context.report({
                        node,
                        messageId: 'noFirestoreJestMock',
                    });
                }
            },
        };
    },
});
