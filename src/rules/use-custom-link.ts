import { createRule } from '../utils/createRule';

type Options = [];
type MessageIds = 'useCustomLink';

export const useCustomLink = createRule<Options, MessageIds>({
  name: 'use-custom-link',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce using src/components/Link instead of next/link',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useCustomLink:
        'Import "{{localName}}" from src/components/Link instead of next/link. The custom Link wraps Next.js navigation with design system defaults and analytics hooks; importing next/link bypasses those wrappers and leads to inconsistent styling and missing instrumentation. Replace the import source with src/components/Link so routing uses the shared wrapper.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/link') {
          const importSpecifiers = node.specifiers;

          // Handle different import types (default, named, namespace)
          const defaultSpecifier = importSpecifiers.find(
            (specifier) => specifier.type === 'ImportDefaultSpecifier',
          );

          const defaultAsSpecifier = importSpecifiers.find(
            (specifier) =>
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.name === 'default',
          );

          if (defaultSpecifier || defaultAsSpecifier) {
            context.report({
              node,
              messageId: 'useCustomLink',
              data: {
                localName:
                  defaultSpecifier?.local?.name ||
                  defaultAsSpecifier?.local?.name ||
                  'Link',
              },
              fix(fixer) {
                // Get the local name of the imported Link component
                const localName =
                  defaultSpecifier?.local?.name ||
                  defaultAsSpecifier?.local?.name ||
                  'Link';

                // Create the new import statement
                const newImport = `import ${localName} from 'src/components/Link';`;

                return fixer.replaceText(node, newImport);
              },
            });
          }
        }
      },
    };
  },
});
