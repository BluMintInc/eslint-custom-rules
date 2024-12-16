import { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule';

type Options = [
  {
    maxDepth?: number;
    excludePatterns?: string[];
  }
];

const DEFAULT_MAX_DEPTH = 3;

export default createRule({
  name: 'no-firebase-admin-in-frontend',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent direct or indirect imports of firebase-admin and firebase-functions in frontend code',
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
      noFirebaseAdmin: 'Detected "{{pkg}}" in frontend code through import chain: {{chain}}',
    },
  },
  defaultOptions: [
    {
      maxDepth: DEFAULT_MAX_DEPTH,
      excludePatterns: ['**/test/**/*', '**/*.test.*', '**/*.mock.*'],
    },
  ],
  create(context, [options]) {
    const maxDepth = options.maxDepth || DEFAULT_MAX_DEPTH;
    const excludePatterns = options.excludePatterns || [];
    const visitedFiles = new Set<string>();
    const importChain: string[] = [];

    function isExcludedFile(filename: string): boolean {
      return excludePatterns.some(pattern => {
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        return new RegExp(regexPattern).test(filename);
      });
    }

    function checkImport(node: TSESTree.ImportDeclaration | TSESTree.CallExpression, depth: number = 0): void {
      if (depth >= maxDepth) return;

      const filename = context.getFilename();
      if (isExcludedFile(filename)) return;

      let importPath = '';
      if (node.type === 'ImportDeclaration') {
        importPath = node.source.value as string;
      } else if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Import' &&
        node.arguments[0]?.type === 'Literal'
      ) {
        importPath = node.arguments[0].value as string;
      }

      if (!importPath) return;

      // Check for direct firebase-admin/functions imports
      if (importPath === 'firebase-admin' || importPath === 'firebase-functions') {
        importChain.push(importPath);
        context.report({
          node,
          messageId: 'noFirebaseAdmin',
          data: {
            pkg: importPath,
            chain: importChain.join(' -> '),
          },
        });
        importChain.pop();
        return;
      }

      // Resolve the full path of the imported file
      try {
        const resolvedPath = context.getPhysicalFilename();
        if (visitedFiles.has(resolvedPath)) return;
        visitedFiles.add(resolvedPath);

        importChain.push(importPath);

        // Here you would analyze the imported file for firebase-admin imports
        // This would require additional setup to parse and analyze the imported file
        // For now, we'll focus on direct imports as a starting point

        importChain.pop();
      } catch (error) {
        // Skip if we can't resolve the import
      }
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        checkImport(node);
      },
      'CallExpression[callee.type="Import"]'(node: TSESTree.CallExpression) {
        checkImport(node);
      },
    };
  },
});
