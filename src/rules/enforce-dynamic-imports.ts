import { createRule } from '../utils/createRule';
import { minimatch } from 'minimatch';

export const RULE_NAME = 'enforce-dynamic-imports';

type Options = [
  {
    ignoredLibraries?: string[];
    allowImportType?: boolean;
  },
];

export const DEFAULT_IGNORED_LIBRARIES = [
  'react',
  'react-dom',
  'next',
  'next/**',
  '@mui/material',
  '@mui/material/**',
  '@mui/icons-material',
  '@mui/icons-material/**',
  '@emotion/**',
  'clsx',
  'tailwind-merge',
];

export default createRule<Options, 'dynamicImportRequired'>({
  name: RULE_NAME,
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoredLibraries: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          allowImportType: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      dynamicImportRequired:
        'Static import from "{{source}}" eagerly pulls the entire package into the initial bundle, inflating download size and delaying the first render. External libraries should be loaded lazily with a dynamic import (for example, useDynamic(() => import("{{source}}"))) unless they are intentionally static; if you only need types, use a type-only import.',
    },
  },
  defaultOptions: [
    {
      ignoredLibraries: DEFAULT_IGNORED_LIBRARIES,
      allowImportType: true,
    },
  ],
  create(context, [options]) {
    const {
      ignoredLibraries = DEFAULT_IGNORED_LIBRARIES,
      allowImportType = true,
    } = options;

    const isIgnored = (source: string): boolean => {
      return ignoredLibraries.some((lib) => {
        if (lib.includes('*')) {
          return minimatch(source, lib);
        }
        return source === lib;
      });
    };

    const isExternal = (source: string): boolean => {
      // Basic check: starts with a letter or @
      // This excludes relative imports (./, ../) and absolute paths (/)
      // and path aliases starting with @/ (if not just @)
      return /^[a-z@]/i.test(source) && !source.startsWith('@/');
    };

    return {
      ImportDeclaration(node) {
        const importSource = node.source.value as string;

        // Skip type-only imports if allowed
        if (allowImportType) {
          if (node.importKind === 'type') {
            return;
          }

          if (
            node.specifiers.length > 0 &&
            node.specifiers.every(
              (spec) =>
                spec.type === 'ImportSpecifier' && spec.importKind === 'type',
            )
          ) {
            return;
          }
        }

        // Only enforce for external libraries that are NOT ignored
        if (isExternal(importSource) && !isIgnored(importSource)) {
          context.report({
            node,
            messageId: 'dynamicImportRequired',
            data: {
              source: importSource,
            },
          });
        }
      },
    };
  },
});
