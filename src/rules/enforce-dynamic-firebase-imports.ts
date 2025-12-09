import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const enforceFirebaseImports = createRule({
  name: 'enforce-dynamic-firebase-imports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed.',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noDynamicImport:
        'Static import from firebaseCloud path "{{importPath}}" eagerly bundles Firebase handlers into the initial client chunk, which inflates startup time and prevents lazy loading. Replace it with an awaited dynamic import so the code only loads when invoked (e.g., `const module = await import(\'{{importPath}}\')` or destructure the exports you need).',
    },
  },
  defaultOptions: [],
  create(context) {
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

        context.report({
          node,
          messageId: 'noDynamicImport',
          data: { importPath },
          fix(fixer) {
            const statements: string[] = [];

            // Preserve type-only specifiers by keeping a type import
            if (typeOnlySpecifiers.length > 0) {
              const typeNames = typeOnlySpecifiers
                .map((spec) => {
                  const importedName = spec.imported.name;
                  const localName = spec.local.name;
                  return importedName === localName
                    ? importedName
                    : `${importedName} as ${localName}`;
                })
                .join(', ');
              statements.push(
                `import type { ${typeNames} } from '${importPath}';`,
              );
            }

            // When namespace import exists
            if (namespaceSpecifier) {
              const nsLocal = namespaceSpecifier.local.name;
              statements.push(
                `const ${nsLocal} = await import('${importPath}');`,
              );
              // If default is also requested, assign from namespace
              if (defaultSpecifier) {
                const defLocal = defaultSpecifier.local.name;
                statements.push(`const ${defLocal} = ${nsLocal}.default;`);
              }
              // If named value specifiers also exist, destructure from namespace
              if (namedSpecifiers.length > 0) {
                const destructureParts = namedSpecifiers.map((spec) => {
                  const imported = spec.imported.name;
                  const local = spec.local.name;
                  return imported === local
                    ? imported
                    : `${imported}: ${local}`;
                });
                statements.push(
                  `const { ${destructureParts.join(', ')} } = ${nsLocal};`,
                );
              }

              // Return the combined replacement
              return fixer.replaceText(node, statements.join(' '));
            }

            // Build destructuring-based dynamic import when default or named imports exist
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
              return fixer.replaceText(node, statements.join(' '));
            }

            // Side-effect import (no specifiers): convert to awaited dynamic import
            if (node.specifiers.length === 0) {
              return fixer.replaceText(node, `await import('${importPath}');`);
            }

            // If nothing can be fixed safely, do not provide a fix
            return null;
          },
        });
      },
    };
  },
});
