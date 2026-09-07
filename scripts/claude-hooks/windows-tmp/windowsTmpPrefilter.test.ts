import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchesPrefilter } from '../matchesPrefilter';
import { readWindowsTmpPrefilter } from './windowsTmpPrefilter';

/**
 * Binds the shim's bash prefilter to the checker it shadows. The prefilter
 * never DECIDES anything, but it decides whether the checker is consulted at
 * all — so a denied command the prefilter drops is silently allowed on the only
 * platform this guard runs on, with both tiers green.
 */
const PREFILTER = readWindowsTmpPrefilter();

describe('the windows-tmp prefilter', () => {
  it.each([
    ['a require', 'node -e "require(\'/tmp/r.json\')"'],
    ['a readFileSync', `node -p "require('fs').readFileSync('/tmp/r.json')"`],
    ['a python open', `python3 -c "json.load(open('/tmp/r.json'))"`],
    ['a chdir', 'node -e "process.chdir(`/tmp`)"'],
    ['a line-leading path', '/tmp/x.json is the sink'],
  ])('admits %s', (_label, command) => {
    expect(matchesPrefilter(PREFILTER, command)).toBe(true);
  });

  /** The one narrowing it makes is the REMEDY, so a corrected retry costs
   * nothing. */
  it.each([
    ['the prescribed sink', 'node -e "require(\'./.claude/tmp/s/r.json\')"'],
    ['a relative tmp directory', 'ls tmp/'],
    ['an unrelated command', 'npm run build'],
  ])('skips %s', (_label, command) => {
    expect(matchesPrefilter(PREFILTER, command)).toBe(false);
  });

  /** A benign `/tmp` still pays the bootstrap: which position it occupies is
   * the checker's call, and no bash regex can make it. */
  it('admits a redirect, leaving the position call to the checker', () => {
    expect(matchesPrefilter(PREFILTER, 'gh x --json body > /tmp/b.json')).toBe(
      true,
    );
  });
});

/** Every fixture tree this suite materializes, removed once the run ends. */
const CREATED_ROOTS: string[] = [];

afterAll(() => {
  for (const root of CREATED_ROOTS) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readWindowsTmpPrefilter', () => {
  it('reads the pattern the shim ships', () => {
    expect(readWindowsTmpPrefilter()).toContain('/tmp');
  });

  /**
   * A shim carrying a different number of prefilters is one this binding no
   * longer describes, so it must fail LOUDLY rather than silently grading
   * whichever pattern it happened to find.
   */
  it.each([
    ['none at all', 'echo "{}"\n'],
    [
      'two',
      ['a', 'b']
        .map((name) => {
          return `grep -qE -- '${name}' "$TMP_FILE"`;
        })
        .join('\n'),
    ],
  ])('refuses a shim carrying %s', (_label, contents) => {
    const root = mkdtempSync(join(tmpdir(), 'windows-tmp-prefilter-'));
    CREATED_ROOTS.push(root);
    const shimPath = join(root, 'windows-tmp-guard.sh');
    writeFileSync(shimPath, contents);

    expect(() => {
      return readWindowsTmpPrefilter(shimPath);
    }).toThrow('the prefilter moved, so this binding is void');
  });
});
