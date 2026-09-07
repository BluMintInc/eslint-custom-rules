import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { REGISTRY_GUARD_SUITES } from './registry-guard-suites';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadRuleNames } = require('./load-rule-names') as {
  loadRuleNames: (repoRoot?: string) => string[];
};

/**
 * Anchored on this file rather than on `process.cwd()`: a run launched from a
 * sibling worktree would otherwise grade that checkout's `src/tests/` and pass
 * over a rename in this one.
 */
const REPO_ROOT = resolve(__dirname, '..');

/** The admission ceiling the registry's docblock states. */
const COST_CEILING_SECONDS = 30;

const suiteRuleName = (path: string) => basename(path, '.test.ts');

describe('REGISTRY_GUARD_SUITES', () => {
  /**
   * A rename that leaves the entry behind drops a guard from the gate in
   * silence: `--findRelatedTests` over a path that does not exist selects
   * nothing and, with `--passWithNoTests`, still exits 0.
   */
  it('names only files that exist', () => {
    const missing = REGISTRY_GUARD_SUITES.filter(
      ({ path }) => !existsSync(resolve(REPO_ROOT, path)),
    ).map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  /**
   * A rule's own suite is already selected by relatedness whenever that rule
   * changes, so listing one here would pin cost the gate pays twice while
   * checking nothing about the registry.
   */
  it('lists no rule’s own suite', () => {
    const ruleNames = new Set(loadRuleNames());
    expect(ruleNames.size).toBeGreaterThan(100); // measured 195
    const ruleSuites = REGISTRY_GUARD_SUITES.filter(({ path }) =>
      ruleNames.has(suiteRuleName(path)),
    ).map(({ path }) => path);
    expect(ruleSuites).toEqual([]);
  });

  /**
   * The gate this list feeds runs on every `src/index.ts` change, so its whole
   * point is that it stays cheap enough to run at a Stop hook.
   */
  it('keeps every entry under the admission ceiling', () => {
    const overCeiling = REGISTRY_GUARD_SUITES.filter(
      ({ measuredSeconds }) => measuredSeconds >= COST_CEILING_SECONDS,
    ).map(({ path }) => path);
    expect(overCeiling).toEqual([]);
  });

  /** Non-vacuity: an empty or shrinking list passes every arm above. */
  it('pins the measured set of registry guards', () => {
    expect(REGISTRY_GUARD_SUITES.length).toBeGreaterThanOrEqual(18); // measured 18
  });

  it('holds each path exactly once', () => {
    const paths = REGISTRY_GUARD_SUITES.map(({ path }) => path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('points every entry at a suite under src/tests/', () => {
    const misplaced = REGISTRY_GUARD_SUITES.filter(
      ({ path }) =>
        !path.startsWith('src/tests/') || !path.endsWith('.test.ts'),
    ).map(({ path }) => path);
    expect(misplaced).toEqual([]);
  });

  /**
   * Repo-relative and POSIX-spelled, because these paths become jest operands
   * beside the changed files the gate already carries, which arrive that way.
   */
  it('spells every path repo-relative', () => {
    const absolute = REGISTRY_GUARD_SUITES.filter(
      ({ path }) => path.startsWith('/') || path.includes('\\'),
    ).map(({ path }) => path);
    expect(absolute).toEqual([]);
  });
});
