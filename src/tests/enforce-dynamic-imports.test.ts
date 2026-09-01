import fs from 'fs';
import path from 'path';
import { builtinModules } from 'module';
import { parse, TSESTree } from '@typescript-eslint/typescript-estree';
import { ruleTesterTs } from '../utils/ruleTester';
import rule, {
  RULE_NAME,
  DEFAULT_IGNORED_LIBRARIES,
  DEFAULT_INTERNAL_PREFIXES,
  buildLibraryMatcher,
} from '../rules/enforce-dynamic-imports';

const ruleTester = ruleTesterTs;
const buildError = (source: string) => ({
  messageId: 'dynamicImportRequired' as const,
  data: { source },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // ─── Relative imports ───────────────────────────────────────────────────
    `import { something } from './local-file';`,
    `import { something } from '../parent-file';`,

    // ─── Path aliases starting with @/ (treated as internal) ────────────────
    `import { something } from '@/utils/helpers';`,
    `import { Component } from '@/components/Foo';`,

    // ─── Default ignored libraries ───────────────────────────────────────────
    `import React from 'react';`,
    `import { useState } from 'react';`,
    `import { createRoot } from 'react-dom/client';`,
    `import { renderToString } from 'react-dom/server';`,
    `import { useRouter } from 'next/router';`,
    `import { Button } from '@mui/material';`,
    `import { Add } from '@mui/icons-material';`,
    `import { clsx } from 'clsx';`,
    `import { twMerge } from 'tailwind-merge';`,

    // ─── Modules this plugin's own fixers inject ─────────────────────────────
    // These pass no options on purpose: they must be accepted at the SHIPPED
    // defaults, because `eslint --fix` writes these imports into consumer code.
    `import useLatestCallback from 'use-latest-callback';`,
    `import { Memoize } from '@blumintinc/typescript-memoize';`,
    `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';`,
    `import { diff } from 'microdiff';`,
    `import stringify from 'safe-stable-stringify';`,
    `import isEqual from 'fast-deep-equal';`,
    `import dynamic from 'next/dynamic';`,

    // ─── An ignored entry covers the package's subpath entry points ──────────
    // Upstream's documented ESM entry is `fast-deep-equal/es6`, which is the
    // spelling `fast-deep-equal-over-microdiff` steers code toward, so the
    // bare-name entry has to reach it (#1845).
    `import isEqual from 'fast-deep-equal/es6';`,
    `import isEqual from 'fast-deep-equal/es6/react';`,
    `import isEqual from '@blumintinc/fast-deep-equal';`,
    `import isEqual from '@blumintinc/fast-deep-equal/es6';`,
    `import { diff } from '@blumintinc/microdiff/dist/index';`,
    `import { twMerge } from 'tailwind-merge/dist/lib';`,

    // ─── Custom ignoredLibraries ─────────────────────────────────────────────
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
    },
    {
      code: `import { Sub } from 'scoped/sub';`,
      options: [{ ignoredLibraries: ['scoped/*'] }],
    },
    {
      // A user-supplied entry covers its subpaths too, not just the root
      code: `import { Sub } from 'heavy-lib/sub';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
    },
    {
      code: `import { Deep } from 'heavy-lib/sub/nested/deep';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
    },
    {
      // Scoped package: root and subpath both covered by the one entry
      code: `import { Thing } from '@scope/pkg';`,
      options: [{ ignoredLibraries: ['@scope/pkg'] }],
    },
    {
      code: `import { Thing } from '@scope/pkg/es6';`,
      options: [{ ignoredLibraries: ['@scope/pkg'] }],
    },
    {
      // An entry that is itself a subpath covers what sits below it
      code: `import { Thing } from '@scope/pkg/es6/react';`,
      options: [{ ignoredLibraries: ['@scope/pkg/es6'] }],
    },
    {
      // Explicit glob entries keep their minimatch semantics
      code: `import { Deep } from 'globbed/a/b/c';`,
      options: [{ ignoredLibraries: ['globbed/**'] }],
    },
    {
      code: `import { Thing } from '@emotion/react';`,
    },

    // ─── Type imports ────────────────────────────────────────────────────────
    `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
    },
    {
      code: `import { type T, type U } from 'some-heavy-lib';`,
    },

    // ─── Dynamic imports ─────────────────────────────────────────────────────
    `const VideoCall = useDynamic(() => import('@stream-io/video-react-sdk'));`,

    // ─── Complex glob handled by minimatch.hasMagic ──────────────────────────
    {
      code: `import { thing } from 'lib-a';`,
      options: [{ ignoredLibraries: ['lib-[a-z]'] }],
    },

    // ─── Digit-prefixed package can be ignored ───────────────────────────────
    {
      code: `import { thing } from '3d-force-graph';`,
      options: [{ ignoredLibraries: ['3d-force-graph'] }],
    },

    // ─── Node builtins (enforce-by-default mode, default options) ───────────
    // Bare names
    `import { parse } from 'url';`,
    `import { randomUUID } from 'crypto';`,
    `import { readFileSync } from 'fs';`,
    `import { join } from 'path';`,
    // node: prefix
    `import { readFileSync } from 'node:fs';`,
    `import { join } from 'node:path';`,
    // Sub-path forms (e.g. 'fs/promises', 'util/types')
    `import { readFile } from 'fs/promises';`,
    `import { isDeepStrictEqual } from 'util/types';`,

    // ─── Internal baseUrl paths (enforce-by-default, default prefixes) ───────
    `import { assertSafe } from 'functions/src/util/assertSafe';`,
    `import { COLORS } from 'src/styles/layout';`,
    `import { something } from 'src/components/Button';`,
    `import { helper } from 'functions/utils/helper';`,

    // ─── Custom internalPrefixes ──────────────────────────────────────────────
    {
      code: `import { thing } from 'app/foo/bar';`,
      options: [{ internalPrefixes: ['app/'] }],
    },
    {
      // Multiple custom prefixes - all should be treated as internal
      code: `import { thing } from 'packages/shared/utils';`,
      options: [{ internalPrefixes: ['packages/', 'app/'] }],
    },

    // ─── Whitelist mode: unlisted external libs are NOT flagged ──────────────
    {
      // lodash is not in libraries, so whitelist mode allows it
      code: `import { debounce } from 'lodash';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      // External scoped package not in list - should be allowed
      code: `import { something } from '@some-other/lib';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      // Empty libraries list - nothing should be flagged in whitelist mode
      code: `import { Heavy } from 'very-heavy-lib';`,
      options: [{ libraries: [] }],
    },
    {
      // Whitelist mode keeps exact/glob semantics: subpath covering applies to
      // `ignoredLibraries` (which only ever REMOVES reports). Widening the
      // whitelist would ADD reports for consumers on a pre-1.16.0 config, and
      // those consumers already spell subpath coverage as a glob (`pkg/**`).
      code: `import { Sub } from '@stream-io/video-react-sdk/sub';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },

    // ─── Backwards-compat: { libraries, allowImportType } must not throw ─────
    // (RuleTester surfaces schema errors as failures, so this pins facet #1)
    {
      code: `import type { Props } from '@stream-io/video-react-sdk';`,
      options: [
        { libraries: ['@stream-io/video-react-sdk'], allowImportType: true },
      ],
    },

    // ─── Whitelist mode: type-only imports still skipped ─────────────────────
    {
      // Listed library but it's a type import - allowImportType defaults to true
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },
    {
      code: `import { type VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
    },

    // ─── Enforce-by-default: allowImportType skips type-only imports ─────────
    `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
    {
      code: `import { type StreamVideo } from '@stream-io/video-react-sdk';`,
    },
  ],
  invalid: [
    // ─── Non-ignored external libs flagged in enforce-by-default mode ────────
    {
      code: `import VideoSDK from '@stream-io/video-react-sdk';`,
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    {
      code: `import { someFunc } from 'lodash';`,
      errors: [buildError('lodash')],
    },
    {
      code: `import 'some-side-effect-lib';`,
      errors: [buildError('some-side-effect-lib')],
    },
    {
      // 3d-force-graph is external (digit-prefix) and not ignored by default
      code: `import ForceGraph from '3d-force-graph';`,
      errors: [buildError('3d-force-graph')],
    },

    // ─── Mixed type and value imports are still invalid ───────────────────────
    {
      code: `import { type T, someValue } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },
    {
      code: `import Default, { type T } from 'some-heavy-lib';`,
      errors: [buildError('some-heavy-lib')],
    },

    // ─── Custom ignoredLibraries: unlisted libs still flagged ─────────────────
    {
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ ignoredLibraries: ['react'] }],
      errors: [buildError('heavy-lib')],
    },

    // ─── Subpath covering stops at the '/' boundary, never mid-name ──────────
    // These are the controls that separate "the entry covers its subpaths"
    // from "the entry is a substring match": a package whose name merely
    // starts with an ignored entry is a DIFFERENT package on the registry and
    // has to stay enforced (#1845).
    {
      code: `import isEqual from 'fast-deep-equal-extra';`,
      errors: [buildError('fast-deep-equal-extra')],
    },
    {
      code: `import isEqual from 'fast-deep-equal-extra/es6';`,
      errors: [buildError('fast-deep-equal-extra/es6')],
    },
    {
      code: `import { thing } from 'reactive-lib';`,
      errors: [buildError('reactive-lib')],
    },
    {
      code: `import NextAuth from 'next-auth';`,
      errors: [buildError('next-auth')],
    },
    {
      code: `import { diff } from 'microdiff-extra';`,
      errors: [buildError('microdiff-extra')],
    },
    {
      // Scoped: the sibling package under the same scope is not covered
      code: `import { thing } from '@blumintinc/fast-deep-equal-extra';`,
      errors: [buildError('@blumintinc/fast-deep-equal-extra')],
    },
    {
      code: `import { Heavy } from 'heavy-lib-extra';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
      errors: [buildError('heavy-lib-extra')],
    },
    {
      code: `import { Thing } from '@scope/pkg-extra';`,
      options: [{ ignoredLibraries: ['@scope/pkg'] }],
      errors: [buildError('@scope/pkg-extra')],
    },
    {
      // An unrelated package is still enforced when a subpath entry is ignored
      code: `import { Other } from 'other-lib/sub';`,
      options: [{ ignoredLibraries: ['heavy-lib'] }],
      errors: [buildError('other-lib/sub')],
    },
    {
      // A glob entry does not gain prefix covering: '@ignored/*' is one segment
      code: `import { thing } from '@ignored-other/lib';`,
      options: [{ ignoredLibraries: ['@ignored/*'] }],
      errors: [buildError('@ignored-other/lib')],
    },

    // ─── allowImportType: false makes type-only imports invalid ──────────────
    {
      code: `import type { Props } from 'some-lib';`,
      options: [{ ignoredLibraries: [], allowImportType: false }],
      errors: [buildError('some-lib')],
    },
    {
      code: `import { type T, type U } from 'some-lib';`,
      options: [{ ignoredLibraries: [], allowImportType: false }],
      errors: [buildError('some-lib')],
    },

    // ─── Scoped packages that are not ignored ─────────────────────────────────
    {
      code: `import { thing } from '@unignored/lib';`,
      options: [{ ignoredLibraries: ['@ignored/*'] }],
      errors: [buildError('@unignored/lib')],
    },
    {
      // External scoped package without @/ prefix is still external
      code: `import { thing } from '@internal/lib';`,
      options: [{ ignoredLibraries: [] }],
      errors: [buildError('@internal/lib')],
    },
    {
      code: `import { thing } from '3d-force-graph';`,
      options: [{ ignoredLibraries: [] }],
      errors: [buildError('3d-force-graph')],
    },

    // ─── Whitelist mode: listed library IS flagged ────────────────────────────
    {
      code: `import VideoSDK from '@stream-io/video-react-sdk';`,
      options: [{ libraries: ['@stream-io/video-react-sdk'] }],
      errors: [buildError('@stream-io/video-react-sdk')],
    },
    {
      // Glob pattern in whitelist mode
      code: `import { thing } from 'foo/bar';`,
      options: [{ libraries: ['foo/**'] }],
      errors: [buildError('foo/bar')],
    },
    {
      // Multiple libraries in whitelist: listed one is flagged
      code: `import { Heavy } from 'heavy-lib';`,
      options: [{ libraries: ['@stream-io/video-react-sdk', 'heavy-lib'] }],
      errors: [buildError('heavy-lib')],
    },

    // ─── Whitelist mode: allowImportType false still enforces type imports ────
    {
      code: `import type { VideoCallProps } from '@stream-io/video-react-sdk';`,
      options: [
        { libraries: ['@stream-io/video-react-sdk'], allowImportType: false },
      ],
      errors: [buildError('@stream-io/video-react-sdk')],
    },

    // ─── Custom internalPrefixes: non-listed prefix is still external ─────────
    {
      // 'other/lib' does not start with 'app/', so it is flagged
      code: `import { thing } from 'other/lib';`,
      options: [{ internalPrefixes: ['app/'] }],
      errors: [buildError('other/lib')],
    },
  ],
});

/**
 * The recommended config has to be closed under its own autofixes: several
 * rules that ship enabled write a *static* import as part of their fix, and
 * this rule — also shipped enabled, and enforce-by-default at its shipped
 * defaults — reported every one of them non-fixably (#1474). `eslint --fix`
 * therefore traded an auto-fixable violation for one a human had to resolve by
 * hand, and the message's suggested remedy is impossible for most of them:
 * `use-latest-callback` and `@blumintinc/use-deep-compare` export hooks (which
 * must be called unconditionally) and `@blumintinc/typescript-memoize` exports
 * a decorator (which must resolve statically).
 *
 * The list of injected modules is derived from the rule sources rather than
 * duplicated here, because a hardcoded copy would go stale exactly when it
 * matters: a *seventh* rule injecting a module has to fail this suite without
 * anyone remembering to register it. The derivation reads import statements out
 * of the string and template literals the fixers emit, resolving `${CONST}`
 * interpolations against module-scope string constants.
 *
 * Known limitation: an import assembled inside a helper that receives the
 * specifier as a *parameter* (as `use-custom-memo` does) leaves the
 * interpolation unresolved, so its specifier is dropped rather than guessed.
 * The controls below pin the derivation against real emitting rules so a scan
 * that silently degrades to an empty set fails instead of passing vacuously.
 */

const SOURCE_DIRS = [
  path.join(__dirname, '../rules'),
  path.join(__dirname, '../utils'),
];

// Interpolations that resolve to nothing statically (a parameter, a call, an
// option) collapse to this sentinel: the surrounding text still matches the
// import shape, but the specifier is discarded rather than guessed at.
const UNRESOLVED = '\u0000';

// Matches both `import x from '<spec>'` and side-effect `import '<spec>'`.
const EMITTED_IMPORT = /\bimport\b(?:[^'"`;]*?\bfrom\s*)?['"]([^'"\n]+)['"]/g;

// Subtrees that hold prose rather than emitted code. A message may quote an
// import of a module the rule tells you to stop using (`firestore-jest-mock`),
// which is the opposite of a module the plugin injects.
const PROSE_KEYS = new Set(['messages', 'docs', 'schema', 'description']);

const NODE_BUILTINS = new Set(builtinModules);

type EmittedImport = { file: string; specifier: string };

const tsFilesIn = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return tsFilesIn(full);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });

/**
 * A constant whose initializer interpolates ANOTHER module-scope constant is
 * resolvable too, and leaving it out makes every later template that reads it
 * collapse to the sentinel — bounded by `unresolvedEmitted`'s size, but never
 * reduced.
 *
 * One pass in DECLARATION order suffices, and no fixpoint is needed: a
 * module-scope `const` initializer runs at its own declaration, so interpolating
 * a name declared further down is a temporal-dead-zone error rather than valid
 * source. Declaration order is therefore already dependency order, even at depth
 * (`fixtureTypeProgram.ts`'s `STUBS` reads two constants that are themselves
 * chained, and both precede it). A chain that does NOT resolve in one pass is
 * cyclic, so extra passes would not settle it either — it falls through to the
 * sentinel, which is what covers it today.
 */
type ModuleScope = {
  constants: Map<string, string>;
  /** Names folded from an interpolating initializer, for the non-vacuity arms. */
  chainedResolved: string[];
  /** Chained names left to the sentinel: cyclic, or built from a non-constant. */
  chainedUnresolved: string[];
};

const moduleScopeStrings = (ast: TSESTree.Program): ModuleScope => {
  const constants = new Map<string, string>();
  const chained: { name: string; init: TSESTree.TemplateLiteral }[] = [];
  for (const statement of ast.body) {
    const declaration =
      statement.type === 'VariableDeclaration'
        ? statement
        : statement.type === 'ExportNamedDeclaration' &&
          statement.declaration?.type === 'VariableDeclaration'
        ? statement.declaration
        : null;
    for (const declarator of declaration?.declarations ?? []) {
      if (declarator.id.type !== 'Identifier' || !declarator.init) {
        continue;
      }
      const { init } = declarator;
      if (init.type === 'Literal' && typeof init.value === 'string') {
        constants.set(declarator.id.name, init.value);
      } else if (init.type === 'TemplateLiteral') {
        if (init.expressions.length === 0) {
          constants.set(declarator.id.name, init.quasis[0].value.cooked);
        } else {
          chained.push({ name: declarator.id.name, init });
        }
      }
    }
  }

  // Reuses the same folding the use sites get, so the two cannot drift on what
  // an interpolation resolves to.
  const chainedResolved: string[] = [];
  for (const { name, init } of chained) {
    const text = literalTextOf(init, constants);
    if (text === null || text.includes(UNRESOLVED)) {
      continue;
    }
    constants.set(name, text);
    chainedResolved.push(name);
  }
  return {
    constants,
    chainedResolved,
    chainedUnresolved: chained
      .map(({ name }) => name)
      .filter((name) => !constants.has(name)),
  };
};

