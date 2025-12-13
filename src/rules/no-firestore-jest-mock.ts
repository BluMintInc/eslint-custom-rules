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
  if (pattern.properties.length !== 1) {
    return null;
  }

  const [property] = pattern.properties;
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
  const replacement =
    localName === 'mockFirestore'
      ? '{ mockFirestore }'
      : `{ mockFirestore: ${localName} }`;

  return fixer.replaceText(pattern, replacement);
};

const buildImportDeclarationFix = (
  node: TSESTree.ImportDeclaration,
  replacementPath: string,
): string | null => {
  const nonTypeImportSpecifiers = node.specifiers.filter(
    (specifier): specifier is TSESTree.ImportSpecifier =>
      specifier.type === AST_NODE_TYPES.ImportSpecifier &&
      specifier.importKind !== 'type',
  );

  if (
    nonTypeImportSpecifiers.length !== 1 ||
    node.specifiers.some(
      (specifier) =>
        specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier ||
        specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
    )
  ) {
    return null;
  }

  const [specifier] = nonTypeImportSpecifiers;
  const localName = specifier.local.name;
  const binding =
    localName === 'mockFirestore'
      ? 'mockFirestore'
      : `mockFirestore as ${localName}`;

  return `import { ${binding} } from '${replacementPath}';`;
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
              const destructuringFix =
                variableDeclarator?.id.type === AST_NODE_TYPES.ObjectPattern
                  ? buildDestructuringFix(fixer, variableDeclarator.id)
                  : null;

              // Avoid unsafe autofix when multiple bindings are destructured.
              if (
                variableDeclarator?.id.type === AST_NODE_TYPES.ObjectPattern &&
                !destructuringFix
              ) {
                return null;
              }

              const fixes = [
                fixer.replaceText(node.source, `'${replacementPath}'`),
              ];

              if (destructuringFix) {
                fixes.push(destructuringFix);
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
