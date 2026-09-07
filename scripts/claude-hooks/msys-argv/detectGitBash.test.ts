import {
  detectGitBash,
  GIT_BASH_PLATFORM,
  MSYS_GUARD_PLATFORM_ENV,
} from './detectGitBash';

describe('detectGitBash', () => {
  it('arms on the verdict the shim exports', () => {
    expect(
      detectGitBash({ [MSYS_GUARD_PLATFORM_ENV]: GIT_BASH_PLATFORM }),
    ).toBe(true);
  });

  /**
   * The shim is the sole detector, so nothing else here is consulted — an
   * ambient `MSYSTEM`/`OSTYPE` is not a second opinion the checker may take.
   * A checker reached without the exported verdict holds no opinion, which is
   * this guard's prescribed fail-open direction.
   */
  it.each([
    ['a declared non-Git-Bash verdict', { [MSYS_GUARD_PLATFORM_ENV]: 'other' }],
    ['an empty verdict', { [MSYS_GUARD_PLATFORM_ENV]: '' }],
    ['no verdict at all', {}],
    ['an ambient MSYSTEM with no verdict', { MSYSTEM: 'MINGW64' }],
    ['an ambient msys OSTYPE with no verdict', { OSTYPE: 'msys' }],
  ])('stays silent on %s', (_label, env) => {
    expect(detectGitBash(env)).toBe(false);
  });
});
