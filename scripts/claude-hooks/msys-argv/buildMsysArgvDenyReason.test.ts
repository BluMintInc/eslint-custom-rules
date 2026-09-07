import { buildMsysArgvDenyReason } from './buildMsysArgvDenyReason';
import type { MsysArgvOffense } from './types';

const GIT_OFFENSE: MsysArgvOffense = {
  family: 'git-ref-path',
  verb: 'show',
  argument: 'origin/develop:.claude/skills/claude-hooks/SKILL.md',
  retry: {
    kind: 'prefix',
    command: 'git show origin/develop:.claude/skills/claude-hooks/SKILL.md',
  },
};

describe('buildMsysArgvDenyReason', () => {
  it('publishes the exact corrected command, so one retry converges', () => {
    expect(buildMsysArgvDenyReason(GIT_OFFENSE)).toContain(
      'MSYS_NO_PATHCONV=1 git show origin/develop:.claude/skills/claude-hooks/SKILL.md',
    );
  });

  it('names the offending argument and the error it produces', () => {
    const reason = buildMsysArgvDenyReason(GIT_OFFENSE);

    expect(reason).toContain(
      '`origin/develop:.claude/skills/claude-hooks/SKILL.md`',
    );
    expect(reason).toContain('unknown revision or path');
  });

  it('names the doctrine entry a reader can go and check', () => {
    expect(buildMsysArgvDenyReason(GIT_OFFENSE)).toContain(
      'MSYS_NO_PATHCONV=1',
    );
  });

  /**
   * The cross-product case is the one a naive guard gets wrong: a blanket
   * prefix would protect the `<ref>:<path>` and BREAK the `-C`, which is
   * exactly the form the argv-scope bound forbids. The message must prescribe
   * the split.
   */
  it('prescribes the split rather than a blanket prefix on a git -C command', () => {
    const reason = buildMsysArgvDenyReason({
      family: 'git-ref-path',
      verb: 'show',
      argument: 'origin/develop:.claude/x',
      retry: {
        kind: 'split',
        directory: '/c/Users/dev/eslint-custom-rules',
        command: 'git show origin/develop:.claude/x',
      },
    });

    expect(reason).toContain(
      'cd /c/Users/dev/eslint-custom-rules && MSYS_NO_PATHCONV=1 git show origin/develop:.claude/x',
    );
    expect(reason).toContain('suppresses conversion for the WHOLE argv');
    expect(reason).not.toContain('MSYS_NO_PATHCONV=1 git -C');
  });

  describe('the rewrite lane', () => {
    const REWRITE_REASON = buildMsysArgvDenyReason({
      family: 'git-ref-path',
      verb: 'show',
      argument: 'origin/develop:.claude/x',
      retry: {
        kind: 'rewrite',
        conflicting: ['/c/repo/.git'],
        command: 'git --git-dir=/c/repo/.git show origin/develop:.claude/x',
      },
    });

    it('names the conflicting path and the form it must take', () => {
      expect(REWRITE_REASON).toContain(
        'suppresses conversion for the WHOLE argv',
      );
      expect(REWRITE_REASON).toContain('`/c/repo/.git`');
      expect(REWRITE_REASON).toContain('`C:/…` forward-slash form');
    });

    /**
     * The prefix is argv-wide, so naming one of several absolute paths yields a
     * remedy that, followed exactly, still breaks the rest — while reading as
     * complete. Every one must appear.
     */
    it('names EVERY conflicting path, not just the first', () => {
      const reason = buildMsysArgvDenyReason({
        family: 'git-ref-path',
        verb: 'show',
        argument: 'origin/develop:.claude/x',
        retry: {
          kind: 'rewrite',
          conflicting: ['/c/one', '/c/two', '/c/three/.git'],
          command: 'git -C /c/one -C /c/two --git-dir=/c/three/.git show a:b/c',
        },
      });

      for (const path of ['/c/one', '/c/two', '/c/three/.git']) {
        expect(reason).toContain(`\`${path}\``);
      }
      expect(reason).toContain('ARE filesystem paths');
    });

    /**
     * The one arm that must NOT publish a pasteable line. Only the author knows
     * what `/c/repo/.git` is on this machine, so printing
     * `MSYS_NO_PATHCONV=1 <the unchanged command>` beneath an instruction to
     * rewrite one of its arguments is the shape a hurried reader copies WITHOUT
     * the rewrite — landing on exactly the blanket prefix the sentence above it
     * forbids.
     */
    it('publishes no runnable command carrying the un-rewritten path', () => {
      expect(REWRITE_REASON).not.toContain(
        'MSYS_NO_PATHCONV=1 git --git-dir=/c/repo/.git',
      );
      expect(REWRITE_REASON).toContain('there is no command to paste');
    });
  });

  /**
   * The rewrite arm is only ever built from a non-empty conflict list, so this
   * throw is unreachable through the guard — kept, and graded, because a
   * silent fallback would emit a message naming no path at all, which is worse
   * than the crash for a caller that broke the invariant.
   */
  it('refuses to build a rewrite naming no conflicting path', () => {
    expect(() => {
      return buildMsysArgvDenyReason({
        ...GIT_OFFENSE,
        retry: { kind: 'rewrite', conflicting: [], command: 'git show a:b/c' },
      });
    }).toThrow('must name at least one conflicting path');
  });

  it('quotes a directory carrying a space', () => {
    expect(
      buildMsysArgvDenyReason({
        ...GIT_OFFENSE,
        retry: {
          kind: 'split',
          directory: '/c/Program Files/repo',
          command: 'git show a:b/c',
        },
      }),
    ).toContain("cd '/c/Program Files/repo' &&");
  });
});
