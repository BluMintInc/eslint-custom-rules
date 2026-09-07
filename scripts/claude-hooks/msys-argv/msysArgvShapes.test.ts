import { isPathListShaped, resolvePosixAbsoluteValue } from './msysArgvShapes';

describe('isPathListShaped', () => {
  it.each([
    'origin/develop:.claude/skills/claude-hooks/SKILL.md',
    'origin/develop-fix-bug-2344:src/rules/enforce-empty-object-check.ts',
    'origin/develop:src/index.ts',
    'HEAD~1:src/index.ts',
  ])('matches the reported ref:path argv %p', (token) => {
    expect(isPathListShaped(token)).toBe(true);
  });

  /**
   * The `/` requirement is what keeps the guard off three routine shapes an
   * `a:b` match alone would sweep in — and it is the clause the field evidence
   * supports, since a colon-shaped subcommand is typed on the same boxes and
   * reported working while every mangled argv carried slashes.
   */
  it.each([
    ['a colon-shaped subcommand', 'database:get'],
    ['a bare HEAD:file with no slash', 'HEAD:file.ts'],
    ['a format flag value', '--format=%H:%s'],
    ['a remote URL', 'https://github.com/BluMintInc/eslint-custom-rules.git'],
    ['an ssh remote', 'ssh://git@github.com/x/y'],
    ['a Windows drive path', 'C:/Users/dev/eslint-custom-rules'],
    ['a plain ref', 'origin/develop'],
    ['a trailing colon', 'origin/develop:'],
    ['an empty token', ''],
  ])('does not match %s', (_label, token) => {
    expect(isPathListShaped(token)).toBe(false);
  });
});

describe('resolvePosixAbsoluteValue', () => {
  it.each([
    ['/c/Users/dev/eslint-custom-rules', '/c/Users/dev/eslint-custom-rules'],
    ['/tmp/out.json', '/tmp/out.json'],
    ['--git-dir=/c/repo/.git', '/c/repo/.git'],
    ['--output=/tmp/x.json', '/tmp/x.json'],
  ])('reads %p as the absolute path %p', (token, expected) => {
    expect(resolvePosixAbsoluteValue(token)).toBe(expected);
  });

  it.each([
    ['a relative path', 'scripts/x.ts'],
    ['a bare flag', '--shallow'],
    ['a flag with a relative value', '--output=out.json'],
    ['a ref:path argument', 'origin/develop:.claude/x'],
    ['a leading dash with no equals', '-C'],
  ])('reads no absolute path from %s', (_label, token) => {
    expect(resolvePosixAbsoluteValue(token)).toBeUndefined();
  });
});
