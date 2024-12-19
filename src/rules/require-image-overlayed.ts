import { createRule } from '../utils/createRule';

export = createRule({
  name: 'require-image-overlayed',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using ImageOverlayed component instead of next/image or img tags',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          componentPath: {
            type: 'string',
            default: 'src/components/ImageOverlayed',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useImageOverlayed:
        'Use ImageOverlayed component from {{ componentPath }} instead of {{ component }}',
    },
  },
  defaultOptions: [{ componentPath: 'src/components/ImageOverlayed' }],

  create(context) {
    const options = context.options[0] || {
      componentPath: 'src/components/ImageOverlayed',
    };
    const sourceCode = context.getSourceCode();

    return {
      // Handle JSX img elements
      JSXElement(node: any) {
        if (node.openingElement.name.name === 'img') {
          context.report({
            node,
            messageId: 'useImageOverlayed',
            data: {
              componentPath: options.componentPath,
              component: 'img tag',
            },
            fix(fixer) {
              const attributes = node.openingElement.attributes
                .map((attr: any) => sourceCode.getText(attr))
                .join(' ');
              return fixer.replaceText(
                node,
                `<ImageOverlayed ${attributes} />`,
              );
            },
          });
        }
      },

      // Handle next/image imports and usage
      ImportDeclaration(node: any) {
        if (node.source.value === 'next/image' && node.specifiers.length > 0) {
          const imageSpecifier = node.specifiers.find(
            (spec: any) =>
              (spec.type === 'ImportDefaultSpecifier' ||
                spec.type === 'ImportSpecifier') &&
              (spec.local.name === 'Image' || spec.imported?.name === 'Image'),
          );

          if (imageSpecifier) {
            const localName = imageSpecifier.local.name;

            // Report the import
            context.report({
              node,
              messageId: 'useImageOverlayed',
              data: {
                componentPath: options.componentPath,
                component: 'next/image',
              },
              fix(fixer) {
                return fixer.replaceText(
                  node,
                  `import ${localName} from '${options.componentPath}';`,
                );
              },
            });
          }
        }
      },
    };
  },
});
