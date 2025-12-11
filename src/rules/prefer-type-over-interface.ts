import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const preferTypeOverInterface: TSESLint.RuleModule<
  'preferType',
  never[]
> = createRule({
  name: 'prefer-type-over-interface',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer using type alias over interface',
      recommended: 'error',
    },
    schema: [],
    messages: {
      preferType: 'Prefer using type alias over interface.',
    },
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    return {
      TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
        context.report({
          node,
          messageId: 'preferType',
          fix(fixer) {
            const sourceCode = context.sourceCode;
            const openingBrace = sourceCode.getTokenAfter(node.id, {
              filter: (token) => token.value === '{',
            });
            const fixes = [
              fixer.replaceTextRange(
                [node.range[0], node.id.range[1]],
                `type ${node.id.name} =`,
              ),
            ];

            if (node.extends && node.extends.length > 0 && openingBrace) {
              const extendsKeyword = sourceCode.getFirstTokenBetween(
                node.id,
                openingBrace,
                { filter: (token) => token.value === 'extends' },
              );
              fixes.push(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                fixer.remove(extendsKeyword!),
                fixer.insertTextBefore(openingBrace, '& '),
              );
            }

            return fixes;
          },
        });
      },
    };
  },
});
