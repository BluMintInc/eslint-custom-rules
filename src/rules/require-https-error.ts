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

    const httpsIdentifiers = new Map<string, string>();
    const httpsErrorIdentifiers = new Map<string, string>();
    const reportProprietary = (
      node: TSESTree.Node,
      reference: string,
      source: string,
    ) =>
      context.report({
        node,
        messageId: 'useProprietaryHttpsError',
        data: { reference, source },
      });

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        if (
          node.source.value === 'firebase-admin' ||
          node.source.value === 'firebase-admin/lib/https-error'
        ) {
          const sourceModule = String(node.source.value);

          // Report imports immediately so the forbidden dependency is blocked even
          // when unused; throw sites below also report to cover runtime usage.
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
            const localName = httpsErrorSpecifier.local.name;
            httpsErrorIdentifiers.set(localName, sourceModule);
            reportProprietary(node, localName, sourceModule);
          }

          if (httpsSpecifier && 'local' in httpsSpecifier) {
            const localName = httpsSpecifier.local.name;
            httpsIdentifiers.set(localName, sourceModule);
            reportProprietary(node, `${localName}.HttpsError`, sourceModule);
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
        if (
          callee.type === AST_NODE_TYPES.MemberExpression &&
          callee.object.type === AST_NODE_TYPES.Identifier &&
          callee.property.type === AST_NODE_TYPES.Identifier &&
          callee.property.name === 'HttpsError'
        ) {
          const objectName = callee.object.name;
          const source = httpsIdentifiers.get(objectName);

          if (!source) {
            return;
          }

          reportProprietary(node, `${objectName}.HttpsError`, source);
          return;
        }

        if (callee.type === AST_NODE_TYPES.Identifier) {
          const source = httpsErrorIdentifiers.get(callee.name);

          if (!source) {
            return;
          }

          reportProprietary(node, callee.name, source);
        }
      },
    };
  },
});
