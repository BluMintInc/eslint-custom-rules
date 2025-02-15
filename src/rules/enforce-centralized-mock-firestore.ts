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
        if (node.id.type === AST_NODE_TYPES.Identifier && node.id.name === 'mockFirestore') {
          mockFirestoreNodes.push(node);
        } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          for (const prop of node.id.properties) {
            if (prop.type === AST_NODE_TYPES.Property &&
                prop.key.type === AST_NODE_TYPES.Identifier &&
                prop.key.name === 'mockFirestore') {
              mockFirestoreNodes.push(node);
              break;
            }
          }
        }
      },

      CallExpression(node) {
        if (node.callee.type === AST_NODE_TYPES.Identifier &&
            node.callee.name === 'require' &&
            node.arguments.length > 0 &&
            node.arguments[0].type === AST_NODE_TYPES.Literal &&
            typeof node.arguments[0].value === 'string' &&
            !node.arguments[0].value.endsWith(MOCK_FIRESTORE_PATH)) {
          const parent = node.parent;
          if (parent?.type === AST_NODE_TYPES.VariableDeclarator &&
              parent.id.type === AST_NODE_TYPES.ObjectPattern) {
            for (const prop of parent.id.properties) {
              if (prop.type === AST_NODE_TYPES.Property &&
                  prop.key.type === AST_NODE_TYPES.Identifier &&
                  prop.key.name === 'mockFirestore') {
                mockFirestoreNodes.push(parent);
                break;
              }
            }
          }
        }
      },

      'Program:exit'() {
        if (!hasCentralizedImport && mockFirestoreNodes.length > 0) {
          const sourceCode = context.getSourceCode();
          const firstNode = sourceCode.ast.body[0];
          const indentation = sourceCode.text.slice(0, firstNode.range[0]).match(/[ \t]*/)?.[0] || '';
          const importText = `import { mockFirestore } from '${MOCK_FIRESTORE_PATH}';\n\n`;

          // Report only the first node
          const node = mockFirestoreNodes[0];

          context.report({
            node,
            messageId: 'useCentralizedMockFirestore',
            fix(fixer) {
              // Add import statement
              return fixer.insertTextBefore(firstNode, importText);
            },
          });
        }
      },
    };
  },
});
