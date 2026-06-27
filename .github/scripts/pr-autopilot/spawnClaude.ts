import * as fs from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnResult } from './types';

/**
 * Default hard cap on a single spawned `claude` session. Generous enough for an
 * agent to address review comments and run this repo's full build+lint+test stop
 * hook, but bounded so a hung session can never freeze the loop. Causes of a
 * hang include network/auth stalls and — historically — an untrusted workspace
 * (see ensureWorkspaceTrusted); the timeout is the catch-all that guarantees the
 * loop keeps moving regardless of the cause.
 */
export const DEFAULT_SPAWN_TIMEOUT_MS = 30 * 60_000;

/** Grace period after SIGTERM before escalating to SIGKILL. */
const KILL_GRACE_MS = 10_000;

/**
 * Spawns a headless `claude` session in `cwd`, feeding the prompt via stdin.
 *
 * The spawned process runs inside the repo, so ITS OWN Stop hook
 * (`.claude/hooks/stop.sh` → `scripts/claude-hooks/agent-check.ts`, which runs
 * build + lint + test) is the validation gate. The autopilot only commits +
 * pushes what the agent produced — no separate validate step is needed here.
 *
 * A hard timeout guards the loop: a session that exceeds `timeoutMs` is killed
 * (SIGTERM, then SIGKILL after a grace period) and resolved with
 * `timedOut: true` so the caller discards the partial work and continues rather
 * than blocking forever.
 *
 * stdout is inherited so the agent's progress streams to the terminal; stderr is
 * captured so the caller can detect rate-limit signals.
 *
 * `spawn` is injectable purely for tests; production always uses Node's spawn.
 */
export const spawnClaude = (
  promptPath: string,
  cwd: string,
  timeoutMs: number = DEFAULT_SPAWN_TIMEOUT_MS,
  spawn: typeof nodeSpawn = nodeSpawn,
): Promise<SpawnResult> => {
  return new Promise((resolve) => {
    const promptContent = fs.readFileSync(promptPath, 'utf8');
    const child = spawn('claude', ['--print', '--model', 'opus'], {
      stdio: ['pipe', 'inherit', 'pipe'],
      cwd,
      env: { ...process.env },
    });

    let stderr = '';
    let settled = false;

    const finish = (result: SpawnResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    /** Unref'd so a still-pending timeout never blocks process exit. */
    const timeoutTimer = setTimeout(() => {
      stderr += `\n[pr-autopilot] spawned claude exceeded ${Math.round(
        timeoutMs / 1000,
      )}s; terminating.`;
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref?.();
      finish({ exitCode: 124, stderr, timedOut: true });
    }, timeoutMs);
    timeoutTimer.unref?.();

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin?.write(promptContent);
    child.stdin?.end();

    child.on('close', (code) => {
      clearTimeout(timeoutTimer);
      finish({ exitCode: code ?? 1, stderr, timedOut: false });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      finish({ exitCode: 1, stderr: err.message, timedOut: false });
    });
  });
};
