import { buildWindowsTmpDenyReason } from './buildWindowsTmpDenyReason';
import type { WindowsTmpOffense } from './findWindowsTmpChildReads';

const CAPTURE: WindowsTmpOffense = {
  line: 1,
  shape: 'read-call',
  paths: ['/tmp/r3.json'],
};

describe('buildWindowsTmpDenyReason', () => {
  /** Remedy first, cause second, on the opaque-delivery floor every guard in
   * this directory writes to. */
  it('opens with the sink to move the capture to', () => {
    expect(buildWindowsTmpDenyReason(CAPTURE)).toMatch(
      /^Move the capture to a repo-local sink/,
    );
  });

  /**
   * The prescribed directory does not exist in a fresh worktree, and the
   * redirect's `rc=1` then reads as a tool failure — so the remedy opens with
   * the `mkdir -p` rather than assuming it.
   */
  it('prescribes the mkdir, the write and the read', () => {
    const reason = buildWindowsTmpDenyReason(CAPTURE);

    expect(reason).toContain('mkdir -p .claude/tmp/<scope>');
    expect(reason).toContain('.claude/tmp/<scope>/r3.json');
    expect(reason).toContain('./.claude/tmp/<scope>/r3.json');
  });

  /** Every path is named. A remedy naming one of several, followed exactly,
   * still breaks the rest — while reading as complete. */
  it('names every path the child parses', () => {
    const reason = buildWindowsTmpDenyReason({
      ...CAPTURE,
      paths: ['/tmp/a.json', '/tmp/b.json'],
    });

    expect(reason).toContain('`/tmp/a.json` and `/tmp/b.json`');
    expect(reason).toContain('sit inside a code string');
  });

  /**
   * The expensive misreading of this rule is the over-correction: an agent told
   * its `/tmp` is broken rewrites the redirect too, and the redirect is the half
   * MSYS resolves properly.
   */
  it('names the positions that are correct as written', () => {
    expect(buildWindowsTmpDenyReason(CAPTURE)).toContain('do not change those');
  });

  /**
   * A `chdir` performs neither the write nor the read the capture remedy
   * choreographs and has no filename to move, so that remedy would publish two
   * operations the command never performs.
   */
  it('prescribes a directory rather than a capture for a bare /tmp', () => {
    const reason = buildWindowsTmpDenyReason({ ...CAPTURE, paths: ['/tmp'] });

    expect(reason).toContain(
      're-run this command against ./.claude/tmp/<scope>',
    );
    expect(reason).not.toContain('Keep the `./` on a `require`');
  });

  /**
   * Unreachable through the guard, which reports an offense only for a line
   * carrying a rooted `/tmp` — kept as a throw because a deny naming no path is
   * unfollowable, and a silent fallback would publish one.
   */
  it('refuses to build a deny naming no path', () => {
    expect(() => {
      return buildWindowsTmpDenyReason({ ...CAPTURE, paths: [] });
    }).toThrow('must name at least one path');
  });
});
