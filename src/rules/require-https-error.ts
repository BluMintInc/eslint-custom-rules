import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

// Anchored at the end of the path so multi-part suffixes such as
// `EventRegistry.integration.test.ts` are recognized while production modules
// that merely contain the word (`testUtils.ts`, `latest.ts`,
// `foo.test.helper.ts`) keep their enforcement.
const TEST_FILE_SUFFIX = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Jest convention directories hold test-only modules regardless of file name.
const TEST_FILE_DIRECTORY = /(^|\/)(__tests__|__mocks__)\//;

/**
 * Jest test files live beside production code under `functions/src`, but they
 * are never invoked as a Cloud Function and never return an HTTP response to a
 * client. Throwing a plain `Error` in their setup guards, fixtures, and mock
 * failure modes is idiomatic, so the rule's rationale does not apply to them
 * (issue #1380).
 */
const isTestFile = (filename: string) =>
  TEST_FILE_SUFFIX.test(filename) || TEST_FILE_DIRECTORY.test(filename);

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
      // The remedy names the module SHAPE, never a package name: the proprietary
      // wrapper lives inside the consuming repository (a shared
      // util/errors/HttpsError), so prescribing an npm specifier sends the
      // reader to install something that does not exist (issue #1685).
      useHttpsError:
        'Throwing "{{constructorName}}" in Cloud Functions returns a generic 500 and drops the structured status code clients rely on. Throw the proprietary HttpsError instead so responses include the correct status, sanitized message, and logging context. Import it from the proprietary HttpsError module this codebase owns, such as a shared util/errors/HttpsError, rather than from firebase-admin.',
      useProprietaryHttpsError:
        '{{reference}} comes from {{source}} and bypasses our proprietary HttpsError wrapper, so responses skip standardized status codes, logging, and client-safe payloads. Import HttpsError from the proprietary HttpsError module this codebase owns, such as a shared util/errors/HttpsError, and throw that to keep errors consistent.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Normalize Windows backslash separators so the forward-slash path check
    // below matches on every platform. Without this, `getFilename()` returns
    // `C:\repo\functions\src\...` on Windows, the guard bails, and the rule
    // silently enforces nothing (issue #1264).
    const filename = context.getFilename().replace(/\\/g, '/');

    // Only apply rule to files in functions/src directory
    if (!filename.includes('functions/src')) {
      return {};
    }

    if (isTestFile(filename)) {
      return {};
    }

    type ProprietaryErrorData = {
      reference: string;
      source: string;
    };

    const httpsIdentifiers = new Map<string, string>();
    const httpsErrorIdentifiers = new Map<string, string>();
    const reportProprietary = (
      node: TSESTree.Node,
      data: ProprietaryErrorData,
    ) =>
      context.report({
        node,
        messageId: 'useProprietaryHttpsError',
        data,
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
            reportProprietary(node, {
              reference: localName,
              source: sourceModule,
            });
          }

          if (httpsSpecifier && 'local' in httpsSpecifier) {
            const localName = httpsSpecifier.local.name;
            httpsIdentifiers.set(localName, sourceModule);
            reportProprietary(node, {
              reference: `${localName}.HttpsError`,
              source: sourceModule,
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

          reportProprietary(node, {
            reference: `${objectName}.HttpsError`,
            source,
          });
          return;
        }

        if (callee.type === AST_NODE_TYPES.Identifier) {
          const source = httpsErrorIdentifiers.get(callee.name);

          if (!source) {
            return;
          }

          reportProprietary(node, { reference: callee.name, source });
        }
      },
    };
  },
});
