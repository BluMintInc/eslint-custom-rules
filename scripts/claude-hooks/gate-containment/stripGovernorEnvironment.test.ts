import { parse } from 'shell-quote';
import { stripGovernorEnvironment } from './stripGovernorEnvironment';

const strip = (command: string) => {
  return stripGovernorEnvironment(parse(command));
};

describe('stripGovernorEnvironment', () => {
  it.each([
    ['a prefix assignment', 'BLUMINT_MAX_WORKERS=13 npx jest x', 'npx jest x'],
    [
      'a state-directory move',
      'BLUMINT_GOVERNOR_STATE_DIR=/tmp/x npx jest x',
      'npx jest x',
    ],
    [
      'an env unset',
      'env -u BLUMINT_GOVERNOR_CLI npm run test:related',
      'npm run test:related',
    ],
    [
      'the long unset spelling',
      'env --unset BLUMINT_GOVERNOR_CLI npm run test:related',
      'npm run test:related',
    ],
    [
      'the joined unset spelling',
      'env --unset=CI npm run test:related',
      'npm run test:related',
    ],
    /**
     * Real GNU syntax, and one deleted space from the spelling this repo's
     * incident was built on — verified with
     * `export FOO=bar; env -uFOO sh -c 'echo ${FOO:-UNSET}'`.
     */
    [
      'the attached unset spelling',
      'env -uBLUMINT_GOVERNOR_CLI npm run test:related',
      'npm run test:related',
    ],
    [
      'an env assignment',
      'env CI=true npm run test:related',
      'npm run test:related',
    ],
    ['a shell unset', 'unset CI && npx jest x', 'npx jest x'],
    ['an export', 'export CI=true && npx jest x', 'npx jest x'],
    [
      'a tsconfig override',
      'TSX_TSCONFIG_PATH=/x/tsconfig.json npx jest x',
      'npx jest x',
    ],
  ])('strips %s', (_label, command, rewrite) => {
    expect(strip(command)).toMatchObject({
      kind: 'stripped',
      command: rewrite,
    });
  });

  it('names every variable it removed, so the deny can list them', () => {
    expect(
      strip('CI=true env -u BLUMINT_GOVERNOR_CLI npm run test:related'),
    ).toMatchObject({
      removed: ['CI', 'BLUMINT_GOVERNOR_CLI'],
    });
  });

  /** A wrapper left holding none of its own options is a no-op that would read
   * as a surviving prefix, so it goes with the option it carried. */
  it('drops an env head left with nothing to set', () => {
    expect(strip('env -u CI npx jest x')).toMatchObject({
      command: 'npx jest x',
    });
  });

  it('keeps an env head that still carries an option of its own', () => {
    expect(strip('env -i -u CI npx jest x')).toMatchObject({
      command: 'env -i npx jest x',
    });
  });

  it('keeps an unset outside the family, and the option that names it', () => {
    expect(strip('env -u FORCE_COLOR -u CI npx jest x')).toMatchObject({
      command: 'env -u FORCE_COLOR npx jest x',
    });
  });

  /** A truncated `env -u` names nothing to remove, so it is carried through
   * untouched rather than consuming the token after it. */
  it('carries a truncated unset through', () => {
    expect(strip('CI=true env -u')).toMatchObject({
      kind: 'stripped',
      command: 'env -u',
    });
  });

  it('keeps an assignment outside the family', () => {
    expect(strip('FORCE_COLOR=1 CI=true npx jest x')).toMatchObject({
      command: 'FORCE_COLOR=1 npx jest x',
    });
  });

  it('drops an emptied segment with the operator that joined it', () => {
    expect(strip('unset CI && npm run test:related')).toMatchObject({
      command: 'npm run test:related',
    });
  });

  it('keeps a segment whose other operands survive', () => {
    expect(strip('unset CI FORCE_COLOR && npx jest x')).toMatchObject({
      command: 'unset FORCE_COLOR && npx jest x',
    });
  });

  it.each([
    ['no governor name at all', 'npx jest src/x.test.ts'],
    ['an unrelated assignment', 'FORCE_COLOR=1 npx jest'],
    ['a name that merely resembles one', 'BLUMINTISH=1 npx jest'],
  ])('reports %s as clean', (_label, command) => {
    expect(strip(command)).toEqual({ kind: 'clean' });
  });

  /**
   * A redirection BINDS to the command it decorates rather than ending it, the
   * same grammar `splitShellSegments` reads. Abstaining here would fail the
   * whole rule open behind `2>&1 | tail`, the suffix an agent appends to nearly
   * every long command — and the bare pipe is denied, so the pair would differ
   * by a redirect nobody reads as a bypass.
   */
  it.each([
    [
      'a merge-and-page suffix',
      'env -u BLUMINT_GOVERNOR_CLI npx jest x 2>&1 | tail -20',
      'npx jest x 2>&1 | tail -20',
    ],
    [
      'a discarded stderr',
      'env -u BLUMINT_GOVERNOR_CLI npx jest x 2>/dev/null',
      'npx jest x 2>/dev/null',
    ],
    [
      'a captured stdout',
      'BLUMINT_MAX_WORKERS=13 npx jest x > /tmp/out.log',
      'npx jest x >/tmp/out.log',
    ],
    [
      'an appended log and a merge at once',
      'CI=true npx jest x >> /tmp/out.log 2>&1',
      'npx jest x >>/tmp/out.log 2>&1',
    ],
  ])('re-emits %s', (_label, command, rewrite) => {
    expect(strip(command)).toMatchObject({
      kind: 'stripped',
      command: rewrite,
    });
  });

  /**
   * A republish is only worth publishing while it is faithful, so a token this
   * lexer cannot re-emit — an expansion, a backtick, a truncated redirect —
   * abstains rather than handing back a command the author never wrote.
   */
  it.each([
    ['an expansion', 'CI=true npx jest "$FILES"'],
    ['a command substitution', 'CI=true npx jest `cat list`'],
    ['a redirect with no target', 'CI=true npx jest >'],
    ['a clobbering redirect', 'CI=true npx jest >| out.txt'],
    /** An unmodelled operator still ENDS its segment rather than aborting the
     * walk, so the family name before it is found and reported unreadable —
     * never reported clean. */
    ['a subshell', 'CI=true npx jest; (npm run build)'],
  ])('refuses to republish %s', (_label, command) => {
    expect(strip(command)).toMatchObject({ kind: 'unreadable' });
  });
});
