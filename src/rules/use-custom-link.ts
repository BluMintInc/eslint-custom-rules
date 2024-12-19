import { createRule } from '../utils/createRule';

export const useCustomLink = createRule({
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
      useCustomLink: 'Import Link from src/components/Link instead of next/link',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/link') {
          const importSpecifiers = node.specifiers;
          
          // Handle different import types (default, named, namespace)
          const hasDefaultImport = importSpecifiers.some(
            (specifier) => specifier.type === 'ImportDefaultSpecifier'
          );
          
          if (hasDefaultImport) {
            context.report({
              node,
              messageId: 'useCustomLink',
              fix(fixer) {
                // Get the local name of the imported Link component
                const defaultSpecifier = importSpecifiers.find(
                  (specifier) => specifier.type === 'ImportDefaultSpecifier'
                );
                const localName = defaultSpecifier?.local?.name || 'Link';

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
