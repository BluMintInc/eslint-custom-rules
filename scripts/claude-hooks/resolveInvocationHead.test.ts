import { parse } from 'shell-quote';
import { resolveInvocationHead } from './resolveInvocationHead';

const resolveHead = (command: string) => {
  return resolveInvocationHead(parse(command));
};

describe('resolveInvocationHead', () => {
  it('reports the binary position of a bare command', () => {
    expect(resolveHead('npx jest')).toEqual({
      kind: 'resolved',
      envAssignments: [],
      index: 0,
    });
  });

  it('collects the NAME=value run ahead of the binary', () => {
    expect(resolveHead('CI=true BLUMINT_MAX_WORKERS=13 npx jest')).toEqual({
      kind: 'resolved',
      envAssignments: [
        { name: 'CI', value: 'true' },
        { name: 'BLUMINT_MAX_WORKERS', value: '13' },
      ],
      index: 2,
    });
  });

  it.each([
    ['timeout and its mandatory positional', 'timeout 120 npx jest', 2],
    ['an env unset', 'env -u CI npx jest', 3],
    ['nice with an option value', 'nice -n 5 npx jest', 3],
    ['an =-joined option', 'timeout --signal=KILL 120 npx jest', 3],
  ])('walks past %s', (_label, command, index) => {
    expect(resolveHead(command)).toMatchObject({ kind: 'resolved', index });
  });

  /**
   * A short value option carrying its value attached, one deleted space from
   * the detached spelling above. Unmodelled it is not merely missed: the walk
   * refuses, the segment resolves to no invocation, and every gate-containment
   * rule is silently skipped — so `env -uBLUMINT_GOVERNOR_CLI npx jest` would
   * pass where `env -u BLUMINT_GOVERNOR_CLI npx jest` is denied.
   */
  it.each([
    ['an attached env unset', 'env -uCI npx jest', 2],
    ['an attached sudo user', 'sudo -uroot npx jest', 2],
    ['an attached xargs count', 'xargs -n5 npx jest', 2],
  ])('walks past %s', (_label, command, index) => {
    expect(resolveHead(command)).toMatchObject({ kind: 'resolved', index });
  });

  /**
   * The loop is what makes the `env` case correct: assignments are re-collected
   * after every wrapper, so a wrapper standing between the segment head and an
   * assignment does not hide it.
   */
  it('loops, so a wrapper chain resolves and every assignment is collected', () => {
    expect(resolveHead('timeout 120 env CI=true nice npx jest')).toEqual({
      kind: 'resolved',
      envAssignments: [{ name: 'CI', value: 'true' }],
      index: 5,
    });
  });

  /**
   * An option whose VALUE is a command line carries a second invocation inside
   * one token, invisible to a token-position walk — so it is refused rather
   * than modelled, in every spelling.
   */
  it.each([
    ['a split string', "env -S 'npx jest'"],
    ['its =-joined form', "env --split-string='npx jest'"],
    ['a recorded shell', "script -c 'npx jest' /dev/null"],
    /** Attachment bounds the ARITY, never the content: `-S` is not a value
     * option, so its attached form refuses exactly as its detached one does. */
    ['an attached split string', "env -S'npx jest'"],
    ['an unmodelled option arity', 'timeout --unknown-option 120 npx jest'],
  ])('refuses to guess past %s', (_label, command) => {
    expect(resolveHead(command)).toEqual({ kind: 'unmodelled-prefix' });
  });

  it('refuses a truncated wrapper whose positional never arrives', () => {
    expect(resolveHead('timeout')).toEqual({ kind: 'unmodelled-prefix' });
  });
});
