import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

export = createRule({
  name: 'require-https-error',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce using proprietary HttpsError instead of throw new Error or firebase-admin HttpsError in functions/src',
      recommended: 'error',
    },
    schema: [],
    messages: {
      useHttpsError:
        'Use HttpsError instead of throw new Error in functions/src directory',
      useProprietaryHttpsError:
        'Use our proprietary HttpsError instead of firebase-admin HttpsError',
    },
  },
  defaultOptions: [],
  create(context) {
    const filename = context.getFilename();

    // Only apply rule to files in functions/src directory
    if (!filename.includes('functions/src')) {
      return {};
    }

    let httpsIdentifier: string | null = null;
    let httpsErrorIdentifier: string | null = null;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.value === 'firebase-admin' ||
          node.source.value === 'firebase-admin/lib/https-error'
        ) {
          // Check for direct HttpsError import
          const httpsErrorSpecifier = node.specifiers.find(
            (spec) =>
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'HttpsError',
          );

          // Check for https import that could be used for https.HttpsError
          const httpsSpecifier = node.specifiers.find(
            (spec) =>
              spec.type === AST_NODE_TYPES.ImportSpecifier &&
              spec.imported.name === 'https',
          );

          if (httpsErrorSpecifier && 'local' in httpsErrorSpecifier) {
            httpsErrorIdentifier = httpsErrorSpecifier.local.name;
            context.report({
              node,
              messageId: 'useProprietaryHttpsError',
            });
          }

          if (httpsSpecifier && 'local' in httpsSpecifier) {
            httpsIdentifier = httpsSpecifier.local.name;
            context.report({
              node,
              messageId: 'useProprietaryHttpsError',
            });
          }
        }
      },
      ThrowStatement(node: TSESTree.ThrowStatement) {
        if (!node.argument) {
          return;
        }

        const argument = node.argument as unknown as TSESTree.NewExpression;
        if (argument.type !== AST_NODE_TYPES.NewExpression) {
          return;
        }

        const callee = argument.callee;

        // Check for direct Error usage
        if (
          callee.type === AST_NODE_TYPES.Identifier &&
          callee.name === 'Error'
        ) {
          context.report({
            node,
            messageId: 'useHttpsError',
          });
          return;
        }

        // Check for firebase-admin HttpsError usage
        const isFirebaseHttpsError =
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.object.name === httpsIdentifier &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'HttpsError';

        const isDirectHttpsError =
          callee.type === AST_NODE_TYPES.Identifier &&
          callee.name === httpsErrorIdentifier;

        if (isFirebaseHttpsError || isDirectHttpsError) {
          context.report({
            node,
            messageId: 'useProprietaryHttpsError',
          });
        }
      },
    };
  },
});
