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

const isWindowsDrivePath = (filePath: string) =>
  /^[A-Za-z]:[\\/]/.test(filePath);

const isValidRelativePath = (relativePath: string) =>
  !path.isAbsolute(relativePath) && !isWindowsDrivePath(relativePath);

const buildReplacementPath = (sourceFilePath: string, cwd: string) => {
  const absoluteFilename = path.isAbsolute(sourceFilePath)
    ? sourceFilePath
    : path.join(cwd, sourceFilePath);
  const targetPath = path.join(cwd, MOCK_FIRESTORE_TARGET);
  const relativePath = path.relative(
    path.dirname(absoluteFilename),
    targetPath,
  );

  if (!isValidRelativePath(relativePath)) {
    return '';
  }

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
  if (pattern.properties.length !== 1) {
    return null;
  }

  const [property] = pattern.properties;
  if (property.type !== AST_NODE_TYPES.Property) {
    return null;
  }

  if (property.value.type === AST_NODE_TYPES.AssignmentPattern) {
    return null;
  }

  if (property.value.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }

  const localName = property.value.name;
  const replacement =
    localName === 'mockFirestore'
      ? '{ mockFirestore }'
      : `{ mockFirestore: ${localName} }`;

  return fixer.replaceText(pattern, replacement);
};

const constructImportStatement = (
  localName: string,
  replacementPath: string,
) => {
  const binding =
    localName === 'mockFirestore'
      ? 'mockFirestore'
      : `mockFirestore as ${localName}`;

  return `import { ${binding} } from '${replacementPath}';`;
};

const getSingleValueImportSpecifier = (
  node: TSESTree.ImportDeclaration,
): TSESTree.ImportSpecifier | null => {
  const valueSpecifiers = node.specifiers.filter(
    (specifier): specifier is TSESTree.ImportSpecifier =>
      specifier.type === AST_NODE_TYPES.ImportSpecifier &&
      specifier.importKind !== 'type',
  );

  const hasTypeSpecifiers = node.specifiers.some(
    (specifier) =>
      specifier.type === AST_NODE_TYPES.ImportSpecifier &&
      specifier.importKind === 'type',
  );

  const hasUnsupportedSpecifier = node.specifiers.some(
    (specifier) =>
      specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
      specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
  );

  if (
    valueSpecifiers.length !== 1 ||
    hasTypeSpecifiers ||
    hasUnsupportedSpecifier
  ) {
    return null;
  }

  return valueSpecifiers[0];
};

const buildImportDeclarationFix = (
  node: TSESTree.ImportDeclaration,
  replacementPath: string,
): string | null => {
  if (!replacementPath) {
    return null;
  }

  const specifier = getSingleValueImportSpecifier(node);

  if (!specifier) {
    return null;
  }

  return constructImportStatement(specifier.local.name, replacementPath);
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
        'What\'s wrong: This test imports "{{moduleName}}" directly → Why it matters: it bypasses the centralized mockFirestore helper that mirrors production schema and keeps seeding/cleanup consistent, which leads to inconsistent data and flaky tests → How to fix: import { mockFirestore } from "{{replacementPath}}" instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceFilePath = context.getFilename();

    // Only apply rule to test files
    if (!sourceFilePath.endsWith('.test.ts')) {
      return {};
    }

    const cwd =
      typeof context.getCwd === 'function' ? context.getCwd() : process.cwd();
    const replacementPath = buildReplacementPath(sourceFilePath, cwd);
    const messageReplacementPath =
      replacementPath ||
      ensureRelativeSpecifier(toPosixPath(MOCK_FIRESTORE_TARGET));
    const reportData = {
      moduleName: FIRESTORE_JEST_MOCK,
      replacementPath: messageReplacementPath,
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
              const replacementImport = buildImportDeclarationFix(
                node,
                replacementPath,
              );

              if (!replacementImport) {
                return null;
              }

              return fixer.replaceText(node, replacementImport);
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
              if (!replacementPath) {
                return null;
              }

              if (!variableDeclarator) {
                return null;
              }

              if (variableDeclarator.id.type !== AST_NODE_TYPES.ObjectPattern) {
                return null;
              }

              const destructuringFix = buildDestructuringFix(
                fixer,
                variableDeclarator.id,
              );

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