const literalTextOf = (
  node: TSESTree.Node,
  constants: Map<string, string>,
): string | null => {
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }
  if (node.type !== 'TemplateLiteral') {
    return null;
  }
  return node.quasis
    .map((quasi, index) => {
      const expression = node.expressions[index];
      if (!expression) {
        return quasi.value.cooked;
      }
      const resolved =
        expression.type === 'Identifier'
          ? constants.get(expression.name)
          : undefined;
      return `${quasi.value.cooked}${resolved ?? UNRESOLVED}`;
    })
    .join('');
};

const collectEmitted = (
  node: TSESTree.Node,
  constants: Map<string, string>,
  found: string[],
  pattern: RegExp,
): void => {
  if (node.type === 'Property') {
    const key =
      node.key.type === 'Identifier'
        ? node.key.name
        : node.key.type === 'Literal'
        ? String(node.key.value)
        : null;
    if (key !== null && PROSE_KEYS.has(key)) {
      return;
    }
  }

  const text = literalTextOf(node, constants);
  if (text !== null) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      found.push(match[1] ?? match[0]);
      match = pattern.exec(text);
    }
  }

  for (const [key, value] of Object.entries(
    node as unknown as Record<string, unknown>,
  )) {
    if (key === 'parent') {
      continue;
    }
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (
        child !== null &&
        typeof child === 'object' &&
        typeof (child as TSESTree.Node).type === 'string'
      ) {
        collectEmitted(child as TSESTree.Node, constants, found, pattern);
      }
    }
  }
};

