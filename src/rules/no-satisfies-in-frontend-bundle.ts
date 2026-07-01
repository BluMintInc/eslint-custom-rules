import { Minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type MessageIds = 'noSatisfiesOperator';

type Options = [
  {
    excludePaths?: string[];
    includePaths?: string[];
  },
];

const DEFAULT_EXCLUDE_PATHS = [
  'functions/src/firestore/**',
  'functions/src/callable/**',
  'functions/src/pubsub/**',
  'functions/src/webhooks/**',
  'functions/src/queues/**',
  'functions/src/realtime/**',
];

const DEFAULT_INCLUDE_PATHS = ['src/**', 'functions/src/**'];

/**
 * Normalizes a filesystem path to forward slashes for consistent
 * glob matching on all platforms.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Returns the portion of the normalized path starting from a recognized
 * root segment (`src/` or `functions/`), so that absolute paths from
 * the RuleTester (e.g. `/project/src/components/Foo.tsx`) are matched
 * against the configured include/exclude globs as if they were relative
 * to the project root.
 *
 * Check `functions/` before `src/` because `functions/src/` paths contain
 * `/src/` as a substring; matching `/src/` first would incorrectly strip
 * the `functions/` prefix and break exclude-glob matching.
 */
function toRelativeLike(normalizedFilename: string): string {
  const functionsIdx = normalizedFilename.indexOf('/functions/');
  if (functionsIdx !== -1) {
    return normalizedFilename.slice(functionsIdx + 1); // "functions/..."
  }
  const srcIdx = normalizedFilename.indexOf('/src/');
  if (srcIdx !== -1) {
    return normalizedFilename.slice(srcIdx + 1); // "src/..."
  }
  return normalizedFilename;
}

export const noSatisfiesInFrontendBundle = createRule<Options, MessageIds>({
  name: 'no-satisfies-in-frontend-bundle',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the `satisfies` operator in files that reach the frontend webpack bundle (Next.js 12 SWC cannot parse it)',
      recommended: 'error',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          excludePaths: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_EXCLUDE_PATHS,
          },
          includePaths: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_INCLUDE_PATHS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noSatisfiesOperator:
        'SWC in Next.js 12 cannot parse `satisfies`; this file is bundled by webpack and will fail the production build. Use an explicit type annotation, or a constrained identity helper when literal keys must be preserved.',
    },
  },
  defaultOptions: [
    {
      excludePaths: DEFAULT_EXCLUDE_PATHS,
      includePaths: DEFAULT_INCLUDE_PATHS,
    },
  ],
  create(context, [options]) {
    const excludePaths = options.excludePaths ?? DEFAULT_EXCLUDE_PATHS;
    const includePaths = options.includePaths ?? DEFAULT_INCLUDE_PATHS;

    const filename = context.getFilename();

    // Skip synthetic filenames used by RuleTester when no filename is provided.
    if (filename === '<input>' || filename === '<text>') {
      return {};
    }

    const normalizedFilename = normalizePath(filename);

    // Exempt declaration files — they are never bundled.
    if (normalizedFilename.endsWith('.d.ts')) {
      return {};
    }

    // Exempt test and spec files — they are never bundled.
    if (/\.(test|spec)\.[jt]sx?$/.test(normalizedFilename)) {
      return {};
    }

    // Derive a path relative to the project root for glob matching.
    const relPath = toRelativeLike(normalizedFilename);

    // Only enforce within the configured include paths.
    const includeMatchers = includePaths.map(
      (pattern) => new Minimatch(pattern, { dot: true }),
    );
    const isIncluded = includeMatchers.some(
      (mm) => mm.match(normalizedFilename) || mm.match(relPath),
    );
    if (!isIncluded) {
      return {};
    }

    // Skip files that match any exclude path.
    const excludeMatchers = excludePaths.map(
      (pattern) => new Minimatch(pattern, { dot: true }),
    );
    const isExcluded = excludeMatchers.some(
      (mm) => mm.match(normalizedFilename) || mm.match(relPath),
    );
    if (isExcluded) {
      return {};
    }

    return {
      // Every TSSatisfiesExpression is reported regardless of wrapping context.
      // "x as const satisfies T" is a TSSatisfiesExpression (wrapping a
      // TSAsExpression), so it is caught. Bare "as const" (TSAsExpression
      // only) is NOT caught — correct.
      TSSatisfiesExpression(node) {
        context.report({
          node,
          messageId: 'noSatisfiesOperator',
        });
      },
    };
  },
});
