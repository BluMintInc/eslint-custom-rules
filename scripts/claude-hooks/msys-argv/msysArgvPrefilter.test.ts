import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesPrefilter } from '../matchesPrefilter';
import { GIT_REF_PATH_VERBS } from './locateGitCandidate';
import { readShimPrefilters } from './msysArgvPrefilter';

/**
 * Binds the shim's bash prefilters to the TypeScript registries they shadow.
 *
 * The prefilter never DECIDES anything, but it decides whether the checker is
 * consulted at all — so a registry member the prefilter drops is silently inert
 * on the only platform this guard runs on, with both tiers green. This is the
 * mechanism that makes the shim's stated "may only ever err toward matching"
 * invariant true rather than aspirational.
 *
 * `GIT_VALUE_OPTIONS` is deliberately NOT covered: it is a walk detail inside
 * the checker that the prefilter never sees.
 */

const { binary: BINARY_PREFILTER, verb: VERB_PREFILTER } = readShimPrefilters();

/** The binary spellings `resolveBinaryName` normalizes. Every one must reach
 * the checker to be normalized at all. */
const BINARY_SPELLINGS = [
  'git',
  '/usr/bin/git',
  'git.exe',
  'git.cmd',
  'C:/Program Files/Git/cmd/git.exe',
  'C:/Program Files/Git/cmd/git.EXE',
  'npx',
  'npx.cmd',
] as const;

describe('the shim binary prefilter admits every modelled spelling', () => {
  it.each(BINARY_SPELLINGS)('admits %p', (spelling) => {
    /** `npx` reaches the checker only alongside a wrapped binary, so the probe
     * carries the shape an agent actually types. */
    const command = spelling.includes('npx')
      ? `${spelling} git show origin/develop:.claude/x`
      : `${spelling} show origin/develop:.claude/x`;

    expect(matchesPrefilter(BINARY_PREFILTER, command)).toBe(true);
  });

  it.each([
    ['a word merely ending in the binary name', 'legit show a/b:c'],
    ['a dotfile mention', 'checking .gitignore rules'],
    ['a hostname', 'see github.com/x show'],
  ])('still rejects %s', (_label, command) => {
    expect(matchesPrefilter(BINARY_PREFILTER, command)).toBe(false);
  });
});

describe('the shim verb prefilter admits every registry member', () => {
  it.each([...GIT_REF_PATH_VERBS])('admits %p', (verb) => {
    expect(
      matchesPrefilter(VERB_PREFILTER, `git ${verb} origin/develop:.claude/x`),
    ).toBe(true);
  });

  it('rejects a command carrying no modelled verb', () => {
    expect(matchesPrefilter(VERB_PREFILTER, 'git commit -m "fix"')).toBe(false);
  });

  /** The dropped family, pinned in both directions: this repo runs no firebase
   * CLI, so an RTDB verb must NOT buy a `tsx` bootstrap here. */
  it('rejects the firebase RTDB verbs this port does not model', () => {
    expect(
      matchesPrefilter(VERB_PREFILTER, 'npx firebase database:get /status/uid'),
    ).toBe(false);
  });
});

/**
 * Every fixture tree this suite materializes, removed in `afterAll`. Without it
 * each run leaks one `mkdtemp` directory per case.
 */
const CREATED_ROOTS: string[] = [];

afterAll(() => {
  for (const root of CREATED_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readShimPrefilters', () => {
  it('reads exactly the two patterns the shim ships', () => {
    const { binary, verb } = readShimPrefilters();

    expect(binary).toContain('git');
    expect(verb).toContain('cat-file');
  });

  /**
   * The guard that keeps this binding honest: a shim carrying a different
   * number of prefilters is one this test no longer describes, so it must fail
   * LOUDLY rather than silently grading whichever patterns it happened to find
   * — a binding that grades one of two prefilters reads exactly like a passing
   * one.
   */
  it.each([
    ['one prefilter', 'grep -qE -- \'only\' "$TMP_FILE"\n'],
    ['none at all', 'echo "{}"\n'],
    [
      'three',
      ['a', 'b', 'c']
        .map((name) => {
          return `grep -qE -- '${name}' "$TMP_FILE"`;
        })
        .join('\n'),
    ],
  ])('refuses a shim carrying %s', (_label, contents) => {
    const root = mkdtempSync(join(tmpdir(), 'msys-prefilter-'));
    CREATED_ROOTS.push(root);
    const shimPath = join(root, 'msys-argv-guard.sh');
    writeFileSync(shimPath, contents);

    expect(() => {
      return readShimPrefilters(shimPath);
    }).toThrow('the prefilter moved, so this binding is void');
  });
});
