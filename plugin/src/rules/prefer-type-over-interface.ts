import { createRule } from '../utils/createRule';
import { TSESLint, TSESTree } from '@typescript-eslint/utils';

export const enforceTypeOverInterface: TSESLint.RuleModule<
  'typeOverInterface',
  never[]
> = createRule({
  name: 'enforceTypeOverInterface',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer using type alias over interface',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      typeOverInterface: 'Prefer using type alias over interface.',
    },
    fixable: 'code',
  },
  defaultOptions: [],

  create(context) {
    return {
      TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
        context.report({
          node,
          messageId: 'typeOverInterface',
          fix(fixer) {
            const sourceCode = context.getSourceCode();
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

