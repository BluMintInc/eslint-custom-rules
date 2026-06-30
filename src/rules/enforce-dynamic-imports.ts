import { createRule } from '../utils/createRule';
import { Minimatch } from 'minimatch';
import { builtinModules } from 'module';

export const RULE_NAME = 'enforce-dynamic-imports';

type Options = [
  {
    libraries?: string[];
    ignoredLibraries?: string[];
    internalPrefixes?: string[];
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

export const DEFAULT_INTERNAL_PREFIXES = ['src/', 'functions/'];

// Pre-built set of Node.js core module names for O(1) lookup.
const NODE_BUILTINS = new Set(builtinModules);

// Returns true for any source that resolves to a Node builtin: bare name
// ('crypto'), node:-prefixed ('node:fs'), or path form ('fs/promises').
const isNodeBuiltin = (source: string): boolean =>
  source.startsWith('node:') ||
  NODE_BUILTINS.has(source) ||
  NODE_BUILTINS.has(source.split('/')[0]);

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
          libraries: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          ignoredLibraries: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          internalPrefixes: {
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
      internalPrefixes: DEFAULT_INTERNAL_PREFIXES,
      allowImportType: true,
    },
  ],
  create(context, [options]) {
    const {
      libraries,
      ignoredLibraries = DEFAULT_IGNORED_LIBRARIES,
      internalPrefixes = DEFAULT_INTERNAL_PREFIXES,
      allowImportType = true,
    } = options;

    // When `libraries` is provided, the rule operates in whitelist mode:
    // only the explicitly listed libraries are enforced. This preserves
    // backwards-compatibility with pre-1.16.0 consumer configurations.
    // When `libraries` is absent, enforce-by-default mode applies:
    // all external imports are flagged unless in `ignoredLibraries`.
    const isWhitelistMode = libraries !== undefined;

    // Build an O(1) + glob matcher from a list of library patterns.
    const buildMatcher = (list: string[]) => {
      const exactSet = new Set<string>();
      const globs: Minimatch[] = [];
      for (const lib of list) {
        const mm = new Minimatch(lib);
        if (mm.hasMagic()) {
          globs.push(mm);
        } else {
          exactSet.add(lib);
        }
      }
      return (source: string): boolean =>
        exactSet.has(source) || globs.some((mm) => mm.match(source));
    };

    // In whitelist mode, `libraries` is defined (checked above). In
    // enforce-by-default mode, `ignoredLibraries` is used instead.
    const isListedInWhitelist = buildMatcher(libraries ?? []);
    const isIgnoredLibrary = buildMatcher(ignoredLibraries);

    // A source is external only if it looks like an npm package specifier AND
    // is not a known-internal path. Node builtins and configured internal
    // prefixes (e.g. src/, functions/) are excluded to avoid false positives
    // on TypeScript baseUrl imports and Node core modules.
    const isExternal = (source: string): boolean => {
      return (
        /^[a-z0-9@]/i.test(source) &&
        !source.startsWith('@/') &&
        !isNodeBuiltin(source) &&
        !internalPrefixes.some((prefix) => source.startsWith(prefix))
      );
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

        let shouldReport: boolean;

        if (isWhitelistMode) {
          // Whitelist mode: report only if the source matches an explicitly
          // listed library. External detection and ignoredLibraries are not
          // consulted, so unlisted npm packages are silently allowed.
          shouldReport = isListedInWhitelist(importSource);
        } else {
          // Enforce-by-default mode: report if the source is an external
          // package and is not in the ignored list.
          shouldReport =
            isExternal(importSource) && !isIgnoredLibrary(importSource);
        }

        if (shouldReport) {
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
