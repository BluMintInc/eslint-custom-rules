import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const enforceFirebaseImports = createRule({
  name: 'enforce-dynamic-firebase-imports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce dynamic importing for modules within the firebaseCloud directory to optimize initial bundle size. This ensures Firebase-related code is only loaded when needed, improving application startup time and reducing the main bundle size.',
      recommended: 'error',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      noDynamicImport:
        'Static imports from firebaseCloud directory are not allowed to reduce initial bundle size. Instead of `import { func } from "./firebaseCloud/module"`, use dynamic import: `const { func } = await import("./firebaseCloud/module")`.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        // Skip third-party files
        const filename = context.getFilename?.();
        if (filename && /(^|[\\/])node_modules([\\/]|$)/.test(filename)) {
          return;
        }

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
          fix(fixer) {
            const replacement = buildReplacement();
            return replacement ? fixer.replaceText(node, replacement) : null;
          },
          suggest: [
            {
              messageId: 'noDynamicImport',
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
