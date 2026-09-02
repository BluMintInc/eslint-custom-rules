import fs from 'fs';
import path from 'path';

const TESTS_DIR = __dirname;
const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Test files permitted to construct their own RuleTester, mapped to the reason.
 *
 * Empty: every suite runs on the shared instances exported by
 * `src/utils/ruleTester.ts`. An entry here is a deliberate, justified exemption
 * that costs the listed rule its probe coverage — it is not a number to bump to
 * make this test pass. A file needing parser options the shared instances do
 * not declare attaches them per case with `withParserOptions` instead.
 */
const ALLOWED_LOCAL_TESTERS: Readonly<Record<string, string>> = {};

/**
 * Matches a RuleTester instantiation, whether the class is referenced bare or
 * reached through a namespace such as `ESLintUtils` or `TSESLint`. The pattern
 * is spelled out rather than shown by example because this scan reads its own
 * source too, and an example would flag this file.
 */
const LOCAL_TESTER = /new\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)*RuleTester\s*\(/;

const testFiles = (): string[] => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });
  return walk(TESTS_DIR).sort();
};

const relative = (file: string) => path.relative(REPO_ROOT, file);

const offenders = testFiles().flatMap((file) => {
  const rel = relative(file);
  if (rel in ALLOWED_LOCAL_TESTERS) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) =>
      LOCAL_TESTER.test(line) ? [`${rel}:${index + 1}`] : [],
    );
});

/**
 * Every corpus-harvesting probe collects cases by stubbing `run` on the shared
 * tester instances in `src/utils/ruleTester.ts` and then requiring the suite. A
 * file that builds its own RuleTester never touches those exports, so its rule
 * contributes nothing to the fixer audits, the convergence probe, the collision
 * injection probe, the fixer type-safety sweep or the crash corpus — and the
 * probes still report a clean sweep, because a rule that supplies no snippets
 * produces no findings. Eight rules were excluded that way until #1575, and the
 * exclusion was invisible by construction: nothing failed, nothing warned.
 *
 * This guard keeps that blind spot from reopening one convenient local tester at
 * a time.
 */
describe('src/tests uses only the shared RuleTester instances', () => {
  it('scans the test suite', () => {
    expect(testFiles().length).toBeGreaterThan(330); // measured 369
  });

  it('detects a locally constructed tester', () => {
    // Assembled so this file does not trip its own scan, and so a regex that
    // silently stopped matching cannot pass this suite vacuously.
    const constructed = ['new', 'RuleTester({'].join(' ');
    expect(LOCAL_TESTER.test(constructed)).toBe(true);
    expect(
      LOCAL_TESTER.test(['new ESLintUtils.', 'RuleTester({'].join('')),
    ).toBe(true);
    expect(
      LOCAL_TESTER.test("import { ruleTesterTs } from '../utils/ruleTester';"),
    ).toBe(false);
  });

  it('has no test file constructing a RuleTester', () => {
    expect(offenders).toEqual([]);
  });

  // Guarded: `it.each` throws on an empty table, and the empty table is the
  // state this repo wants to stay in.
  const exemptions = Object.entries(ALLOWED_LOCAL_TESTERS);
  if (exemptions.length > 0) {
    it.each(exemptions)(
      'exempted file %s still exists and carries a reason',
      (file, reason) => {
        expect(fs.existsSync(path.join(REPO_ROOT, file))).toBe(true);
        expect(reason.length).toBeGreaterThan(0);
      },
    );
  }
});
