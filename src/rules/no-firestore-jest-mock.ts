import path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFirestoreJestMock';

const FIRESTORE_JEST_MOCK = 'firestore-jest-mock';
const MOCK_FIRESTORE_TARGET = '__test-utils__/mockFirestore';

const toPosixPath = (value: string) => value.replace(/\\/g, '/');

const ensureRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('.') ? specifier : `./${specifier}`;

const buildReplacementPath = (filename: string, cwd: string) => {
  const absoluteFilename = path.isAbsolute(filename)
    ? filename
    : path.join(cwd, filename);
  const targetPath = path.join(cwd, MOCK_FIRESTORE_TARGET);
  const relativePath = path.relative(path.dirname(absoluteFilename), targetPath);

  return ensureRelativeSpecifier(toPosixPath(relativePath));
};

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
      noFirestoreJestMock:
        'Importing "{{moduleName}}" in tests bypasses the shared mockFirestore helper that mirrors production schema and centralized seeding/cleanup. Use mockFirestore from "{{replacementPath}}" so Firestore tests stay consistent and avoid flaky state.',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();

    // Only apply rule to test files
    if (!filename.endsWith('.test.ts')) {
      return {};
    }

    const cwd = typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const replacementPath = buildReplacementPath(filename, cwd);
    const reportData = {
      moduleName: FIRESTORE_JEST_MOCK,
      replacementPath,
    } as const;

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
              return fixer.replaceText(
                node,
                `import { mockFirestore } from '${replacementPath}';`,
              );
            },
          });
        }
      },
      ImportExpression(node) {
        if (
          node.source.type === AST_NODE_TYPES.Literal &&
          node.source.value === FIRESTORE_JEST_MOCK
        ) {
          context.report({
            node,
            messageId: 'noFirestoreJestMock',
            data: reportData,
            fix: (fixer) => {
              if (node.source.type !== AST_NODE_TYPES.Literal) {
                return null;
              }

              return fixer.replaceText(
                node.source,
                `'${replacementPath}'`,
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
          node.arguments[0].value === FIRESTORE_JEST_MOCK
        ) {
          context.report({
            node,
            messageId: 'noFirestoreJestMock',
            data: reportData,
          });
        }

        // Check for require('firestore-jest-mock')
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === AST_NODE_TYPES.Literal &&
          node.arguments[0].value === FIRESTORE_JEST_MOCK
        ) {
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
