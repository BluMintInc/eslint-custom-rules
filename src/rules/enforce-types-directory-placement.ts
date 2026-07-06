import path from 'path';
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { Minimatch } from 'minimatch';
import { createRule } from '../utils/createRule';

type MessageIds = 'typeOnlyFileOutsideTypesDir';

type Options = [
  {
    typesDirectory?: string;
    excludePatterns?: string[];
    includePaths?: string[];
    frontendCoupledImportPatterns?: string[];
  },
];

const DEFAULT_TYPES_DIRECTORY = 'functions/src/types';

// A type-only file that imports one of these frontend-only module families is
// frontend-scoped: it cannot be relocated under `functions/src/types/**`, since
// that directory is compiled by the backend tsconfig and the backend must not
// import from `src/` (frontend). Such files have no valid backend target and
// legitimately live under `src/`, so the rule exempts them. Matched against
// absolute specifiers directly and against relative specifiers after resolving
// them relative to the importing file (so backend files importing relatively —
// which resolve to `functions/src/**` — stay flagged).
const DEFAULT_FRONTEND_COUPLED_IMPORT_PATTERNS = [
  'src/components/**',
  'src/hooks/**',
];

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/__mocks__/**',
];

const DEFAULT_INCLUDE_PATHS = ['src/**', 'functions/src/**'];

/**
 * Normalizes a filesystem path to use forward slashes so that
 * Windows paths are handled uniformly alongside POSIX paths.
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Returns true when the normalized path contains the given directory
 * segment anywhere inside it (as a proper path component, not a substring).
 * E.g. containsPathSegment('/a/functions/src/types/foo.ts', 'functions/src/types') → true
 */
function containsPathSegment(filePath: string, segment: string): boolean {
  const normalized = normalizePath(filePath);
  const normalizedSegment = normalizePath(segment);
  return (
    normalized.includes('/' + normalizedSegment + '/') ||
    normalized.includes('/' + normalizedSegment) ||
    normalized.endsWith('/' + normalizedSegment)
  );
}

/**
 * Derives a suggested target path under the types directory.
 *
 * Strategy:
 * - For backend files (path contains `functions/src/<segment>/`): strip `functions/src/<segment>/`
 *   and prepend `functions/src/types/`.
 * - For frontend files (path contains `src/<segment>/`): strip `src/<segment>/`
 *   and prepend `functions/src/types/`.
 */
function suggestTargetPath(
  filePath: string,
  typesDirectory: string,
): string | null {
  const normalized = normalizePath(filePath);

  // Backend pattern: functions/src/<segment>/...
  const backendMatch = normalized.match(/functions\/src\/([^/]+)\/(.+)/);
  if (backendMatch) {
    const [, , rest] = backendMatch;
    return `${typesDirectory}/${rest}`;
  }

  // Frontend pattern: src/<segment>/...
  const frontendMatch = normalized.match(/(?:^|\/)src\/([^/]+)\/(.+)/);
  if (frontendMatch) {
    const [, , rest] = frontendMatch;
    return `${typesDirectory}/${rest}`;
  }

  return null;
}

/**
 * Extracts the repo-relative portion of a path starting at `functions/src/`
 * (backend) or `src/` (frontend), so absolute filenames and resolved relative
 * specifiers match the same globs the rest of the rule uses. Backend is checked
 * first because a backend path also contains `src/`.
 */
function toRepoRelative(filePath: string): string {
  const normalized = normalizePath(filePath);
  const match = normalized.match(/(?:^|\/)(functions\/src\/.*|src\/.*)$/);
  return match ? match[1] : normalized;
}

/**
 * Resolves an import/export module specifier to a repo-relative path for glob
 * matching. Relative specifiers are resolved against the importing file's
 * directory (so `./DialogHeader` from `src/components/dialog/x.ts` becomes
 * `src/components/dialog/DialogHeader`); bare/absolute specifiers are used as-is.
 */
function resolveSpecifier(specifier: string, fromFile: string): string {
  if (specifier.startsWith('.')) {
    const dir = path.posix.dirname(normalizePath(fromFile));
    return toRepoRelative(path.posix.join(dir, specifier));
  }
  return toRepoRelative(specifier);
}

/**
 * Returns the module specifier of a top-level import/export statement that
 * carries a `from '...'` source, or null for statements that don't.
 */
function importSourceOf(node: TSESTree.Statement): string | null {
  if (
    node.type === AST_NODE_TYPES.ImportDeclaration ||
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportAllDeclaration
  ) {
    const source = node.source;
    return source && typeof source.value === 'string' ? source.value : null;
  }
  return null;
}

/**
 * Returns true when the file imports at least one frontend-coupled module,
 * meaning it cannot be relocated under the backend types directory.
 */
