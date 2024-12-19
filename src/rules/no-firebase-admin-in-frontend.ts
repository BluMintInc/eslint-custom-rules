import { TSESTree, AST_NODE_TYPES } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    maxDepth?: number;
    excludePatterns?: string[];
  },
];

type MessageIds = 'noFirebaseAdmin';

const DEFAULT_MAX_DEPTH = 3;

export default createRule<Options, MessageIds>({
  name: 'no-firebase-admin-in-frontend',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent direct or indirect imports of firebase-admin and firebase-functions in frontend code',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxDepth: {
            type: 'number',
            minimum: 1,
          },
          excludePatterns: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noFirebaseAdmin:
        'Detected "{{pkg}}" in frontend code through import chain: {{chain}}',
    },
  },
  defaultOptions: [
    {
      maxDepth: DEFAULT_MAX_DEPTH,
      excludePatterns: ['**/test/**/*', '**/*.test.*', '**/*.mock.*'],
    },
  ],
  create(context, [options]) {
    const excludePatterns = options.excludePatterns || [];

    function isExcludedFile(filename: string): boolean {
      return excludePatterns.some((pattern) => {
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        return new RegExp(regexPattern).test(filename);
      });
    }

    function isBackendFile(filename: string): boolean {
      return filename.includes('functions/src/');
    }

    function isFrontendFile(filename: string): boolean {
      return !isBackendFile(filename) && !isExcludedFile(filename);
    }

    function isFirebaseAdminImport(importPath: string): boolean {
      return importPath === 'firebase-admin' || importPath === 'firebase-functions';
    }

    function isBackendUtilImport(importPath: string): boolean {
      return (
        importPath.includes('functions/src/server/auth') ||
        importPath.includes('/server/auth')
      );
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const filename = context.getFilename();
        if (!isFrontendFile(filename)) return;

        const importPath = node.source.value as string;
        
        if (isFirebaseAdminImport(importPath)) {
          context.report({
            node,
            messageId: 'noFirebaseAdmin',
            data: {
              pkg: importPath,
              chain: importPath,
            },
          });
        } else if (isBackendUtilImport(importPath)) {
          context.report({
            node,
            messageId: 'noFirebaseAdmin',
            data: {
              pkg: 'firebase-admin',
              chain: `${importPath} -> firebase-admin`,
            },
          });
        }
      },
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === 'import' &&
          node.arguments[0]?.type === AST_NODE_TYPES.Literal
        ) {
          const filename = context.getFilename();
          if (!isFrontendFile(filename)) return;

          const importPath = node.arguments[0].value as string;
          
          if (isFirebaseAdminImport(importPath)) {
            context.report({
              node,
              messageId: 'noFirebaseAdmin',
              data: {
                pkg: importPath,
                chain: importPath,
              },
            });
          } else if (isBackendUtilImport(importPath)) {
            context.report({
              node,
              messageId: 'noFirebaseAdmin',
              data: {
                pkg: 'firebase-admin',
                chain: `${importPath} -> firebase-admin`,
              },
            });
          }
        }
      },
    };
  },
});