const parsedSources = SOURCE_DIRS.flatMap(tsFilesIn).map((file) => {
  const ast = parse(fs.readFileSync(file, 'utf8'), { loc: true, range: true });
  const { constants, chainedResolved, chainedUnresolved } =
    moduleScopeStrings(ast);
  return {
    file: path.basename(file),
    ast,
    constants,
    chainedResolved,
    chainedUnresolved,
  };
});

const chainedConstants = parsedSources.flatMap(({ file, chainedResolved }) =>
  chainedResolved.map((name) => ({ file, name })),
);

/** Walks the already-parsed sources, so adding a pattern costs no reparse. */
const collectWith = (pattern: RegExp): EmittedImport[] =>
  parsedSources.flatMap(({ file, ast, constants }) => {
    const found: string[] = [];
    collectEmitted(ast, constants, found, pattern);
    return found.map((specifier) => ({ file, specifier }));
  });

const emittedImports: EmittedImport[] = collectWith(EMITTED_IMPORT);

/**
 * A constant can carry the quotes the fixer emits inside its own VALUE, as
 * `use-custom-memo.ts:11` does with ``const MEMO_MODULE = `'src/util/memo'` ``.
 * The emitted template then reads ``... from ${MEMO_MODULE};`` — no quotes in
 * its static text, so no quote-keyed pattern can see the specifier, and the
 * file contributes no row at all rather than an UNRESOLVED one. Unwrapping the
 * value recovers the specifier instead of leaving that emitter invisible.
 */
