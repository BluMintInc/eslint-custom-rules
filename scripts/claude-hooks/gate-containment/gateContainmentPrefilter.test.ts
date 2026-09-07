import { matchesPrefilter } from '../matchesPrefilter';
import { readGateContainmentPrefilter } from './gateContainmentPrefilter';

/**
 * The binding between the shipped bash prefilter and the rules table the
 * checker enforces. Both tiers stay green while disagreeing, and the
 * disagreement costs a DENY: a payload the prefilter skips never reaches the
 * checker at all.
 *
 * agora's own gate-containment guard carries no such binding; this port adds
 * it, because the two Windows guards had already proved the drift is real.
 */
const PREFILTER = readGateContainmentPrefilter();

describe('the gate-containment prefilter', () => {
  /** Every spelling the rules table denies. A denied command the prefilter
   * skips is silently allowed on every box. */
  it.each([
    ['a bare jest', 'npx jest'],
    ['a jest JS entry', 'node ./node_modules/jest/bin/jest.js'],
    ['a bin shim', './node_modules/.bin/jest --bail'],
    ['a Windows shim', 'npx.cmd jest'],
    ['yarn', 'yarn jest'],
    ['pnpm exec', 'pnpm exec jest'],
    ['bunx', 'bunx jest'],
    ['the npm suite', 'npm test'],
    ['the npm alias', 'npm t'],
    ['the other npm alias', 'npm tst'],
    ['run', 'npm run test'],
    ['run-script', 'npm run-script test'],
    ['the CI script', 'npm run test:ci'],
    /** npm's own options, at both positions they may sit. A pattern demanding
     * `test` immediately after `npm ` or `npm run ` skips every one of these,
     * so the checker never bootstraps and the deny is lost a tier below the
     * rules table. */
    ['a quieted suite', 'npm --silent test'],
    ['its short spelling', 'npm -s test'],
    ['a quieted run', 'npm run -s test'],
    ['a quieted CI script', 'npm --silent run test:ci'],
    ['a value option before run', 'npm --prefix . run test'],
    ['a separate loglevel value', 'npm --loglevel error test'],
    ['an env unset', 'env -u BLUMINT_GOVERNOR_CLI npm run test:related'],
    ['a long unset', 'env --unset BLUMINT_GOVERNOR_CLI npm run test:related'],
    ['an attached unset', 'env -uBLUMINT_GOVERNOR_CLI npm run test:related'],
    ['a shell unset', 'unset CI && npx jest src/tests/x.test.ts'],
    ['a worker override', 'BLUMINT_MAX_WORKERS=13 npm run test:related'],
    ['a budget override', 'BLUMINT_WORKER_BUDGET_MB=1 npm run test:related'],
    ['a tsconfig override', 'TSX_TSCONFIG_PATH=/x npm run test:related'],
    ['a CI assignment', 'CI=true npm run test:related'],
  ])('admits %s', (_label, command) => {
    expect(matchesPrefilter(PREFILTER, command)).toBe(true);
  });

  /** The narrowing the prefilter buys. Each of these would otherwise pay a
   * `tsx` bootstrap on every Bash call that spells it. */
  it.each([
    ['an install', 'npm install --no-audit'],
    ['a build', 'npm run build'],
    ['a lint', 'npx eslint src/rules/x.ts'],
    ['a status', 'git status --short'],
    ['a docs run', 'npm run docs'],
    /**
     * What the trailing boundary buys. The npm alternative admits any run of
     * tokens between `npm` and its test script, and the grep reads the whole
     * payload — so without a boundary after `t` every npm payload whose prose
     * carries a word starting with `t` would pay the `tsx` bootstrap.
     */
    [
      'a build whose description is prose',
      '{"tool_input":{"command":"npm run build"},"description":"Rebuild the plugin to check the types"}',
    ],
  ])('skips %s', (_label, command) => {
    expect(matchesPrefilter(PREFILTER, command)).toBe(false);
  });

  /** A mismatch means the prefilter moved, so the binding is void and must say
   * so rather than silently grading a pattern that is no longer the gate. */
  it('refuses a shim whose prefilter it cannot find', () => {
    expect(() => {
      return readGateContainmentPrefilter(__filename);
    }).toThrow(/prefilter moved/);
  });
});