function isFrontendCoupled(
  body: TSESTree.Statement[],
  fromFile: string,
  matchers: Minimatch[],
): boolean {
  return body.some((stmt) => {
    const specifier = importSourceOf(stmt);
    if (specifier === null) {
      return false;
    }
    const resolved = resolveSpecifier(specifier, fromFile);
    return matchers.some((mm) => mm.match(resolved));
  });
}

/**
 * Returns true when the given top-level statement is "type-only":
 * - ImportDeclaration (imports alone are not runtime code)
 * - TSTypeAliasDeclaration (bare or exported)
 * - TSInterfaceDeclaration (bare or exported)
 * - TSEnumDeclaration (treated as type-level per spec)
 * - TSModuleDeclaration (declare blocks)
 * - ExportNamedDeclaration that exports only types/interfaces/enums OR
 *   is a pure type re-export (`export type { ... } from ...` or
 *   `export { ... } from ...` with no local declarations carrying runtime code)
 * - ExportAllDeclaration
 *
 * Anything else (FunctionDeclaration, ClassDeclaration, VariableDeclaration,
 * ExpressionStatement, etc.) is runtime code and returns false.
 */
function isTypeOnlyStatement(node: TSESTree.Statement): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.ImportDeclaration:
      // Imports don't count as runtime code for this rule.
      return true;

    case AST_NODE_TYPES.TSTypeAliasDeclaration:
    case AST_NODE_TYPES.TSInterfaceDeclaration:
    case AST_NODE_TYPES.TSEnumDeclaration:
    case AST_NODE_TYPES.TSModuleDeclaration:
      return true;

    case AST_NODE_TYPES.ExportNamedDeclaration: {
      const exportNode = node as TSESTree.ExportNamedDeclaration;

      // `export type { Foo }` or `export type { Foo } from '...'`
      if (exportNode.exportKind === 'type') {
        return true;
      }

      // `export { Foo } from '...'` — pure re-export with no local declaration
      if (exportNode.source !== null && exportNode.declaration === null) {
        return true;
      }

      // `export type Foo = ...` / `export interface Foo { ... }` / `export enum Foo { ... }`
      if (exportNode.declaration !== null) {
        const decl = exportNode.declaration;
        return (
          decl.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          decl.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          decl.type === AST_NODE_TYPES.TSEnumDeclaration ||
          decl.type === AST_NODE_TYPES.TSModuleDeclaration
        );
      }

      // `export { Foo }` without `from` — re-exporting local bindings.
      // Since we cannot tell whether the local binding is a type or value
      // without the type checker, treat this as not type-only to avoid
      // false positives.
      return false;
    }

    case AST_NODE_TYPES.ExportAllDeclaration:
      // `export * from '...'` or `export type * from '...'`
      return true;

    default:
      // FunctionDeclaration, ClassDeclaration, VariableDeclaration,
      // ExpressionStatement, etc. all count as runtime code.
      return false;
  }
}

/**
 * A file is "type-only" when:
 * 1. It has at least one top-level type declaration (not just bare imports/re-exports).
 * 2. Every top-level statement is type-only according to isTypeOnlyStatement.
 */
function isTypeOnlyFile(body: TSESTree.Statement[]): boolean {
  if (body.length === 0) {
    return false;
  }

  let hasActualTypeDeclaration = false;

  for (const stmt of body) {
    if (!isTypeOnlyStatement(stmt)) {
      return false;
    }
    // Must have at least one "real" type construct, not just imports/re-exports.
    if (
      stmt.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
      stmt.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
      stmt.type === AST_NODE_TYPES.TSEnumDeclaration ||
      stmt.type === AST_NODE_TYPES.TSModuleDeclaration
    ) {
      hasActualTypeDeclaration = true;
    } else if (stmt.type === AST_NODE_TYPES.ExportNamedDeclaration) {
      const exportNode = stmt as TSESTree.ExportNamedDeclaration;
      if (exportNode.declaration !== null) {
        const decl = exportNode.declaration;
        if (
          decl.type === AST_NODE_TYPES.TSTypeAliasDeclaration ||
          decl.type === AST_NODE_TYPES.TSInterfaceDeclaration ||
          decl.type === AST_NODE_TYPES.TSEnumDeclaration ||
          decl.type === AST_NODE_TYPES.TSModuleDeclaration
        ) {
          hasActualTypeDeclaration = true;
        }
      } else if (
        // `export type { ... } from '...'` or `export { ... } from '...'`
        // counts toward type declarations only when using the type export kind
        exportNode.exportKind === 'type'
      ) {
        hasActualTypeDeclaration = true;
      }
    } else if (stmt.type === AST_NODE_TYPES.ExportAllDeclaration) {
      const exportAllNode = stmt as TSESTree.ExportAllDeclaration;
      if (exportAllNode.exportKind === 'type') {
        hasActualTypeDeclaration = true;
      }
    }
  }

  return hasActualTypeDeclaration;
}

