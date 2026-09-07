import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeShimHarness, shadowExecutable } from './lib/shim-harness.mjs';

const {
  shimPath: SHIM,
  createFixture,
  runShim,
  buildPayload,
} = makeShimHarness({
  shimName: 'gate-containment-guard.sh',
  sessionId: 'gate-containment-guard-shim',
});

/** This guard is platform-neutral, so the harness's platform argument is inert
 * here. Pinned to one value so a reader does not go looking for a gate. */
const PLATFORM = 'other';

/** The rewrite a deny publishes, read back out of the reason rather than
 * restated: the fixed point below feeds the checker its own output, so a
 * hand-written list would grade a rewrite the guard no longer publishes. */
const PUBLISHED_REWRITE = /Retry with:\n\n {2}(.+)/;

/** The shared payload builder carries no `description`, and this is the only
 * suite that needs one. Spliced rather than rebuilt so every other field the
 * builder sets stays whatever the builder decides it is. */
const describePayload = (payload, description) => {
  return payload.replaceAll(
    '"tool_input":{',
    `"tool_input":{"description":"${description}",`,
  );
};

describe('gate-containment-guard.sh — the prefilter', () => {
  /**
   * The prefilter never DECIDES anything — only whether a payload is worth a
   * `tsx` bootstrap — and it may only err toward matching, since a skipped
   * bootstrap costs the deny while an unnecessary one costs latency.
   */
  for (const [label, command] of [
    ['an unrelated command', 'git status --short'],
    ['a build', 'npm run build'],
    ['an install', 'npm install --no-audit'],
  ]) {
    it(`skips the bootstrap for ${label}`, () => {
      assert.equal(
        runShim(createFixture(), buildPayload(command), PLATFORM)
          .reachedChecker,
        false,
      );
    });
  }

  for (const [label, command] of [
    ['a whole-suite jest', 'npx jest'],
    ['the npm suite', 'npm test'],
    ['jest at its JS entry', 'node ./node_modules/jest/bin/jest.js'],
    [
      'a governor-stripping scoped run',
      'env -u BLUMINT_GOVERNOR_CLI npm run test:related',
    ],
    /** An npm global option between the head and the subcommand. A prefilter
     * demanding `test` immediately after `npm ` skips this shape, so the
     * checker never runs and the deny is lost a tier below the rules table. */
    ['a quieted npm suite', 'npm --silent test'],
    ['a quieted npm run', 'npm run -s test'],
  ]) {
    it(`admits ${label}`, () => {
      assert.equal(
        runShim(createFixture(), buildPayload(command), PLATFORM)
          .reachedChecker,
        true,
      );
    });
  }

  /**
   * The accepted false match, pinned so a later narrowing is a deliberate
   * decision rather than a silent one: the grep reads the whole payload, and
   * scoping it to `tool_input.command` would fail CLOSED on a reordered or
   * pretty-printed payload — a real offense skipping the checker.
   */
  it('admits a payload whose description alone names a tool', () => {
    const payload = describePayload(
      buildPayload('git status --short'),
      'Run the jest suite',
    );

    assert.equal(
      runShim(createFixture(), payload, PLATFORM).reachedChecker,
      true,
    );
  });

  /**
   * Abstaining and holding no opinion both print `{}`, so the stderr line is
   * the only signal the guard never got to look. The failure is injected by
   * SHADOWING `mktemp` on `PATH`: BSD `mktemp -t` ignores `TMPDIR`, so the
   * `TMPDIR` mechanism makes it SUCCEED on macOS and the shim then fails one
   * step later on a cause this case does not mean.
   */
  it('reports a mktemp failure as a greppable fail-open, draining stdin', () => {
    const shim = createFixture();

    const result = runShim(
      shim,
      buildPayload('npx jest'),
      PLATFORM,
      shadowExecutable(shim, 'mktemp'),
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '{}');
    assert.match(
      result.stderr,
      /gate-containment-guard: fail-open \(temp-file-unavailable\)/,
    );
  });
});

