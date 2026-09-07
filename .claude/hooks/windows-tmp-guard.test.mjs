import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeShimHarness } from './lib/shim-harness.mjs';

const {
  shimPath: SHIM,
  createFixture,
  runShim,
  buildPayload,
} = makeShimHarness({
  shimName: 'windows-tmp-guard.sh',
  sessionId: 'windows-tmp-guard-shim',
});

/** The shape doctrine names: a child parses the `/tmp` literal for itself, so
 * the write lands in MSYS's `/tmp` and the read looks in `C:\tmp`. */
const REPORTED_COMMAND =
  "gh api repos/o/r/issues/1/comments -f body=\"$(node -p \"JSON.parse(require('fs').readFileSync('/tmp/r3.json','utf8')).body\")\"";

describe('windows-tmp-guard.sh — the platform gate', () => {
  /**
   * The gate runs BEFORE stdin is read, so on Linux and macOS the hook costs no
   * temp file, no grep and no `tsx` resolution — and, more importantly, denies
   * nothing. Off Windows the flagged command works.
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

describe('windows-tmp-guard.sh — the prefilter', () => {
  /**
   * The prefilter never DECIDES anything — only whether a payload is worth a
   * `tsx` bootstrap — and it may only err toward matching, since a skipped
   * bootstrap costs the deny while an unnecessary one costs latency. The one
   * narrowing it makes is the REMEDY, so a corrected retry pays nothing.
   */
  for (const [label, command] of [
    ['an unrelated command', 'npm run build'],
    ['a command using the prescribed sink', 'cat ./.claude/tmp/s/out.json'],
  ]) {
    it(`skips the bootstrap for ${label}`, () => {
      assert.equal(
        runShim(createFixture(), buildPayload(command), 'git-bash')
          .reachedChecker,
        false,
      );
    });
  }

  it('admits a benign /tmp too, leaving the position call to the checker', () => {
    assert.equal(
      runShim(
        createFixture(),
        buildPayload('gh issue view 1 --json body > /tmp/body.json'),
        'git-bash',
      ).reachedChecker,
      true,
    );
  });
});

describe('windows-tmp-guard.sh — end to end against the real checker', () => {
  const runReal = (command, platform) => {
    return runShim(SHIM, buildPayload(command), platform);
  };

  it('denies the reported command and prescribes the sink', () => {
    const result = runReal(REPORTED_COMMAND, 'git-bash');
    const verdict = JSON.parse(result.stdout);

    assert.equal(verdict.hookSpecificOutput.permissionDecision, 'deny');
    assert.ok(
      verdict.hookSpecificOutput.permissionDecisionReason.includes(
        'mkdir -p .claude/tmp/<scope>',
      ),
    );
  });

  /**
   * ONE allow case, not the position table. Which positions are benign is
   * graded in-process by `performWindowsTmpGuard.test.ts`; what only this layer
   * can prove is that an allow verdict survives the shim, and a second row buys
   * that proof again at the price of another `tsx` cold start.
   */
  it('allows a redirect target, which the shell resolves', () => {
    assert.deepEqual(
      JSON.parse(
        runReal('gh issue view 1 --json body > /tmp/body.json 2>&1', 'git-bash')
          .stdout,
      ),
      {},
    );
  });

  /** The payload has to carry a `/tmp` of its own, or the prefilter — which
   * cannot parse JSON — returns before the checker ever reads it. */
  it('fails open loudly on a malformed payload', () => {
    const malformed = '{"tool_name":"Bash","tool_input":"/tmp/x.json"}';
    const result = runShim(SHIM, malformed, 'git-bash');

    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.match(
      result.stderr,
      /windows-tmp-guard: fail-open \(missing-tool-input\)/,
    );
  });

  it('says nothing at all off Git Bash', () => {
    const result = runReal(REPORTED_COMMAND, 'other');

    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.equal(result.stderr, '');
  });
});
