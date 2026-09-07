import { formatShellSegment, quoteShellToken } from './formatShellSegment';

describe('quoteShellToken', () => {
  /**
   * The colon is the whole reason this exists instead of `shell-quote`'s
   * `quote()`, which renders it `origin/develop\:.claude/x` — a backslash the
   * reader of a message ABOUT a colon has to decide is not part of the fix.
   */
  it.each([
    'origin/develop:.claude/skills/claude-hooks/SKILL.md',
    '/c/Users/dev/eslint-custom-rules',
    '--git-dir=/c/repo/.git',
    'git',
  ])('leaves the shell-safe token %p unquoted', (token) => {
    expect(quoteShellToken(token)).toBe(token);
  });

  it.each([
    ['a space', 'C:/Program Files/Git', "'C:/Program Files/Git'"],
    ['a semicolon', 'a;b', "'a;b'"],
    ['an empty token', '', "''"],
    ['an embedded single quote', "it's", `'it'\\''s'`],
    /** `~` is outside the safe set because a leading one expands; quoting a
     * mid-word `HEAD~1` costs nothing and needs no positional reasoning. */
    ['a tilde', 'HEAD~1:src/index.ts', "'HEAD~1:src/index.ts'"],
  ])('quotes %s', (_label, token, expected) => {
    expect(quoteShellToken(token)).toBe(expected);
  });
});

describe('formatShellSegment', () => {
  it('joins tokens into a pasteable command line', () => {
    expect(
      formatShellSegment(['git', 'show', 'origin/develop:.claude/x']),
    ).toBe('git show origin/develop:.claude/x');
  });
});
