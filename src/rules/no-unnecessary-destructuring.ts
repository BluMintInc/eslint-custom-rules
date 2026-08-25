import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export const noUnnecessaryDestructuring = createRule({
  name: 'no-unnecessary-destructuring',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Avoid object patterns that only spread an existing object, since they clone the whole value without selecting properties',
      recommended: 'error',
    },
    messages: {
      noUnnecessaryDestructuring:
        'Destructuring only the rest of "{{source}}" into "{{target}}" just clones the entire object. The shallow copy adds allocations and hides that you keep every property unchanged. Assign the object directly instead, for example `{{target}} = {{source}}`.',
    },
    schema: [],
    fixable: 'code',
  },
  defaultOptions: [],
  create(context) {
    return {
      // Handle variable declarations
      VariableDeclarator(node) {
        if (
          node.id.type === 'ObjectPattern' &&
          node.id.properties.length === 1 &&
          node.id.properties[0].type === 'RestElement'
        ) {
          const sourceCode = context.getSourceCode();
          const restElement = node.id.properties[0] as TSESTree.RestElement;

          // Report the issue
          context.report({
            node,
            messageId: 'noUnnecessaryDestructuring',
            data: {
              target: sourceCode.getText(restElement.argument),
              source: node.init
                ? sourceCode.getText(node.init)
                : 'the source object',
            },
            fix(fixer) {
              const restName = sourceCode.getText(restElement.argument);

              // Handle the case where init might be null
              if (!node.init) {
                return null;
              }

              const initText = sourceCode.getText(node.init);

              // The declarator's range covers `node.id.typeAnnotation`, so
              // replacing the whole declarator would silently drop it. A lone
              // rest element binds the entire object, meaning the annotation
              // describes the new binding exactly and can be re-emitted as-is.
              const annotationText = node.id.typeAnnotation
                ? sourceCode.getText(node.id.typeAnnotation)
                : '';

              // Replace the destructuring with direct assignment
              return fixer.replaceText(
                node,
                `${restName}${annotationText} = ${initText}`,
              );
            },
          });
        }
      },

      // Handle assignments like { ...obj } = value
      AssignmentExpression(node) {
        if (
          node.operator === '=' &&
          node.left.type === 'ObjectPattern' &&
          node.left.properties.length === 1 &&
          node.left.properties[0].type === 'RestElement'
        ) {
          const sourceCode = context.getSourceCode();
          const restElement = node.left.properties[0] as TSESTree.RestElement;

          context.report({
            node,
            messageId: 'noUnnecessaryDestructuring',
            data: {
              target: sourceCode.getText(restElement.argument),
              source: sourceCode.getText(node.right),
            },
            fix(fixer) {
              const restName = sourceCode.getText(restElement.argument);
              const rightText = sourceCode.getText(node.right);
              const replacement = `${restName} = ${rightText}`;

              // `({ ...obj } = source);` is written parenthesized because a
              // statement opening with `{` would parse as a BLOCK. Rewriting the
              // pattern to a plain target removes that reason, and a formatter
              // then removes the parentheses — so leaving them behind is a diff
              // that never settles (#2113). They are dropped here only where
              // they are provably the statement's own wrapper.
              const parenthesized =
                node.parent?.type === AST_NODE_TYPES.ExpressionStatement;
              if (!parenthesized || replacement.startsWith('{')) {
                return fixer.replaceText(node, replacement);
              }
              const open = sourceCode.getTokenBefore(node);
              const close = sourceCode.getTokenAfter(node);
              if (open?.value !== '(' || close?.value !== ')') {
                return fixer.replaceText(node, replacement);
              }
              // Text between a parenthesis and what it groups is a comment, and
              // dropping the pair would move it out of the group the author
              // wrote it inside.
              const text = sourceCode.getText();
              if (
                text.slice(open.range[1], node.range[0]).trim() !== '' ||
                text.slice(node.range[1], close.range[0]).trim() !== ''
              ) {
                return fixer.replaceText(node, replacement);
              }
              return fixer.replaceTextRange(
                [open.range[0], close.range[1]],
                replacement,
              );
            },
          });
        }
      },
    };
  },
});