const QUOTE_WRAPPED = /^(['"])(.*)\1$/;

const quoteWrappedSpecifiers: EmittedImport[] = parsedSources.flatMap(
  ({ file, constants }) =>
    [...constants.values()]
      .map((value) => QUOTE_WRAPPED.exec(value))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ file, specifier: match[2] })),
);

/** Every specifier the guard can see, however the emitter spells its quotes. */
const harvestedImports: EmittedImport[] = [
  ...emittedImports,
  ...quoteWrappedSpecifiers,
];

// Mirrors the rule's own notion of "external": anything it would report at the
// shipped defaults unless ignoredLibraries covers it.
const isExternal = (specifier: string): boolean =>
  !specifier.includes(UNRESOLVED) &&
  /^[a-z0-9@]/i.test(specifier) &&
  !specifier.startsWith('@/') &&
  !specifier.startsWith('node:') &&
  !NODE_BUILTINS.has(specifier) &&
  !NODE_BUILTINS.has(specifier.split('/')[0]) &&
  !DEFAULT_INTERNAL_PREFIXES.some((prefix) => specifier.startsWith(prefix));

// Reuses the rule's own matcher rather than restating it, so the proxy check
// cannot drift from the semantics the rule actually applies to the list.
const isIgnoredByDefault = buildLibraryMatcher(DEFAULT_IGNORED_LIBRARIES, {
  coverSubpaths: true,
});

