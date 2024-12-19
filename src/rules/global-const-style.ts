import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

const isUpperSnakeCase = (str: string): boolean =>
  /^[A-Z][A-Z0-9_]*$/.test(str);

export default createRule({
  name: 'global-const-style',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce UPPER_SNAKE_CASE and as const for global static constants',
      recommended: 'error',
    },
    fixable: 'code',
    schema: [],
    messages: {
      upperSnakeCase: 'Global constants should be in UPPER_SNAKE_CASE',
      asConst: 'Global constants should use "as const"',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclaration(node) {
        // Only check top-level const declarations
        if (
          node.kind !== 'const' ||
          node.parent?.type !== AST_NODE_TYPES.Program
        ) {
          return;
        }

        node.declarations.forEach((declaration) => {
          // Skip destructuring patterns
          if (declaration.id.type !== AST_NODE_TYPES.Identifier) {
            return;
          }

          const { name } = declaration.id;
          const init = declaration.init;

          // Skip if no initializer or if it's a dynamic value
          if (
            !init ||
            init.type === AST_NODE_TYPES.CallExpression ||
            init.type === AST_NODE_TYPES.BinaryExpression
          ) {
            return;
          }

          // Check for UPPER_SNAKE_CASE
          if (!isUpperSnakeCase(name)) {
            context.report({
              node: declaration.id,
              messageId: 'upperSnakeCase',
              fix(fixer) {
                const newName = name
                  .replace(/([A-Z])/g, '_$1')
                  .toUpperCase()
                  .replace(/^_/, '');
                return fixer.replaceText(declaration.id, newName);
              },
            });
          }

          // Check for as const
          if (
            init.type !== AST_NODE_TYPES.TSAsExpression ||
            init.typeAnnotation.type !== AST_NODE_TYPES.TSTypeReference ||
            (init.typeAnnotation.typeName as TSESTree.Identifier).name !==
              'const'
          ) {
            context.report({
              node: init,
              messageId: 'asConst',
              fix(fixer) {
                const sourceCode = context.getSourceCode();
                const initText = sourceCode.getText(init);
                return fixer.replaceText(init, `${initText} as const`);
              },
            });
          }
        });
      },
    };
  },
});
