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
            const keywordSpan: TSESTree.Range = [
              node.range[0],
              node.id.range[0],
            ];
            // Everything between the header and the opening brace is
            // rewritten wholesale rather than patched token by token: the
            // heritage list needs `,` turned into `&` and the `extends`
            // keyword dropped, and surgical edits leave the separators and
            // the keyword's surrounding whitespace behind. The body starts at
            // the opening brace, so this span cannot swallow a `{` belonging
            // to a heritage type argument or a type-parameter constraint.
            const headerSpan: TSESTree.Range = [
              header.range[1],
              node.body.range[0],
            ];

            // Both rewritten spans are replaced in full, so a comment sitting
            // inside either one would be silently destroyed (and a line
            // comment would even swallow the `=` that follows it). Reporting
            // without a fix preserves the author's prose; the conversion is
            // then made by hand.
            const clobbersComment = sourceCode
              .getAllComments()
              .some((comment) =>
                [keywordSpan, headerSpan].some(
                  ([start, end]) =>
                    comment.range[0] < end && comment.range[1] > start,
                ),
              );
            if (clobbersComment) {
              return null;
            }

            const heritage = node.extends ?? [];
            // `getText` round-trips type arguments and qualified names, so
            // `extends ns.B<T>, C` becomes `ns.B<T> & C`.
            const intersection = heritage
              .map((clause) => sourceCode.getText(clause))
              .join(' & ');

            return [
              fixer.replaceTextRange(keywordSpan, 'type '),
              fixer.replaceTextRange(
                headerSpan,
                heritage.length > 0 ? ` = ${intersection} & ` : ' = ',
              ),
            ];
          },
        });
      },
    };
  },
});
