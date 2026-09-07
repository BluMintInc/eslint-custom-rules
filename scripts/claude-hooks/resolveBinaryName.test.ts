import { resolveBinaryName } from './resolveBinaryName';

describe('resolveBinaryName', () => {
  /** Every spelling an agent types resolves to one name, so a guard matching on
   * a binary name has one thing to match rather than a family of paths. */
  it.each([
    ['jest', 'jest'],
    ['./node_modules/.bin/jest', 'jest'],
    ['/usr/local/bin/jest', 'jest'],
    ['node_modules/jest/bin/jest.js', 'jest'],
    ['npx.cmd', 'npx'],
    ['C:/Program Files/nodejs/npm.bat', 'npm'],
    ['git.exe', 'git'],
  ])('resolves %p to %p', (token, name) => {
    expect(resolveBinaryName(token)).toBe(name);
  });

  /** Case-insensitive because Windows paths are: a guard that normalizes
   * `git.exe` and not `git.EXE` has a hole nothing reports. */
  it('strips a suffix whatever its case', () => {
    expect(resolveBinaryName('C:/Program Files/Git/cmd/git.EXE')).toBe('git');
  });

  it('leaves a name whose dot is not a launcher suffix alone', () => {
    expect(resolveBinaryName('jest.config')).toBe('jest.config');
  });
});
