import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const preferFragmentShorthand = createRule<[], 'preferShorthand'>({
  name: 'prefer-fragment-shorthand',
  create(context) {
    return {
      JSXElement(node: TSESTree.JSXElement) {
        const openingElement = node.openingElement;
        // The <> shorthand cannot carry attributes, so an attributed fragment
        // (key, spread, ...) has no valid rewrite and must not be reported.
        if (openingElement.attributes.length > 0) {
          return;
        }
        if (
          openingElement.name.type === 'JSXMemberExpression' &&
          openingElement.name.object.type === 'JSXIdentifier' &&
          openingElement.name.object.name === 'React' &&
          openingElement.name.property.type === 'JSXIdentifier' &&
          openingElement.name.property.name === 'Fragment'
        ) {
          context.report({
            node,
            messageId: 'preferShorthand',
            data: { fragmentName: 'React.Fragment' },
            fix: (fixer) => {
              const { closingElement } = node;
              // A self-closing <React.Fragment /> has no children and no
              // closing element; <></> is its equivalent shorthand.
              if (!closingElement) {
                return fixer.replaceText(node, '<></>');
              }
              return [
                fixer.replaceTextRange(openingElement.range, '<>'),
                fixer.replaceTextRange(closingElement.range, '</>'),
              ];
            },
          });
        }
      },
    };
  },
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer <> shorthand for <React.Fragment>',
      recommended: 'error',
    },
    messages: {
      preferShorthand:
        'Fragment "{{fragmentName}}" is written with the long <React.Fragment> syntax. That form adds React namespace noise and is only necessary when you need a key or other attributes on the fragment. Prefer the <>...</> shorthand to keep JSX concise, and keep the long form only when fragment attributes are required.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
});
