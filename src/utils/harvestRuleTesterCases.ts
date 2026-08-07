import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as sharedTesters from './ruleTester';

/**
 * Collects every `RuleTester` case the suite declares WITHOUT executing any of
 * them, by shadowing `run` on the shared tester instances and then loading each
 * suite for its declarations alone.
 *
 * A guard that wants to exercise fixtures rather than documented snippets has no
 * other way in. `src/tests/*.test.ts` call `RuleTester.run` at module scope, so
 * importing one normally re-executes it — measured at 2350 tests, 2 minutes and
 * 48 cross-file side-effect failures, which is why
 * `recommended-config-fix-closure.test.ts` reads docs fenced blocks instead.
 * Shadowing `run` before the load turns each of those calls into a declaration
 * capture, so the cases are collected at the cost of loading the module and
 * nothing more.
 *
 * The fixtures are worth reaching precisely because they are not the docs: a
 * rule's `valid` list is written to sit on its carve-out boundaries, which is
 * where a sibling fixer destroys an exemption. Every finding of that class
 * (#1595-#1599, #1603, #1677-#1682) came from this corpus; the docs corpus
 * caught none of them.
 */

/** A single `ruleTester.run(name, rule, tests)` call, captured but not run. */
export type HarvestedSuite = {
  /** The display name the suite passed to `run`. */
  name: string;
  /** Which shared tester export declared it, which fixes the parser. */
  tester: string;
  /** Basename of the declaring file, so a finding is reproducible by hand. */
  file: string;
  /**
   * The rule object itself. Callers resolve a rule NAME from this by identity
   * against the plugin's own map rather than from `name`: 100 of the suites
   * pass a display name that is not a rule name (`requireMemo`,
   * `prefer-next-dynamic (JSX scenarios)`, `no-hungarian-phone-number-test`),
   * and name-keyed matching silently drops every one of them.
   */
  rule: unknown;
  valid: readonly unknown[];
  invalid: readonly unknown[];
};

export type HarvestResult = {
  suites: HarvestedSuite[];
  /** Files that threw while loading, `basename: message`. */
  failures: string[];
  /** Non-vacuity accounting: a silent drop here would fake a clean sweep. */
  filesLoaded: number;
  filesSkipped: number;
};

type Runner = {
  run: (name: string, rule: unknown, tests: unknown) => unknown;
};

const TESTS_DIR = path.join(__dirname, '..', 'tests');

/**
 * Only suites that import the shared tester module can declare a case, since
 * `src/tests/no-local-rule-tester.test.ts` forbids a locally-built tester. That
 * makes the import a sound admission test rather than a heuristic, and it is
 * what keeps this affordable: the ~28 files it excludes are the meta-suites
 * (`fixer-type-safety`, `docs-examples-conformance`, `rule-crash-robustness`,
 * this guard's own siblings) which run full corpus sweeps at module scope and
 * cost more to load than every rule suite combined.
 *
 * Matching the import rather than a `ruleTesterTs.run(` call site is
 * deliberate: `prefer-next-dynamic.test.ts` aliases the tester
 * (`const jsx = ruleTesterJsx`) before calling `run`, so a call-site pattern
 * drops it.
 */
export const IMPORTS_SHARED_TESTER = /from\s+'\.\.\/utils\/ruleTester'/;

/**
 * Jest registers a test for every `describe`/`it` a loaded module calls, so
 * loading 271 suites inside a suite would graft their entire test list onto
 * this one. Neutralizing the registrars for the duration of the load keeps the
 * captured declarations and discards the registrations.
 *
 * `describe` bodies still execute — several suites call `run` inside one, and
 * skipping the body would drop those cases — but everything that would register
 * or assert becomes a no-op.
 */
