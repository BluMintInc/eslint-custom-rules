import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * How long a fixture tree must sit untouched before it counts as abandoned.
 *
 * A suite that builds an on-disk fixture tree lives for seconds, so an hour
 * clears anything a crash stranded while never reaching a tree belonging to a
 * jest invocation running alongside this one.
 */
export const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export type SweepOptions = {
  root?: string;
  abandonedAfterMs?: number;
  now?: number;
};

/** The most recent mtime of `dir` or any entry directly inside it. */
function lastTouchedMs(dir: string) {
  let newest = fs.statSync(dir).mtimeMs;
  // A directory's own mtime only moves when a TOP-LEVEL entry changes, so a
  // run that writes everything into one subdirectory would read as older than
  // it is and be swept out from under itself.
  for (const entry of fs.readdirSync(dir)) {
    try {
      newest = Math.max(newest, fs.statSync(path.join(dir, entry)).mtimeMs);
    } catch {
      // A peer run removing its own tree mid-scan is expected, not an error.
    }
  }
  return newest;
}

/**
 * Remove fixture trees under `root` that carry `prefix` and were abandoned by
 * an earlier run, returning how many were reclaimed.
 *
 * A tree created at module load and removed in `afterAll` is stranded by
 * anything that kills jest between those points — a SIGKILL under memory
 * pressure, a `--bail`, an interrupt. `mkdtemp` gives each run a fresh random
 * name, so the strandings accumulate rather than overwrite one another.
 * Sweeping on the way IN is what survives those kills: it repairs the previous
 * run's leak instead of depending on this run exiting cleanly.
 *
 * Every failure is swallowed. The temp dir is shared between users and between
 * repos, so a tree this process may not read is expected, and reclaiming
 * scratch space is never worth failing a suite over.
 */
export function sweepAbandonedTempDirs(
  prefix: string,
  { root = os.tmpdir(), abandonedAfterMs, now }: SweepOptions = {},
) {
  const cutoff = (now ?? Date.now()) - (abandonedAfterMs ?? ABANDONED_AFTER_MS);

  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return 0;
  }

  let swept = 0;
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const candidate = path.join(root, entry);
    try {
      // A plain file sharing the prefix belongs to something else; only the
      // trees this helper mints are in scope.
      if (!fs.statSync(candidate).isDirectory()) {
        continue;
      }
      if (lastTouchedMs(candidate) >= cutoff) {
        continue;
      }
      fs.rmSync(candidate, { recursive: true, force: true });
      swept += 1;
    } catch {
      // Another user's tree, or one a concurrent sweep removed first.
    }
  }
  return swept;
}

/**
 * A fresh fixture tree, with any abandoned siblings reclaimed first.
 *
 * Callers still remove their own tree when they finish; the sweep is what
 * bounds the trees they never get the chance to remove.
 */
export function createTempFixtureDir(prefix: string, options?: SweepOptions) {
  const root = options?.root ?? os.tmpdir();
  sweepAbandonedTempDirs(prefix, { ...options, root });
  return fs.mkdtempSync(path.join(root, prefix));
}