export const enforceTypesDirectoryPlacement = createRule<Options, MessageIds>({
  name: 'enforce-types-directory-placement',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce that type-only files (containing only type/interface/enum declarations) live under the canonical types directory',
      recommended: 'error',
    },
    schema: [
      {
        type: 'object',
        properties: {
          typesDirectory: {
            type: 'string',
            default: DEFAULT_TYPES_DIRECTORY,
          },
          excludePatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_EXCLUDE_PATTERNS,
          },
          includePaths: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_INCLUDE_PATHS,
          },
          frontendCoupledImportPatterns: {
            type: 'array',
            items: { type: 'string' },
            default: DEFAULT_FRONTEND_COUPLED_IMPORT_PATTERNS,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      typeOnlyFileOutsideTypesDir:
        'Type-only file detected outside {{typesDirectory}}/.\n\nAll files containing only type definitions must live under {{typesDirectory}}/**.\n{{suggestedPath}}' +
        'If these types are only used by a single consumer, inline them into the consumer file instead of keeping them in a separate file.\n\nSee .claude/skills/types-placement/SKILL.md for the full types placement guide.',
    },
  },
  defaultOptions: [
    {
      typesDirectory: DEFAULT_TYPES_DIRECTORY,
      excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
      includePaths: DEFAULT_INCLUDE_PATHS,
      frontendCoupledImportPatterns: DEFAULT_FRONTEND_COUPLED_IMPORT_PATTERNS,
    },
  ],
  create(context, [options]) {
    const typesDirectory = options.typesDirectory ?? DEFAULT_TYPES_DIRECTORY;
    const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
    const includePaths = options.includePaths ?? DEFAULT_INCLUDE_PATHS;
    const frontendCoupledImportPatterns =
      options.frontendCoupledImportPatterns ??
      DEFAULT_FRONTEND_COUPLED_IMPORT_PATTERNS;

    const filename = context.getFilename();

    // Skip synthetic filenames used by RuleTester when no filename is provided.
    if (filename === '<input>' || filename === '<text>') {
      return {};
    }

    const normalizedFilename = normalizePath(filename);

    // Skip .d.ts files first (fast path before glob matching).
    if (normalizedFilename.endsWith('.d.ts')) {
      return {};
    }

    // Skip files already inside the canonical types directory.
    if (containsPathSegment(normalizedFilename, typesDirectory)) {
      return {};
    }

    // Apply exclude patterns.
    const excludeMatchers = excludePatterns.map(
      (pattern) => new Minimatch(pattern, { dot: true }),
    );
    if (
      excludeMatchers.some((mm) => mm.match(normalizedFilename)) ||
      excludeMatchers.some((mm) => mm.match(path.basename(normalizedFilename)))
    ) {
      return {};
    }

    // Apply includePaths: only enforce within the configured paths.
    if (includePaths.length > 0) {
      const includeMatchers = includePaths.map(
        (pattern) => new Minimatch(pattern, { dot: true }),
      );
      const isIncluded = includeMatchers.some(
        (mm) =>
          mm.match(normalizedFilename) ||
          // Also match against just the portion of the path from src/ or functions/
          (() => {
            const srcIdx = normalizedFilename.indexOf('/src/');
            const funcIdx = normalizedFilename.indexOf('/functions/');
            const relStart =
              srcIdx !== -1 ? srcIdx + 1 : funcIdx !== -1 ? funcIdx + 1 : -1;
            if (relStart === -1) return false;
            return mm.match(normalizedFilename.slice(relStart));
          })(),
      );
      if (!isIncluded) {
        return {};
      }
    }

    const frontendCoupledMatchers = frontendCoupledImportPatterns.map(
      (pattern) => new Minimatch(pattern, { dot: true }),
    );

    return {
      Program(programNode: TSESTree.Program) {
        const body = programNode.body as TSESTree.Statement[];

        if (!isTypeOnlyFile(body)) {
          return;
        }

        // A frontend-coupled type file has no valid target under the backend
        // types directory, so it must not be flagged (issue #1263).
        if (
          isFrontendCoupled(body, normalizedFilename, frontendCoupledMatchers)
        ) {
          return;
        }

        const suggested = suggestTargetPath(normalizedFilename, typesDirectory);
        const suggestedPath = suggested
          ? `This file should be moved to: ${suggested}\n\n`
          : '';

        const reportNode =
          programNode.body.length > 0 ? programNode.body[0] : programNode;

        context.report({
          node: reportNode,
          messageId: 'typeOnlyFileOutsideTypesDir',
          data: {
            typesDirectory,
            suggestedPath,
          },
        });
      },
    };
  },
});
