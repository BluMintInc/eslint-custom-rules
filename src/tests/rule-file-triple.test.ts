import * as fs from 'fs';
import * as path from 'path';

/**
 * `.claude/CLAUDE.md` calls five files per rule "File Structure (Strict
 * Enforcement)" and relies on stop hooks to block a rule that is missing any of
 * them. Stop hooks run in an agent's local loop; CI does not.
 * `test-report.yml` runs only `npm run test:ci` and `semantic-release.yml` only
 * `npm run build`, and neither `lint:eslint-docs` nor `lint:js` is wired into a
 * workflow — so of the artifacts below only the implementation is actually
 * enforced, by `tsc` failing on `src/index.ts`'s import.
 *
 * A rule with no test suite is the dangerous case: jest cannot fail a suite
 * that does not exist, so absence reads exactly like a suite with nothing to
 * say, and the rule ships completely untested. #1392 was this shape —
 * `array-methods-this-context`'s suite was misnamed
 * `array-method-this-context.test.ts`, orphaning it while the rule read as
 * covered.
 *
 * Deliberately one-directional. Asserting the converse — that every
 * `src/tests/*.test.ts` maps to a rule name — reports 78 false orphans, because
 * supplementary suites are named `<rule>-<scenario>.test.ts` and infra suites
 * (this one included) are not rules at all.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadRuleNames } = require('../../scripts/load-rule-names');

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * The canonical rule set comes from the same build-free parse of `src/index.ts`
 * that commitlint, the validate-commit-scopes CI gate and the release-manifest
 * generator share, so this gate cannot disagree with them about what a rule is.
 */
const RULE_NAMES: string[] = loadRuleNames(REPO_ROOT);

const README = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');

type Artifact = {
  label: string;
  /** Relative path for the message; empty when the artifact is not a file. */
  pathFor: (rule: string) => string;
  present: (rule: string) => boolean;
};

const exists = (relative: string) =>
  fs.existsSync(path.join(REPO_ROOT, relative));

const ARTIFACTS: Artifact[] = [
  {
    label: 'implementation',
    pathFor: (rule) => `src/rules/${rule}.ts`,
    present: (rule) => exists(`src/rules/${rule}.ts`),
  },
  {
    label: 'test suite',
    pathFor: (rule) => `src/tests/${rule}.test.ts`,
    present: (rule) => exists(`src/tests/${rule}.test.ts`),
  },
  {
    label: 'docs page',
    pathFor: (rule) => `docs/rules/${rule}.md`,
    present: (rule) => exists(`docs/rules/${rule}.md`),
  },
  {
    label: 'README row',
    pathFor: (rule) => `README.md → [${rule}](docs/rules/${rule}.md)`,
    present: (rule) => README.includes(`[${rule}](docs/rules/${rule}.md)`),
  },
];

describe('rule file triple', () => {
  // A registry that silently parses to nothing would make every assertion below
  // pass over an empty list, so prove the set is real before trusting it.
  it('parses a non-trivial rule registry', () => {
    expect(RULE_NAMES.length).toBeGreaterThan(150); // measured 194
    expect(new Set(RULE_NAMES).size).toBe(RULE_NAMES.length);
  });

  it('detects a missing artifact', () => {
    const fabricated = 'this-rule-does-not-exist-control';
    expect(RULE_NAMES).not.toContain(fabricated);
    for (const artifact of ARTIFACTS) {
      expect(artifact.present(fabricated)).toBe(false);
    }
  });

  it('ships every registered rule with all four artifacts', () => {
    // Collecting every gap rather than failing on the first one means a
    // contributor adding a rule sees the whole checklist in one run.
    const missing = RULE_NAMES.flatMap((rule) =>
      ARTIFACTS.filter((artifact) => !artifact.present(rule)).map(
        (artifact) =>
          `${rule}: missing ${artifact.label} (${artifact.pathFor(rule)})`,
      ),
    );
    expect(missing).toEqual([]);
  });
});
