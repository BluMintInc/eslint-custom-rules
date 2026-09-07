import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

/**
 * Generous, because what it bounds is a `tsx` cold start on a contended box —
 * a shorter bound would report a slow machine as a broken shim.
 */
const SPAWN_TIMEOUT_MILLIS = 60 * 1000;

/**
 * A failing executable placed earlier on `PATH` than the real one, which injects
 * a bootstrap failure without touching the shim under test. Returns the `env`
 * override map to hand `runShim`.
 *
 * Shadowing is the only PORTABLE mechanism for `mktemp`, and the reason is worth
 * stating because the obvious alternative silently passes: BSD `mktemp -t`
 * ignores `TMPDIR` outright and resolves the Darwin per-user temp dir, so
 * pointing `TMPDIR` at a non-directory makes the command SUCCEED on macOS and
 * the shim then fails one step later on a different cause, asserting a failure
 * the case never produced.
 *
 * Exported standalone rather than returned from `makeShimHarness`: it needs
 * nothing the harness closes over, and a suite driving its own `spawnSync`
 * should reach it without constructing a harness.
 */
export const shadowExecutable = (
  shim,
  name,
  script = '#!/bin/sh\nexit 1\n',
) => {
  const stubDir = path.join(path.dirname(shim), `stub-${name}`);
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(path.join(stubDir, name), script, { mode: 0o755 });
  return { PATH: `${stubDir}${path.delimiter}${process.env.PATH}` };
};

/**
 * The fixture, spawn and payload machinery every `PreToolUse:Bash` shim suite
 * needs, so a hardening of it — an `rmSync` retry for a Windows `EBUSY`, a
 * spawn timeout bump — lands on every suite at once rather than on whichever
 * one its author happened to be reading.
 *
 * Written against `node:test` rather than jest, because the shims are graded by
 * `node --test .claude/hooks/*.test.mjs`: jest discovers `*.test.ts` only, and
 * the runner that does discover these files supplies neither `expect` nor a
 * global `afterAll`.
 *
 * `sessionId` is a parameter rather than something derived from `shimName`
 * because the suites carry different session ids, and a derived value would
 * silently rewrite a payload no assertion inspects. The mkdtemp prefix and the
 * fail-open line ARE derived: both are the shim's own basename, so deriving
 * them is what keeps them from drifting.
 *
 * @param {{ shimName: string, sessionId: string }} options `shimName` is the
 * shim's filename inside `.claude/hooks/`.
 */
export function makeShimHarness({ shimName, sessionId }) {
  const shimPath = path.join(import.meta.dirname, '..', shimName);
  const base = shimName.replace(/\.sh$/, '');
  const toolchainFailOpen = `${base}: fail-open (toolchain-unavailable)`;

  /**
   * Every fixture tree this suite materializes, removed once the run ends.
   * Without it each run leaks one `mkdtemp` directory per case, and the count
   * grows monotonically across a session and across every agent sharing the box.
   */
  const createdRoots = [];

  after(() => {
    for (const root of createdRoots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * The shim copied into a bare temp tree that carries **no** `scripts/`
   * directory and no `node_modules`, which is what makes the platform gate's
   * and the prefilter's decisions observable at all: a payload that gets past
   * both reaches the toolchain bootstrap, finds neither `tsx` nor the checker,
   * and emits its documented fail-open line — while a payload either one stops
   * returns before any of that and says nothing.
   */
  const createFixture = () => {
    const root = mkdtempSync(path.join(tmpdir(), `${base}-`));
    const hooks = path.join(root, '.claude', 'hooks');
    mkdirSync(hooks, { recursive: true });
    const shim = path.join(hooks, shimName);
    copyFileSync(shimPath, shim);
    createdRoots.push(root);
    return shim;
  };

  /**
   * `env` is an OVERRIDE MAP rather than a replacement environment, so a suite
   * can shadow one variable without rebuilding `process.env` and losing `PATH`.
   * The platform gate stays a named parameter because two suites drive it
   * positionally and would otherwise all churn.
   */
  const runShim = (shim, payload, platform, env = {}) => {
    const result = spawnSync('bash', [shim], {
      input: payload,
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MILLIS,
      env: {
        ...process.env,
        BLUMINT_MSYS_GUARD_PLATFORM: platform,
        ...env,
      },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      reachedChecker: result.stderr.includes(toolchainFailOpen),
    };
  };

  const buildPayload = (command) => {
    return JSON.stringify({
      session_id: sessionId,
      transcript_path: '/dev/null',
      cwd: '/c/Users/dev/eslint-custom-rules',
      permission_mode: 'bypassPermissions',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    });
  };

  return { shimPath, createFixture, runShim, buildPayload };
}
