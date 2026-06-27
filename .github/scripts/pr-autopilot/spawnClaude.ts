import * as fs from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnResult } from './types';

/**
 * Spawns a headless `claude` session in `cwd`, feeding the prompt via stdin.
 *
 * The spawned process runs inside the ECR repo, so ITS OWN Stop hook
 * (`.claude/hooks/stop.sh` → `scripts/claude-hooks/agent-check.ts`, which runs
 * build + lint + test) is the validation gate. The autopilot only commits +
 * pushes what the agent produced — no separate validate step is needed here.
 *
 * stdout is inherited so the agent's progress streams to the terminal; stderr is
 * captured so the caller can detect rate-limit signals.
 */
export const spawnClaude = (
  promptPath: string,
  cwd: string,
): Promise<SpawnResult> => {
  return new Promise((resolve) => {
    const promptContent = fs.readFileSync(promptPath, 'utf8');
    const child = nodeSpawn('claude', ['--print', '--model', 'opus'], {
      stdio: ['pipe', 'inherit', 'pipe'],
      cwd,
      env: { ...process.env },
    });

    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.stdin?.write(promptContent);
    child.stdin?.end();

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stderr });
    });

    child.on('error', (err) => {
      resolve({ exitCode: 1, stderr: err.message });
    });
  });
};
