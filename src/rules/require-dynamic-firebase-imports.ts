import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const RULE_NAME = 'require-dynamic-firebase-imports';

export default createRule({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce dynamic imports for Firebase dependencies',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      requireDynamicImport:
        'Firebase dependencies must be imported dynamically to reduce bundle size',
    },
  },
  defaultOptions: [],
  create(context) {
    const isFirebaseImport = (source: string): boolean => {
      return (
        source.startsWith('firebase/') ||
        source.includes('config/firebase-client')
      );
    };

    const createDynamicImport = (node: TSESTree.ImportDeclaration): string => {
      const importSource = node.source.value;
      const importSpecifiers = node.specifiers;

      if (importSpecifiers.length === 0) {
        // For side-effect imports like 'firebase/auth'
        return `await import('${importSource}');`;
      }

      if (importSpecifiers.length === 1) {
        const spec = importSpecifiers[0];
        if (spec.type === 'ImportDefaultSpecifier') {
          // For default imports
          return `const ${spec.local.name} = (await import('${importSource}')).default;`;
        }
        if (spec.type === 'ImportSpecifier') {
          // For single named import
          const importedName = spec.imported.name;
          const localName = spec.local.name;
          if (importedName === localName) {
            return `const { ${localName} } = await import('${importSource}');`;
          }
          return `const { ${importedName}: ${localName} } = await import('${importSource}');`;
        }
      }

      // For multiple named imports
      const importedModule = `await import('${importSource}')`;
      const namedImports = importSpecifiers
        .map((spec) => {
          if (spec.type === 'ImportSpecifier') {
            const importedName = spec.imported.name;
            const localName = spec.local.name;
            return importedName === localName
              ? localName
              : `${importedName}: ${localName}`;
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');

      return `const { ${namedImports} } = ${importedModule};`;
    };

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importSource = node.source.value;

        if (
          typeof importSource === 'string' &&
          isFirebaseImport(importSource) &&
          !node.importKind?.includes('type')
        ) {
          context.report({
            node,
            messageId: 'requireDynamicImport',
            fix(fixer) {
              const dynamicImport = createDynamicImport(node);
              return fixer.replaceText(node, dynamicImport);
            },
          });
        }
      },
    };
  },
});
