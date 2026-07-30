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
        'Interfaces can merge across declarations and extend in chains, which fragments the resulting shape across files and makes composition harder to predict and trace. ' +
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
            const sourceCode = context.sourceCode;
            // The `=` must land after the entire declaration header (the
            // name plus any type-parameter list); anchoring on the
            // identifier alone emits unparseable `type Name =<T> {`.
            const header = node.typeParameters ?? node.id;
            const fixes = [
              fixer.replaceTextRange(
                [node.range[0], node.id.range[0]],
                'type ',
              ),
              fixer.insertTextAfter(header, ' ='),
            ];

            if (node.extends && node.extends.length > 0) {
              // Search from the header end so a constrained type parameter
              // (`<T extends string>`) cannot shadow the heritage `extends`.
              const extendsKeyword = sourceCode.getFirstTokenBetween(
                header,
                node.body,
                { filter: (token) => token.value === 'extends' },
              );
              fixes.push(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                fixer.remove(extendsKeyword!),
                // The body starts at the opening brace, so anchoring on it
                // cannot mistake a `{` inside a heritage type argument or a
                // type-parameter constraint for the body brace.
                fixer.insertTextBefore(node.body, '& '),
              );
            }

            return fixes;
          },
        });
      },
    };
  },
});
