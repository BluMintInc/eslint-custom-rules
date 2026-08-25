import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ABANDONED_AFTER_MS,
  createTempFixtureDir,
  sweepAbandonedTempDirs,
} from '../utils/tempFixtureDir';

const PREFIX = 'sweep-subject-';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-probe-root-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A fixture tree holding one nested file, so the suite exercises the same shape
 * the real callers leave behind rather than an empty directory.
 */
const plantTree = (name: string) => {
  const dir = path.join(root, name);
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'nested', 'fixture.ts'), '// fixture');
  fs.writeFileSync(path.join(dir, 'top.ts'), '// fixture');
  return dir;
};

/** Backdate a tree and everything directly inside it by `ageMs`. */
const backdate = (dir: string, ageMs: number) => {
  const stamp = new Date(Date.now() - ageMs);
  for (const entry of fs.readdirSync(dir)) {
    fs.utimesSync(path.join(dir, entry), stamp, stamp);
  }
  fs.utimesSync(dir, stamp, stamp);
};

const TWO_HOURS = 2 * 60 * 60 * 1000;

describe('sweepAbandonedTempDirs', () => {
  it('reclaims a tree left behind by an earlier run', () => {
    const stale = plantTree(`${PREFIX}stale`);
    backdate(stale, TWO_HOURS);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('keeps a tree a concurrent run is still using', () => {
    const live = plantTree(`${PREFIX}live`);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(0);
    expect(fs.existsSync(live)).toBe(true);
  });

  it('keeps a stale tree that does not carry the prefix', () => {
    const foreign = plantTree('someone-elses-');
    backdate(foreign, TWO_HOURS);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(0);
    expect(fs.existsSync(foreign)).toBe(true);
  });

  it('reclaims only the stale trees when both kinds are present', () => {
    const stale = plantTree(`${PREFIX}stale`);
    const live = plantTree(`${PREFIX}live`);
    const foreign = plantTree('someone-elses-');
    backdate(stale, TWO_HOURS);
    backdate(foreign, TWO_HOURS);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
  });

  it('leaves a prefixed FILE alone, since only minted trees are in scope', () => {
    const file = path.join(root, `${PREFIX}note.txt`);
    fs.writeFileSync(file, 'not a fixture tree');
    const stamp = new Date(Date.now() - TWO_HOURS);
    fs.utimesSync(file, stamp, stamp);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(0);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('reads age from the newest entry, not the tree itself', () => {
    // A run writing only into a subdirectory never moves the tree's own mtime,
    // so an age read from the tree alone would sweep a live run's fixtures.
    const active = plantTree(`${PREFIX}active`);
    backdate(active, TWO_HOURS);
    const fresh = new Date();
    fs.utimesSync(path.join(active, 'nested'), fresh, fresh);

    expect(sweepAbandonedTempDirs(PREFIX, { root })).toBe(0);
    expect(fs.existsSync(active)).toBe(true);
  });

  it('honours an explicit window', () => {
    const recent = plantTree(`${PREFIX}recent`);
    backdate(recent, 5_000);

    expect(
      sweepAbandonedTempDirs(PREFIX, { root, abandonedAfterMs: 1_000 }),
    ).toBe(1);
    expect(fs.existsSync(recent)).toBe(false);
  });

  it('reports nothing swept when the root is unreadable', () => {
    expect(
      sweepAbandonedTempDirs(PREFIX, { root: path.join(root, 'absent') }),
    ).toBe(0);
  });

  it('defaults to a window well clear of a single run', () => {
    expect(ABANDONED_AFTER_MS).toBe(60 * 60 * 1000);
  });
});

describe('createTempFixtureDir', () => {
  it('returns a fresh directory that exists', () => {
    const dir = createTempFixtureDir(PREFIX, { root });

    expect(fs.existsSync(dir)).toBe(true);
    expect(path.basename(dir).startsWith(PREFIX)).toBe(true);
  });

  it('reclaims abandoned siblings on the way in', () => {
    const stale = plantTree(`${PREFIX}stale`);
    backdate(stale, TWO_HOURS);

    const dir = createTempFixtureDir(PREFIX, { root });

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('does not reclaim the directory it just minted', () => {
    const dir = createTempFixtureDir(PREFIX, { root });
    // A second call must treat the first call's tree as a live peer.
    const other = createTempFixtureDir(PREFIX, { root });

    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    expect(dir).not.toBe(other);
  });
});
