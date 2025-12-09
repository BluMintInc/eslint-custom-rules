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
      preferType:
        'Interface "{{interfaceName}}" should be declared as a type alias. ' +
        'Interfaces merge across declarations and can reorder properties, which makes the public shape change without touching this file. ' +
        'Replace `interface` with `type` and use intersections (for example, `type {{interfaceName}} = Base & { field: string }`) to keep the contract closed and predictable.',
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
          data: {
            interfaceName: node.id.name,
          },
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