const externalInjected = [
  ...new Set(
    harvestedImports
      .filter(({ specifier }) => isExternal(specifier))
      .map(({ specifier }) => specifier),
  ),
].sort();

const emittersOf = (specifier: string): string[] => [
  ...new Set(
    harvestedImports
      .filter((emitted) => emitted.specifier === specifier)
      .map(({ file }) => file),
  ),
];

/**
 * Specifiers built through indirection the harvest cannot follow — what is left
 * after `moduleScopeStrings` folds the chained constants, so every remaining one
 * interpolates a parameter, a call or an option rather than a constant. They are
 * excluded from `externalInjected` by the sentinel clause in `isExternal`, and
 * every one measured resolves to an internal path or copies the linted file's
 * own specifier — so the list needs to cover none of them today. The size is
 * asserted anyway: it is what moves if a fixer begins building an EXTERNAL
 * specifier that way, and an uncounted drop cannot be told apart from the rule
 * having nothing to report.
 *
 * Note the size bound alone is blind to a SUBSTITUTION — swapping one of these
 * from an internal path to an external package holds the count still. Folding
 * the chained constants is what converts that subset from bounded to checked.
 */
const unresolvedEmitted = emittedImports.filter(({ specifier }) =>
  specifier.includes(UNRESOLVED),
);

