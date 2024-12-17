import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export = createRule({
  name: 'require-https-error',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using HttpsError instead of throw new Error in functions/src',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useHttpsError:
        'Use HttpsError instead of throw new Error in functions/src directory',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();

    // Only apply rule to files in functions/src directory
    if (!filename.includes('functions/src')) {
      return {};
    }

    return {
      ThrowStatement(node: TSESTree.ThrowStatement) {
        const argument = node.argument as unknown as TSESTree.NewExpression;
        if (
          argument &&
          argument.type === AST_NODE_TYPES.NewExpression &&
          argument.callee &&
          argument.callee.type === AST_NODE_TYPES.Identifier &&
          argument.callee.name === 'Error'
        ) {
          context.report({
            node,
            messageId: 'useHttpsError',
          });
        }
      },
    };
  },
});
