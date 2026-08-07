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

/**
 * A module this plugin injects on the user's behalf must be one the plugin's
 * own default config accepts. Several rules in the recommended config write a
 * *static* import as part of their autofix; without these entries `--fix`
 * would trade an auto-fixable violation for a non-fixable one, and the
 * suggested remedy is impossible for most of them anyway (hooks must be called
 * unconditionally and decorators must resolve statically, so neither can be
 * loaded dynamically).
 *
 * `src/tests/enforce-dynamic-imports.test.ts` derives the set of specifiers the
 * fixers emit from the rule sources and asserts every external one is listed
 * here, so a seventh injected module cannot slip in unlisted.
 */
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
  // Injected by this plugin's own fixers:
  'use-latest-callback', // use-latest-callback
  '@blumintinc/typescript-memoize', // enforce-memoize-async, enforce-memoize-getters, require-memoize-jsx-returners
  '@blumintinc/use-deep-compare', // prefer-use-deep-compare-memo
  '@blumintinc/microdiff', // enforce-microdiff
  'microdiff', // enforce-microdiff, for files already on upstream
  'safe-stable-stringify', // enforce-safe-stringify
  '@blumintinc/fast-deep-equal', // fast-deep-equal-over-microdiff
  'fast-deep-equal', // fast-deep-equal-over-microdiff, for files already on upstream
];

export const DEFAULT_INTERNAL_PREFIXES = ['src/', 'functions/'];

/**
 * Builds an O(1) + glob matcher from a list of library patterns.
 *
 * With `coverSubpaths`, a non-glob entry stands for the package *and*
 * everything published under it. A package's subpath entry point is the same
 * dependency as its root — `fast-deep-equal/es6` is upstream's documented ESM
 * build, and the spelling `fast-deep-equal-over-microdiff` steers code toward —
 * so exempting the root while enforcing the subpath left the pair of rules
 * jointly unsatisfiable (#1845).
 *
 * The boundary is `entry + '/'`, never a bare substring: `fast-deep-equal-extra`
 * is a different package on the registry and stays enforced. Glob entries keep
 * their minimatch semantics untouched, since a pattern already says how far it
 * reaches.
 */
export const buildLibraryMatcher = (
  list: string[],
  { coverSubpaths }: { coverSubpaths: boolean },
) => {
  const exactSet = new Set<string>();
  const subpathPrefixes: string[] = [];
  const globs: Minimatch[] = [];
  for (const lib of list) {
    const mm = new Minimatch(lib);
    if (mm.hasMagic()) {
      globs.push(mm);
    } else {
      exactSet.add(lib);
      if (coverSubpaths) {
        subpathPrefixes.push(lib.endsWith('/') ? lib : `${lib}/`);
      }
    }
  }
  return (source: string): boolean =>
    exactSet.has(source) ||
    subpathPrefixes.some((prefix) => source.startsWith(prefix)) ||
    globs.some((mm) => mm.match(source));
};

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

    // In whitelist mode, `libraries` is defined (checked above). In
    // enforce-by-default mode, `ignoredLibraries` is used instead.
    //
    // Subpath covering is asymmetric between the two lists because the lists
    // point in opposite directions. Widening `ignoredLibraries` only ever
    // REMOVES reports, so it can safely absorb a package's subpath entry
    // points. Widening `libraries` would ADD reports — a consumer who listed
    // `pkg` to restore pre-1.16.0 behaviour would start failing on `pkg/sub` —
    // so the whitelist keeps exact + glob semantics, and consumers who do want
    // the subpaths enforced spell that as a glob (`pkg/**`), which still works.
    const isListedInWhitelist = buildLibraryMatcher(libraries ?? [], {
      coverSubpaths: false,
    });
    const isIgnoredLibrary = buildLibraryMatcher(ignoredLibraries, {
      coverSubpaths: true,
    });

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