describe(`${RULE_NAME} default ignored libraries`, () => {
  it('derives injected modules from the rule sources', () => {
    // Controls: a derivation that silently stops finding anything (a parser
    // swap, a renamed directory) must fail here rather than pass vacuously.
    expect(SOURCE_DIRS.flatMap(tsFilesIn).length).toBeGreaterThan(150);
    expect(emittersOf('use-latest-callback')).toContain(
      'use-latest-callback.ts',
    );
    expect(emittersOf('@blumintinc/typescript-memoize')).toContain(
      'enforce-memoize-async.ts',
    );
    expect(emittersOf('react')).toContain('prefer-fragment-component.ts');
    expect(externalInjected.length).toBeGreaterThanOrEqual(7); // measured 9
  });

  it('accounts for every specifier the sentinel drops', () => {
    // Bounded rather than pinned: the drop is legitimate, but its SIZE is the
    // only signal that a fixer has begun building a specifier through
    // indirection, so it must not be free to move in silence.
    expect(unresolvedEmitted.length).toBeGreaterThanOrEqual(10); // measured 13
    expect(unresolvedEmitted.length).toBeLessThanOrEqual(20);
    expect(emittedImports.length).toBeGreaterThanOrEqual(24); // measured 32
  });

  it('recovers a specifier whose quotes live in the constant', () => {
    // The blind spot this arm exists for: a file that demonstrably emits an
    // import contributes NO row to the quote-keyed harvest, not even an
    // UNRESOLVED one, so its silence is indistinguishable from absence.
    expect(
      emittedImports.filter(({ file }) => file === 'use-custom-memo.ts'),
    ).toEqual([]);

    expect(quoteWrappedSpecifiers).toContainEqual({
      file: 'use-custom-memo.ts',
      specifier: 'src/util/memo',
    });
    expect(quoteWrappedSpecifiers.length).toBeGreaterThanOrEqual(1); // measured 1
  });

  it('folds chained constants and recovers the specifier they hide', () => {
    expect(chainedConstants.length).toBeGreaterThanOrEqual(8); // measured 11
    expect(chainedConstants).toContainEqual({
      file: 'enforce-centralized-mock-firestore.ts',
      name: 'MOCK_FIRESTORE_PATH',
    });
    // Depth 2: `STUBS` reads two constants that are themselves chained, so it
    // pins that folding composes rather than only handling a single hop.
    expect(chainedConstants).toContainEqual({
      file: 'fixtureTypeProgram.ts',
      name: 'STUBS',
    });
    expect(harvestedImports).toContainEqual({
      file: 'enforce-centralized-mock-firestore.ts',
      specifier: '../../../../../__test-utils__/mockFirestore',
    });
  });

  it('folds a chain that resolves to an EXTERNAL module (positive control)', () => {
    // Without this the arm above only ever sees internal paths, so a fold that
    // stopped working would look identical to one that had nothing to find.
    const probe = parse(
      [
        "const PKG = 'some-unlisted-package';",
        'const SPEC = `${PKG}/subpath`;',
        "const EMITTED = `import x from '${SPEC}';`;",
      ].join('\n'),
      { loc: true, range: true },
    );
    const { constants, chainedResolved } = moduleScopeStrings(probe);
    expect(chainedResolved).toEqual(['SPEC', 'EMITTED']);

    const found: string[] = [];
    collectEmitted(probe, constants, found, new RegExp(EMITTED_IMPORT, 'g'));
    expect(found).toContain('some-unlisted-package/subpath');
    expect(isExternal('some-unlisted-package/subpath')).toBe(true);
    expect(isIgnoredByDefault('some-unlisted-package/subpath')).toBe(false);
  });

  it('leaves a cyclic chain to the sentinel', () => {
    // A cycle is the one shape declaration order cannot settle, so it must fall
    // through to the sentinel rather than fold to a half-resolved specifier.
    const probe = parse(
      ['const A = `${A}/x`;', 'const B = `${C}`;', 'const C = `${B}`;'].join(
        '\n',
      ),
      { loc: true, range: true },
    );
    const { chainedResolved, chainedUnresolved } = moduleScopeStrings(probe);
    expect(chainedResolved).toEqual([]);
    expect([...chainedUnresolved].sort()).toEqual(['A', 'B', 'C']);
  });

  it('would flag a recovered specifier that is external (positive control)', () => {
    const recovered = QUOTE_WRAPPED.exec(`'some-unlisted-package'`);
    const specifier = recovered?.[2] ?? '';
    expect(specifier).toBe('some-unlisted-package');
    expect(isExternal(specifier)).toBe(true);
    expect(isIgnoredByDefault(specifier)).toBe(false);
  });

  it('adds nothing today because the recovered modules are internal (negative control)', () => {
    expect(isExternal('src/util/memo')).toBe(false);
    expect(externalInjected).not.toContain('src/util/memo');

    const chainedPath = '../../../../../__test-utils__/mockFirestore';
    expect(isExternal(chainedPath)).toBe(false);
    expect(externalInjected).not.toContain(chainedPath);
  });

  it('lists every external module the fixers inject', () => {
    const unlisted = externalInjected
      .filter((specifier) => !isIgnoredByDefault(specifier))
      .map((specifier) => ({ specifier, emittedBy: emittersOf(specifier) }));

    expect(unlisted).toEqual([]);
  });
});

// Membership in the list is only a proxy; these run the rule itself, at the
// shipped defaults, over a static import of every module the fixers inject.
ruleTester.run(`${RULE_NAME} (fixer-injected modules)`, rule, {
  valid: externalInjected.map(
    (specifier) => `import injected from '${specifier}';`,
  ),
  invalid: [],
});
