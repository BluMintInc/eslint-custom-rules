import { matchesPrefilter } from './matchesPrefilter';

describe('matchesPrefilter', () => {
  it('reports a match', () => {
    expect(matchesPrefilter('^git ', 'git show a:b/c')).toBe(true);
  });

  it('reports no match', () => {
    expect(matchesPrefilter('^git ', 'npm run build')).toBe(false);
  });

  /**
   * POSIX bracket expressions are exactly why this shells out rather than
   * using a JS `RegExp`: JS reads `[[:alnum:]]` as an ordinary character set,
   * so a JS-side check would grade a different pattern than the one that ships.
   */
  it('honours a POSIX bracket expression the way the shim does', () => {
    expect(
      matchesPrefilter(
        '(^|[^[:alnum:]_-])git([^[:alnum:]_-]|$)',
        'git.exe show a:b/c',
      ),
    ).toBe(true);
    expect(
      matchesPrefilter(
        '(^|[^[:alnum:]_-])git([^[:alnum:]_-]|$)',
        'legit show a:b/c',
      ),
    ).toBe(false);
  });

  /** A status other than match/no-match is a real failure — an invalid pattern
   * must crash the binding rather than read as "no match", which would make a
   * broken prefilter look like a passing one. */
  it('throws on a grep failure rather than reporting no match', () => {
    expect(() => {
      return matchesPrefilter('[unterminated', 'git show a:b/c');
    }).toThrow('grep failed');
  });
});
