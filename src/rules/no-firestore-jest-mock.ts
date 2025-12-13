import path from 'path';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type MessageIds = 'noFirestoreJestMock';

const FIRESTORE_JEST_MOCK = 'firestore-jest-mock';
const MOCK_FIRESTORE_TARGET = '__test-utils__/mockFirestore';

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, '/');

const ensureRelativeSpecifier = (specifier: string) =>
  specifier.startsWith('.') ? specifier : `./${specifier}`;

const buildReplacementPath = (sourceFilePath: string, cwd: string) => {
  const absoluteFilename = path.isAbsolute(sourceFilePath)
    ? sourceFilePath
    : path.join(cwd, sourceFilePath);
  const targetPath = path.join(cwd, MOCK_FIRESTORE_TARGET);
  const relativePath = path.relative(path.dirname(absoluteFilename), targetPath);

  return ensureRelativeSpecifier(toPosixPath(relativePath));
};

const findVariableDeclarator = (
  node: TSESTree.ImportExpression,
): TSESTree.VariableDeclarator | null => {
  const { parent } = node;

  if (parent?.type === AST_NODE_TYPES.VariableDeclarator) {
    return parent;
  }

  if (
    parent?.type === AST_NODE_TYPES.AwaitExpression &&
    parent.parent?.type === AST_NODE_TYPES.VariableDeclarator
  ) {
    return parent.parent;
  }

  return null;
};

const buildDestructuringFix = (
  fixer: TSESLint.RuleFixer,
  pattern: TSESTree.ObjectPattern,
): TSESLint.RuleFix | null => {
  const mappedProperties = pattern.properties
    .map((property) => {
      if (property.type !== AST_NODE_TYPES.Property) {
        return null;
      }

      const value =
        property.value.type === AST_NODE_TYPES.AssignmentPattern
          ? property.value.left
          : property.value;

      if (value.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }

      const localName = value.name;

      return localName === 'mockFirestore'
        ? 'mockFirestore'
        : `mockFirestore: ${localName}`;
    })
    .filter((property): property is string => property !== null);

  if (mappedProperties.length === 0) {
    return null;
  }

  return fixer.replaceText(pattern, `{ ${mappedProperties.join(', ')} }`);
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
          const variableDeclarator = findVariableDeclarator(node);
          context.report({
            node,
            messageId: 'noFirestoreJestMock',
            data: reportData,
            fix: (fixer) => {
              const fixes = [
                fixer.replaceText(node.source, `'${replacementPath}'`),
              ];

              if (variableDeclarator?.id.type === AST_NODE_TYPES.ObjectPattern) {
                const destructuringFix = buildDestructuringFix(
                  fixer,
                  variableDeclarator.id,
                );

                if (destructuringFix) {
                  fixes.push(destructuringFix);
                } else {
                  fixes.push(
                    fixer.replaceText(
                      variableDeclarator.id,
                      '{ mockFirestore }',
                    ),
                  );
                }
              }

              // Destructuring in promise chains (e.g., import().then(({ mockFirestore }) => {}))
              // stays reported but only the module specifier is rewritten to avoid unsafe edits.
              return fixes;
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