describe('gate-containment-guard.sh — end to end against the real checker', () => {
  const runReal = (command) => {
    return JSON.parse(runShim(SHIM, buildPayload(command), PLATFORM).stdout);
  };

  const denyReason = (command) => {
    const { hookSpecificOutput } = runReal(command);
    assert.equal(hookSpecificOutput.permissionDecision, 'deny');
    return hookSpecificOutput.permissionDecisionReason;
  };

  /** Row one of the rules table: a run nothing narrows, however it is spelled. */
  for (const [command, rewrite] of [
    ['npx jest', 'npm run test:related'],
    ['npm test', 'npm run test:related'],
    ['npm run test', 'npm run test:related'],
    ['npm run test:ci', 'npm run test:related'],
    ['yarn jest', 'npm run test:related'],
    ['node ./node_modules/jest/bin/jest.js', 'npm run test:related'],
    /** npm's own options, at both positions they sit — `--silent` is what an
     * agent adds the moment output gets long, and one of them in front of the
     * subcommand runs all 355 suites with no stderr line to show for it. */
    ['npm --silent test', 'npm run test:related'],
    ['npm -s test', 'npm run test:related'],
    ['npm run -s test', 'npm run test:related'],
    ['npm --silent run test:ci', 'npm run test:related'],
    ['npm --prefix . run test', 'npm run test:related'],
    ['npx jest -u --bail', 'npm run test:related -- -u --bail'],
    ['npm test -- -u', 'npm run test:related -- -u'],
    ['npx jest --watch', 'npm run test:related -- --watch'],
    /** A value option is republished ATTACHED whatever spelling the author
     * wrote, because `test-related.ts` splits on the dash alone: detached, the
     * value would reach jest as a `--findRelatedTests` operand and the retry
     * would run zero tests at exit 0. */
    [
      'npx jest --config jest.config.js --testTimeout 30000',
      'npm run test:related -- --config=jest.config.js --testTimeout=30000',
    ],
  ]) {
    it(`denies \`${command}\` and publishes the corrected command`, () => {
      assert.match(denyReason(command), new RegExp(escape(rewrite)));
    });
  }

  /**
   * The worker-count flags are DROPPED rather than republished, unlike every
   * other surviving flag: a jest CLI `--maxWorkers` outranks the config's own
   * sizing, so carrying it onto the remedy would publish a "governed" command
   * that still fans out to the number that filled the box.
   */
  for (const command of [
    'npx jest --maxWorkers=13',
    'npx jest --maxWorkers 13',
    'npx jest -w 13',
  ]) {
    it(`drops the worker count from \`${command}\`'s rewrite`, () => {
      const reason = denyReason(command);

      assert.match(reason, /Retry with:\n\n {2}npm run test:related\n/);
      assert.doesNotMatch(reason, /13/);
    });
  }

  /** Row two: the governor's own environment, touched around a jest head. */
  for (const [command, rewrite] of [
    [
      'env -u BLUMINT_GOVERNOR_CLI npm run test:related',
      'npm run test:related',
    ],
    [
      'BLUMINT_MAX_WORKERS=13 npm run test:related -- src/rules/x.ts',
      'npm run test:related -- src/rules/x.ts',
    ],
    [
      'unset CI && npx jest src/tests/x.test.ts',
      'npx jest src/tests/x.test.ts',
    ],
    [
      'TSX_TSCONFIG_PATH=/x/tsconfig.json npx jest src/tests/x.test.ts',
      'npx jest src/tests/x.test.ts',
    ],
    /** The joined short option, real GNU syntax one deleted space from the
     * detached spelling above. */
    ['env -uBLUMINT_GOVERNOR_CLI npm run test:related', 'npm run test:related'],
    /** Behind the suffix an agent appends to nearly every long command. A
     * redirect the rule cannot read fails it open, so the bare pipe would be
     * denied while its `2>&1` twin passed. */
    [
      'env -u BLUMINT_GOVERNOR_CLI npx jest src/tests/x.test.ts 2>&1 | tail -20',
      'npx jest src/tests/x.test.ts 2>&1 | tail -20',
    ],
    [
      'BLUMINT_MAX_WORKERS=13 npx jest src/tests/x.test.ts > /tmp/out.log',
      'npx jest src/tests/x.test.ts >/tmp/out.log',
    ],
  ]) {
    it(`denies \`${command}\` and republishes it without the prefix`, () => {
      assert.match(denyReason(command), new RegExp(escape(rewrite)));
    });
  }

  /**
   * The fixed point the whole design rests on. A `PreToolUse:Bash` deny reason
   * frequently never reaches the agent, so the retry is made blind — and it
   * only converges while every published rewrite is itself allowed here.
   *
   * Derived from the reason rather than listed, so a rewrite the checker starts
   * publishing is graded the moment it is published.
   */
  for (const command of [
    'npx jest',
    'npm test',
    'npm --silent test',
    'npm run -s test',
    'npx jest -u --bail',
    'npx jest --maxWorkers 13',
    'env -u BLUMINT_GOVERNOR_CLI npm run test:related',
    'env -uBLUMINT_GOVERNOR_CLI npm run test:related',
    'BLUMINT_MAX_WORKERS=13 npm run test:related -- src/rules/x.ts',
    'unset CI && npx jest src/tests/x.test.ts',
    'npx jest --config jest.config.js --testTimeout 30000',
    'env -u BLUMINT_GOVERNOR_CLI npx jest src/tests/x.test.ts 2>&1 | tail -20',
  ]) {
    it(`publishes an allowed rewrite for \`${command}\`, so one retry converges`, () => {
      const [, rewrite] = PUBLISHED_REWRITE.exec(denyReason(command)) ?? [];

      assert.ok(rewrite, 'the deny reason must publish a rewrite');
      assert.deepEqual(runReal(rewrite), {});
    });
  }

  for (const [label, command] of [
    ['a path-scoped run', 'npx jest src/tests/x.test.ts'],
    ['a related run', 'npx jest --findRelatedTests src/rules/x.ts'],
    ['a listing', 'npx jest --listTests'],
    ['the canonical scoped script', 'npm run test:related'],
    ['a scoped npm suite', 'npm test -- src/tests/x.test.ts'],
    ['an unrelated build', 'npm run build'],
    ['an unrelated unset', 'unset CI && npm run build'],
    ['a quieted scoped suite', 'npm --silent test -- src/tests/x.test.ts'],
    /** `test` here is `--prefix`'s VALUE, so the script is `build`: the arity
     * pin that keeps the option walk from denying an ordinary build. */
    ['a build behind a value option', 'npm --prefix test run build'],
  ]) {
    it(`leaves ${label} alone`, () => {
      assert.deepEqual(runReal(command), {});
    });
  }

  /**
   * A wrapper option carrying a whole command inside one token is a hole rather
   * than a verdict, so it is reported the way an unreadable operator is. The
   * command still runs — this guard fails open on everything it cannot read —
   * but the operator gets the one line that says so.
   */
  for (const [label, command, reason] of [
    ['an operator it cannot split', '(npx jest)', 'operator'],
    [
      'a wrapper option hiding a command',
      "env -S 'npx jest'",
      'unmodelled-prefix',
    ],
  ]) {
    it(`fails open on ${label}, loudly`, () => {
      const result = runShim(SHIM, buildPayload(command), PLATFORM);

      assert.deepEqual(JSON.parse(result.stdout), {});
      assert.match(
        result.stderr,
        new RegExp(`gate-containment-guard: fail-open \\(${reason}`),
      );
    });
  }
});

/** The regular-expression escape a literal rewrite needs before it can be
 * matched inside a reason that also carries prose punctuation. */
function escape(text) {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}
