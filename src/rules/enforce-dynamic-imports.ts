import { createRule } from '../utils/createRule';
import { Minimatch } from 'minimatch';

export const RULE_NAME = 'enforce-dynamic-imports';

type Options = [
  {
    ignoredLibraries?: string[];
    allowImportType?: boolean;
  },
];

export const DEFAULT_IGNORED_LIBRARIES = [
  'react',
  'react/**',
  'react-dom',
  'react-dom/**',
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
        'Static import from "{{source}}" loads the full package into the initial bundle. → This increases download size and delays first render, undermining our lazy‑loading pattern for external dependencies. → Use a dynamic import (e.g., useDynamic(() => import("{{source}}"))), add "{{source}}" to ignoredLibraries for intentional static usage, or use a type‑only import when you only need types.',
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

    const exactIgnored = new Set<string>();
    const globIgnored: Minimatch[] = [];

    for (const lib of ignoredLibraries) {
      const mm = new Minimatch(lib);
      if (mm.hasMagic()) {
        globIgnored.push(mm);
      } else {
        exactIgnored.add(lib);
      }
    }

    const isIgnored = (source: string): boolean => {
      return (
        exactIgnored.has(source) ||
        globIgnored.some((mm) => mm.match(source))
      );
    };

    const isExternal = (source: string): boolean => {
      // Treat npm-style specifiers (including numeric names like '3d-force-graph') as external; internal paths are excluded.
      return /^[a-z0-9@]/i.test(source) && !source.startsWith('@/');
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
