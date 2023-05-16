import { TSESLint, TSESTree } from '@typescript-eslint/utils';

const preferFragmentShorthand: TSESLint.RuleModule<'preferShorthand', []> = {
    create(context) {
        return {
          JSXElement(node: TSESTree.JSXElement) {
            const openingElement = node.openingElement;
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
                fix: (fixer) => [
                  fixer.replaceTextRange(
                    openingElement.range,
                    '<>'
                  ),
                  fixer.replaceTextRange(
                    node.closingElement!.range,
                    '</>'
                  ),
                ],
              });
            }
          },
        };
      },
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer <> shorthand for <React.Fragment>',
      recommended: 'warn',
    },
    messages: {
      preferShorthand: 'Use <> shorthand for <React.Fragment>',
    },
    schema: [],
    fixable: 'code',
},
defaultOptions: [],
};

export {preferFragmentShorthand}