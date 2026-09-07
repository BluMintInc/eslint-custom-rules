import { namesOption, readOptionName } from './readOptionName';

describe('readOptionName', () => {
  /** Stripping the `=`-joined value HERE is what lets every flag registry be a
   * `Set` read by exact membership, rather than a list each lookup scans for a
   * prefix match. */
  it.each([
    ['--maxWorkers=13', '--maxWorkers'],
    ['--testPathPattern=rules', '--testPathPattern'],
    ['--bail', '--bail'],
    ['-t', '-t'],
    ['src/tests/x.test.ts', 'src/tests/x.test.ts'],
  ])('reads the name half of %p as %p', (token, name) => {
    expect(readOptionName(token)).toBe(name);
  });
});

describe('namesOption', () => {
  it.each([
    ['--unset', '--unset'],
    ['--unset=CI', '--unset'],
  ])('reports %p as naming %p', (token, option) => {
    expect(namesOption(token, option)).toBe(true);
  });

  it('reports a different option as not naming it', () => {
    expect(namesOption('--unsetish', '--unset')).toBe(false);
  });
});
