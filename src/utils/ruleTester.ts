import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import { RuleTester } from 'eslint';

/**
 * `sourceType: 'module'` matches how the linted codebase actually parses: every
 * consumer source file is an ES module, so its top-level declarations live in a
 * module scope nested inside the global one.
 *
 * `@typescript-eslint/parser` defaults to `'script'`, under which a top-level
 * `import`/`const` still binds — the binding hangs off the *global* scope rather
 * than a module scope. References therefore still resolve either way, but the
 * scope shape differs: under `'script'` `globalScope.variables` carries the
 * file's own declarations and there is no module scope at all. A rule that
 * discriminates on `scope.type`, walks `globalScope.childScopes`, or reads
 * `globalScope.variables` would otherwise be exercised against a shape no real
 * file has. `src/tests/rule-tester-parse-mode.test.ts` pins this.
 */
const SHARED_PARSER_OPTIONS: TSESLint.ParserOptions = {
  sourceType: 'module',
};

export const ruleTesterTs = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: { ...SHARED_PARSER_OPTIONS },
});

export const ruleTesterJsx = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ...SHARED_PARSER_OPTIONS,
    ecmaFeatures: {
      jsx: true,
    },
  },
});

export const ruleTesterJson = new RuleTester({
  parser: require.resolve('jsonc-eslint-parser'),
  parserOptions: {
    ecmaVersion: 2020,
  },
});

export const ruleTesterMarkdown = new RuleTester({
  parser: require.resolve('markdown-eslint-parser'),
});

type ParserOptionsCarrier = { parserOptions?: TSESLint.ParserOptions };

/**
 * Applies `parserOptions` to every case of a suite.
 *
 * The instances above are the only RuleTester instances the suite may use:
 * corpus-harvesting probes collect cases by stubbing `run` on these exports, so
 * a test file that constructs its own tester is invisible to every one of them
 * and its rule silently drops out of the fixer, convergence, collision and
 * crash sweeps. `src/tests/no-local-rule-tester.test.ts` enforces that.
 *
 * A file needing parser options the shared instances do not declare — a
 * type-aware `project`, a non-default `ecmaVersion` — attaches them per case
 * rather than forking a tester. The shared instances already declare ES module
 * scope analysis, so a case restating `sourceType: 'module'` is redundant but
 * harmless. RuleTester deep merges each case's config over the tester's,
 * and options a case declares itself still win over the ones applied here, so a
 * case keeps any override it already had. Carrying the options on the case also
 * means the harvested corpus records the parser configuration a snippet was
 * written for, which a tester-level setting never exposes to a probe.
 */
export const withParserOptions = <T extends ParserOptionsCarrier | string>(
  parserOptions: TSESLint.ParserOptions,
  cases: readonly T[],
): (
  | Exclude<T, string>
  | { code: string; parserOptions: TSESLint.ParserOptions }
)[] =>
  cases.map((testCase) =>
    typeof testCase === 'string'
      ? { code: testCase, parserOptions }
      : {
          ...(testCase as Exclude<T, string>),
          parserOptions: {
            ...parserOptions,
            ...(testCase as ParserOptionsCarrier).parserOptions,
          },
        },
  );
