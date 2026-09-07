import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeShimHarness } from './lib/shim-harness.mjs';

const {
  shimPath: SHIM,
  createFixture,
  runShim,
  buildPayload,
} = makeShimHarness({
  shimName: 'msys-argv-guard.sh',
  sessionId: 'msys-guard-shim',
});

/** The shape doctrine names: a `<ref>:<path>` read MSYS2 rewrites into a
 * Windows path list before git's `main` sees it. */
const REPORTED_COMMAND =
  'git show origin/develop:.claude/skills/claude-hooks/SKILL.md';

describe('msys-argv-guard.sh — the platform gate', () => {
  /**
   * The gate runs BEFORE stdin is read, so on Linux and macOS the hook costs no
   * temp file, no grep and no `tsx` resolution — and, more importantly, denies
   * nothing. The remedy it prescribes is inert off Windows; a refusal is not.
   */
  it('leaves a non-Git-Bash host alone even for a payload it would deny', () => {
    const result = runShim(
      createFixture(),
      buildPayload(REPORTED_COMMAND),
      'other',
    );

    assert.equal(result.stdout.trim(), '{}');
    assert.equal(result.stderr, '');
    assert.equal(result.status, 0);
  });

  it('drains stdin on the way out, so the writer never sees a broken pipe', () => {
    const shim = createFixture();
    const payload = buildPayload(REPORTED_COMMAND).padEnd(200_000, ' ');

    assert.equal(runShim(shim, payload, 'other').status, 0);
  });

  it('reaches the checker on Git Bash for a payload the prefilter admits', () => {
    assert.equal(
      runShim(createFixture(), buildPayload(REPORTED_COMMAND), 'git-bash')
        .reachedChecker,
      true,
    );
  });
});

describe('msys-argv-guard.sh — the prefilter', () => {
  /**
   * The prefilter never DECIDES anything — only whether a payload is worth a
   * `tsx` bootstrap — and it may only err toward matching, since a skipped
   * bootstrap costs the deny while an unnecessary one costs latency.
   */
  for (const [label, command] of [
    ['an unrelated command', 'npm run build'],
    ['git with no ref:path verb', 'git commit -m "fix"'],
    ['a verb carried by no git binary', 'kubectl rev-parse'],
  ]) {
    it(`skips the bootstrap for ${label}`, () => {
      assert.equal(
        runShim(createFixture(), buildPayload(command), 'git-bash')
          .reachedChecker,
        false,
      );
    });
  }

  for (const [label, command] of [
    ['the reported git read', REPORTED_COMMAND],
    ['a git cat-file', 'git cat-file -p origin/develop:a/b'],
  ]) {
    it(`admits ${label}`, () => {
      assert.equal(
        runShim(createFixture(), buildPayload(command), 'git-bash')
          .reachedChecker,
        true,
      );
    });
  }

  /**
   * The dropped family, pinned: ECR runs no firebase CLI, so the RTDB verbs are
   * out of both tiers. A prefilter that still admitted them would pay a `tsx`
   * bootstrap for a command the checker has no rule for.
   */
  it('skips the bootstrap for a firebase RTDB read', () => {
    assert.equal(
      runShim(
        createFixture(),
        buildPayload('npx firebase database:get /status/uid'),
        'git-bash',
      ).reachedChecker,
      false,
    );
  });
});

describe('msys-argv-guard.sh — end to end against the real checker', () => {
  const runReal = (command, platform) => {
    return runShim(SHIM, buildPayload(command), platform);
  };

  it('denies the reported command and publishes the corrected one', () => {
    const result = runReal(REPORTED_COMMAND, 'git-bash');
    const verdict = JSON.parse(result.stdout);

    assert.equal(verdict.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(
      verdict.hookSpecificOutput.permissionDecisionReason.includes(
        `MSYS_NO_PATHCONV=1 ${REPORTED_COMMAND}`,
      ),
    );
  });

  it('allows the corrected command, so one retry converges', () => {
    assert.deepEqual(
      JSON.parse(
        runReal(`MSYS_NO_PATHCONV=1 ${REPORTED_COMMAND}`, 'git-bash').stdout,
      ),
      {},
    );
  });

  it('prescribes the split for a command carrying a real path too', () => {
    const verdict = JSON.parse(
      runReal(
        'git -C /c/Users/dev/eslint-custom-rules show origin/develop:a/b',
        'git-bash',
      ).stdout,
    );
    const { permissionDecisionReason } = verdict.hookSpecificOutput;

    assert.ok(
      permissionDecisionReason.includes(
        'cd /c/Users/dev/eslint-custom-rules && MSYS_NO_PATHCONV=1 git show origin/develop:a/b',
      ),
    );
    assert.ok(!permissionDecisionReason.includes('MSYS_NO_PATHCONV=1 git -C'));
  });

  it('fails open on an unexpandable argument, loudly', () => {
    const result = runReal('git show "$REF:.claude/x"', 'git-bash');

    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.match(
      result.stderr,
      /msys-argv-guard: fail-open \(unexpandable-argv\)/,
    );
  });

  it('says nothing at all off Git Bash', () => {
    const result = runReal(REPORTED_COMMAND, 'other');

    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(result.stderr, '');
  });
});
