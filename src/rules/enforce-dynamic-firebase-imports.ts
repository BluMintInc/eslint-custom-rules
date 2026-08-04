import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const THIRD_PARTY_DIRECTORY = /(^|\/)node_modules(\/|$)/;

// Anchored at the end of the path so multi-part suffixes such as
// `useStartMatch.integration.test.ts` are recognized while production modules
// that merely contain the word (`latest.tsx`, `contest.ts`, `testHelpers.ts`)
// keep their enforcement.
const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Jest convention directories hold test-only modules regardless of file name.
const TEST_FILE_DIRECTORY = /(^|\/)(__tests__|__mocks__)\//;

/**
 * The rule's rationale is bundle weight: a static import pulls Firebase into the
 * initial client chunk. A suite, a Jest manual mock and a declaration file are
 * never part of that chunk, so there is nothing to inflate and the rule has
 * nothing to enforce there.
 *
 * The exemption is load-bearing rather than cosmetic because the rule is
 * fixable: a suite's static binding is exactly what `jest.mock()` hoisting
 * intercepts, and rewriting it emits a module-scope `await import(...)` that a
 * CommonJS test transform cannot even parse (issue #1715).
 */
const isNeverBundled = (filename: string) =>
  filename.endsWith('.d.ts') ||
  TEST_FILE_SUFFIX.test(filename) ||
  TEST_FILE_DIRECTORY.test(filename);

const enforceFirebaseImports = createRule({
  name: 'enforce-dynamic-firebase-imports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed.',
      recommended: 'error',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      noDynamicImport:
        'Static import from firebaseCloud path "{{importPath}}" eagerly bundles Firebase code into the initial client chunk, which inflates startup time and prevents lazy loading. Replace it with an awaited dynamic import so the code only loads when invoked (e.g., `const module = await import(\'{{importPath}}\')` or destructure the exports you need).',
    },
  },
  defaultOptions: [],
  create(context) {
    // Normalize Windows backslash separators so the forward-slash directory
    // checks match on every platform. Without this, `getFilename()` returns
    // `C:\repo\src\hooks\__tests__\Foo.ts` on Windows and the exemption
    // silently fails there.
    const filename = (context.getFilename?.() ?? '').replace(/\\/g, '/');

    // `<input>`/`<text>` are the synthetic names RuleTester uses when a case
    // declares no filename. They match none of the exemptions below, so a
    // snippet keeps its enforcement — unlike a path-gated rule, this one has no
    // include list to fall outside of.
    if (THIRD_PARTY_DIRECTORY.test(filename) || isNeverBundled(filename)) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        // Skip type-only import declarations
        if (node.importKind === 'type') {
          return;
        }

        const importPath = node.source.value as string;

        // Check if the import is from firebaseCloud directory
        if (!importPath.includes('firebaseCloud/')) {
          return;
        }

        // Determine specifiers
        const defaultSpecifier = node.specifiers.find(
          (spec): spec is TSESTree.ImportDefaultSpecifier =>
            spec.type === 'ImportDefaultSpecifier',
        );
        const namespaceSpecifier = node.specifiers.find(
          (spec): spec is TSESTree.ImportNamespaceSpecifier =>
            spec.type === 'ImportNamespaceSpecifier',
        );
        const namedSpecifiers = node.specifiers.filter(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === 'ImportSpecifier' && spec.importKind !== 'type',
        );
        const typeOnlySpecifiers = node.specifiers.filter(
          (spec): spec is TSESTree.ImportSpecifier =>
            spec.type === 'ImportSpecifier' && spec.importKind === 'type',
        );

        // If there are only type-only specifiers, allow
        if (
          !defaultSpecifier &&
          !namespaceSpecifier &&
          namedSpecifiers.length === 0 &&
          typeOnlySpecifiers.length > 0
        ) {
          return;
        }

        const buildTypeNames = (): string =>
          typeOnlySpecifiers
            .map((spec) =>
              spec.imported.name === spec.local.name
                ? spec.imported.name
                : `${spec.imported.name} as ${spec.local.name}`,
            )
            .join(', ');

        const buildReplacement = (
          options: {
            allowSideEffectFix?: boolean;
          } = {},
        ): string | null => {
          const statements: string[] = [];

          if (typeOnlySpecifiers.length > 0) {
            statements.push(
              `import type { ${buildTypeNames()} } from '${importPath}';`,
            );
          }

          if (namespaceSpecifier) {
            const nsLocal = namespaceSpecifier.local.name;
            statements.push(
              `const ${nsLocal} = await import('${importPath}');`,
            );

            if (defaultSpecifier) {
              const defLocal = defaultSpecifier.local.name;
              statements.push(`const ${defLocal} = ${nsLocal}.default;`);
            }

            const destructureFromNamespace: string[] = [];
            if (namedSpecifiers.length > 0) {
              const destructureParts = namedSpecifiers.map((spec) => {
                const imported = spec.imported.name;
                const local = spec.local.name;
                return imported === local ? imported : `${imported}: ${local}`;
              });
              destructureFromNamespace.push(...destructureParts);
            }

            if (destructureFromNamespace.length > 0) {
              statements.push(
                `const { ${destructureFromNamespace.join(
                  ', ',
                )} } = ${nsLocal};`,
              );
            }

            return statements.join(' ');
          }

          const destructureParts: string[] = [];

          if (defaultSpecifier) {
            const defLocal = defaultSpecifier.local.name;
            destructureParts.push(`default: ${defLocal}`);
          }

          if (namedSpecifiers.length > 0) {
            for (const spec of namedSpecifiers) {
              const imported = spec.imported.name;
              const local = spec.local.name;
              destructureParts.push(
                imported === local ? imported : `${imported}: ${local}`,
              );
            }
          }

          if (destructureParts.length > 0) {
            statements.push(
              `const { ${destructureParts.join(
                ', ',
              )} } = await import('${importPath}');`,
            );
            return statements.join(' ');
          }

          if (node.specifiers.length === 0) {
            return options.allowSideEffectFix !== false
              ? `await import('${importPath}');`
              : null;
          }

          return null;
        };

        context.report({
          node,
          messageId: 'noDynamicImport',
          data: { importPath },
          fix(fixer) {
            const replacement = buildReplacement();
            return replacement ? fixer.replaceText(node, replacement) : null;
          },
          suggest: [
            {
              messageId: 'noDynamicImport',
              data: { importPath },
              fix(fixer) {
                const replacement = buildReplacement({
                  allowSideEffectFix: true,
                });
                return replacement
                  ? fixer.replaceText(node, replacement)
                  : null;
              },
            },
          ],
        });
      },
    };
  },
});

export default enforceFirebaseImports;