const REGISTRAR_GLOBALS = [
  'it',
  'test',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (value: unknown): any => value as any;

const noop = () => undefined;
/** `it.each(rows)(name, fn)` is a call chain, so the stub needs the same shape. */
const withEach = (fn: any) => {
  fn.each = () => () => undefined;
  fn.only = fn;
  fn.skip = fn;
  fn.todo = noop;
  fn.failing = fn;
  fn.concurrent = fn;
  return fn;
};

/**
 * Guards against a harvest starting while one is already running.
 *
 * Admission is "the file imports the shared tester", and a guard that harvests
 * may well import it too — at which point the outer harvest LOADS that guard,
 * its module scope harvests again, and the nested run finds every suite already
 * in the require cache. Requiring a cached module re-executes nothing, so its
 * `run` never fires and the nested harvest returns only the suites the outer one
 * had not reached yet. Measured: a corpus of 316 suites collapsing to 188 and
 * then 128, with `filesLoaded` still reporting 272 and `failures` empty. Every
 * downstream guard then swept a corpus two thirds gone and reported clean.
 *
 * Throwing is the only safe answer: the nested caller cannot be handed a partial
 * corpus, and the outer harvest records the throw in `failures`, which the
 * corpus guards assert is empty. A collapse that used to be invisible becomes a
 * build failure naming the file that caused it.
 */
let harvesting = false;

export function harvestRuleTesterCases(): HarvestResult {
  if (harvesting) {
    throw new Error(
      'harvestRuleTesterCases() was re-entered while a harvest is already in ' +
        'progress. A nested harvest sees only the suites the outer one has not ' +
        'loaded yet, so it silently returns a partial corpus. A guard that ' +
        'harvests must not import the shared tester module, or the harvest ' +
        'loads the guard itself.',
    );
  }
  harvesting = true;
  const suites: HarvestedSuite[] = [];
  const failures: string[] = [];
  let currentFile = '';
  let filesLoaded = 0;
  let filesSkipped = 0;

  const testerEntries = Object.entries(sharedTesters).filter(
    ([, value]) => typeof asAny(value)?.run === 'function',
  ) as [string, Runner][];

  const originalRun = new Map<string, Runner['run']>();
  for (const [key, tester] of testerEntries) {
    originalRun.set(key, tester.run);
    tester.run = (name, rule, tests) => {
      const bag = asAny(tests) || {};
      suites.push({
        name,
        tester: key,
        file: currentFile,
        rule,
        valid: bag.valid || [],
        invalid: bag.invalid || [],
      });
      return undefined;
    };
  }

  const globalScope = global as any;
  const savedGlobals = new Map<string, unknown>();
  const stub = (key: string, value: unknown) => {
    savedGlobals.set(key, globalScope[key]);
    globalScope[key] = value;
  };

  stub(
    'describe',
    withEach((_name: string, body?: () => void) => {
      if (typeof body === 'function') body();
    }),
  );
  for (const key of REGISTRAR_GLOBALS) stub(key, withEach(noop));

  /**
   * A handful of suites write fixture files at module scope, and
   * `test-file-location-enforcement` writes them under
   * `path.join(process.cwd(), '.cursor/tmp/...')` — a path it also `rmSync`s in
   * an `afterAll` that the stubs above turn into a no-op. Loading it from the
   * real working directory would therefore race that suite when it runs
   * concurrently in another worker (its cleanup landing between this harvest's
   * `mkdirSync` and `writeFileSync` throws ENOENT) and would strand fixtures in
   * the repo when it does not. Pointing the working directory at a private
   * scratch root for the duration of the load sends every cwd-derived write
   * somewhere no other worker can see, and it is removed below.
   *
   * The paths the suites *record* are unaffected: they are made relative to the
   * same cwd they were built from, so the harvested filenames come out
   * identical either way.
   */
  const scratchRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'blumint-harvest-'),
  );
  const realCwd = process.cwd();
  process.chdir(scratchRoot);

  try {
    const files = fs
      .readdirSync(TESTS_DIR)
      .filter((file) => file.endsWith('.test.ts'))
      .sort();

    for (const file of files) {
      const fullPath = path.join(TESTS_DIR, file);
      if (!IMPORTS_SHARED_TESTER.test(fs.readFileSync(fullPath, 'utf8'))) {
        filesSkipped++;
        continue;
      }
      currentFile = file;
      try {
        require(fullPath);
        filesLoaded++;
      } catch (error) {
        failures.push(`${file}: ${(error as Error)?.message}`);
      }
    }
  } finally {
    harvesting = false;
    process.chdir(realCwd);
    fs.rmSync(scratchRoot, { recursive: true, force: true });
    for (const [key, tester] of testerEntries) {
      const original = originalRun.get(key);
      if (original) tester.run = original;
    }
    for (const [key, value] of savedGlobals) globalScope[key] = value;
  }

  return { suites, failures, filesLoaded, filesSkipped };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
