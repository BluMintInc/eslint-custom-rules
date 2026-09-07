import { buildGateContainmentDenyReason } from './buildGateContainmentDenyReason';

describe('buildGateContainmentDenyReason', () => {
  /** Written for an opaque delivery: a `PreToolUse:Bash` deny frequently
   * surfaces as a bare "permission denied" naming no rule, so the corrected
   * command leads and the rationale follows it. */
  it('leads with the command to retry with', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'whole-suite',
      rewrite: 'npm run test:related -- --bail',
    });

    expect(reason).toMatch(
      /^Retry with:\n\n {2}npm run test:related -- --bail\n/,
    );
  });

  it('explains why a whole-suite run is refused', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'whole-suite',
      rewrite: 'npm run test:related',
    });

    expect(reason).toContain('whole suite');
  });

  /**
   * The alternatives it advertises have to be spellings the INSTALLED jest
   * accepts. jest 30 renames `--testPathPattern` to `--testPathPatterns` and
   * each major refuses the other at exit 1, so naming the wrong one sends an
   * agent out of a deny and into a usage error. The classifier still allows
   * both, since only the text an agent copies is pinned here.
   */
  it('advertises the path-pattern spelling this jest accepts', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'whole-suite',
      rewrite: 'npm run test:related',
    });

    expect(reason).toContain('`--testPathPattern`');
    expect(reason).not.toContain('`--testPathPatterns`');
  });

  /** Every removed variable is named. A remedy naming one of several, followed
   * exactly, still strips the rest — while reading as complete. */
  it('names every variable the environment remedy removes', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'governor-environment',
      rewrite: 'npm run test:related',
      names: ['CI', 'BLUMINT_GOVERNOR_CLI'],
    });

    expect(reason).toContain('`CI` and `BLUMINT_GOVERNOR_CLI`');
  });

  /**
   * The sanctioned route has to be in the text, or an agent that wants
   * governance reads a deny with no allowed spelling and treats it as a bug.
   */
  it('names where the governor variables belong instead', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'governor-environment',
      rewrite: 'npm run test:related',
      names: ['BLUMINT_GOVERNOR_CLI'],
    });

    expect(reason).toContain('.claude/settings.local.json');
  });

  it('points at the doctrine either rule rests on', () => {
    const reason = buildGateContainmentDenyReason({
      rule: 'whole-suite',
      rewrite: 'npm run test:related',
    });

    expect(reason).toContain('.claude/skills/repo-maintenance/SKILL.md');
  });
});
