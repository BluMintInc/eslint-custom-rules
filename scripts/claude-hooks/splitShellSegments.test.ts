import { parse } from 'shell-quote';
import { splitShellSegments } from './splitShellSegments';

const split = (command: string) => {
  return splitShellSegments(parse(command));
};

describe('splitShellSegments', () => {
  it.each([['&&'], ['||'], [';'], ['|'], ['&']])('splits on %s', (operator) => {
    const result = split(`npm run build ${operator} npx jest`);

    expect(result).toMatchObject({ kind: 'segments' });
    expect(result.kind === 'segments' && result.segments).toHaveLength(2);
  });

  /**
   * Redirections BIND rather than split: the operator, its target word and any
   * leading file-descriptor token are consumed, leaving the command they
   * decorate intact. Without that, the single most routine shape an agent types
   * is declared unmodelled and the whole command fails open.
   */
  it.each([
    ['a plain redirect', 'npx jest > out.txt'],
    ['a descriptor redirect', 'npx jest 2>/dev/null'],
    ['an append', 'npx jest >> out.txt'],
  ])('binds %s to the command it decorates', (_label, command) => {
    const result = split(command);

    expect(result.kind === 'segments' && result.segments).toEqual([
      ['npx', 'jest'],
    ]);
  });

  /**
   * Refused GLOBALLY, for the whole command rather than per segment: two
   * adjacent unmodelled operators could just as easily be hiding another
   * invocation as not, and there is no way to tell from here.
   */
  it('refuses an operator it cannot model, naming it', () => {
    expect(split('(npx jest)')).toEqual({
      kind: 'unmodelled',
      reason: 'operator:(',
    });
  });

  it.each([
    ['an operator standing where a target belongs', 'npx jest >| out.txt'],
    ['a truncated redirect', 'npx jest >'],
  ])('refuses %s', (_label, command) => {
    expect(split(command)).toEqual({
      kind: 'unmodelled',
      reason: 'redirect-target',
    });
  });

  it('yields one segment for a command carrying no operator', () => {
    expect(split('npx jest --bail')).toEqual({
      kind: 'segments',
      segments: [['npx', 'jest', '--bail']],
    });
  });
});
