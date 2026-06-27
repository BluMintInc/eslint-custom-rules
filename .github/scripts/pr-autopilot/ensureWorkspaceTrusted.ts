import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Where the CLI records per-directory workspace trust. */
const defaultConfigPath = (): string => {
  return path.join(os.homedir(), '.claude.json');
};

type ProjectEntry = { hasTrustDialogAccepted?: boolean };

type TrustConfig = {
  projects?: Record<string, ProjectEntry | undefined>;
  [key: string]: unknown;
};

/**
 * A headless `claude --print` session HANGS FOREVER in a workspace whose trust
 * dialog was never accepted: it cannot render the dialog non-interactively, so
 * it blocks at startup and never closes. Spawned from the autopilot loop that is
 * exactly the "stopping problem" — one un-trusted workspace freezes every cycle.
 *
 * The CLI's own remedy — printed in its own error — is to set
 * `projects[<dir>].hasTrustDialogAccepted = true` in ~/.claude.json. This does
 * precisely that for `dir`, idempotently, so spawned sessions start instead of
 * hanging. `--dangerously-skip-permissions` does NOT bypass this gate; writing
 * the config is the only mechanism.
 *
 * Read-modify-write preserves every other key; a missing or malformed config is
 * treated as empty. The write is atomic (temp file + rename) so a concurrent
 * writer cannot observe a truncated file, and is skipped entirely once the
 * directory is trusted (the common case after first run) — keeping the
 * shared-file race window to a single one-time event per workspace.
 *
 * Returns true when it had to grant trust (was previously untrusted).
 */
export const ensureWorkspaceTrusted = (
  dir: string,
  configPath: string = defaultConfigPath(),
): boolean => {
  let config: TrustConfig = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TrustConfig;
  } catch {
    config = {};
  }

  const projects: Record<string, ProjectEntry | undefined> =
    config.projects ?? {};
  const entry: ProjectEntry = projects[dir] ?? {};
  if (entry.hasTrustDialogAccepted === true) {
    return false;
  }

  entry.hasTrustDialogAccepted = true;
  projects[dir] = entry;
  config.projects = projects;

  const tmpPath = `${configPath}.pr-autopilot-${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmpPath, configPath);
  return true;
};
