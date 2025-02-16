import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'useCentralizedMockFirestore';

const MOCK_FIRESTORE_PATH = '../../../../../__test-utils__/mockFirestore';

export const enforceCentralizedMockFirestore = createRule<[], MessageIds>({
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
    let mockFirestoreNodes: TSESTree.Node[] = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value.endsWith(MOCK_FIRESTORE_PATH)) {
          hasCentralizedImport = true;
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type === AST_NODE_TYPES.Identifier &&
          node.id.name === 'mockFirestore'
        ) {
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
                const importFix = fixer.insertTextBefore(
                  context.getSourceCode().ast.body[0],
                  `import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';\n\n`
                );

                const declarationFix = fixer.remove(node.parent as TSESTree.Node);

                return [importFix, declarationFix];
              },
            });
          }
        }
      },
    };
  },
});
