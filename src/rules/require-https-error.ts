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
        'Throwing "{{constructorName}}" in Cloud Functions returns a generic 500 and drops the structured status code clients rely on. Throw the proprietary HttpsError instead so responses include the correct status, sanitized message, and logging context.',
      useProprietaryHttpsError:
        '{{reference}} comes from {{source}} and bypasses our proprietary HttpsError wrapper, so responses skip standardized status codes, logging, and client-safe payloads. Import and throw HttpsError from @our-company/errors to keep errors consistent.',
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
    let httpsIdentifierSource: string | null = null;
    let httpsErrorIdentifier: string | null = null;
    let httpsErrorSource: string | null = null;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.value === 'firebase-admin' ||
          node.source.value === 'firebase-admin/lib/https-error'
        ) {
          const sourceModule = String(node.source.value);

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
            if (!httpsErrorSource) {
              httpsErrorSource = sourceModule;
            }
            context.report({
              node,
              messageId: 'useProprietaryHttpsError',
              data: {
                reference: httpsErrorSpecifier.local.name,
                source: sourceModule,
              },
            });
          }

          if (httpsSpecifier && 'local' in httpsSpecifier) {
            httpsIdentifier = httpsSpecifier.local.name;
            if (!httpsIdentifierSource) {
              httpsIdentifierSource = sourceModule;
            }
            context.report({
              node,
              messageId: 'useProprietaryHttpsError',
              data: {
                reference: `${httpsSpecifier.local.name}.HttpsError`,
                source: sourceModule,
              },
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
            data: {
              constructorName: callee.name,
            },
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
          const reference =
            isFirebaseHttpsError && httpsIdentifier
              ? `${httpsIdentifier}.HttpsError`
              : httpsErrorIdentifier ?? 'HttpsError';
          const source =
            (isFirebaseHttpsError ? httpsIdentifierSource : httpsErrorSource) ??
            'firebase-admin';

          context.report({
            node,
            messageId: 'useProprietaryHttpsError',
            data: {
              reference,
              source,
            },
          });
        }
      },
    };
  },
});
