import { findGateContainmentOffenses } from './findGateContainmentOffenses';

const find = (command: string) => {
  const found = findGateContainmentOffenses(command);
  if (found.kind !== 'offenses') {
    throw new Error(`unreadable: ${found.reason}`);
  }
  return found.offenses;
};

describe('findGateContainmentOffenses', () => {
  it('convicts a whole-suite run in any segment', () => {
    expect(find('npm run build && npx jest')).toEqual([
      { rule: 'whole-suite', rewrite: 'npm run test:related' },
    ]);
  });

  it('convicts a command that strips the governor around a scoped run', () => {
    expect(find('env -u BLUMINT_GOVERNOR_CLI npm run test:related')).toEqual([
      {
        rule: 'governor-environment',
        rewrite: 'npm run test:related',
        names: ['BLUMINT_GOVERNOR_CLI'],
      },
    ]);
  });

  /**
   * Row one wins where both apply, and that ordering is what makes the retry
   * converge in ONE hop: the whole-suite remedy is a fresh command carrying no
   * environment prefix at all, so publishing row two's rewrite instead would
   * hand back a command row one denies.
   */
  it('publishes the whole-suite remedy when both rules apply', () => {
    expect(find('BLUMINT_MAX_WORKERS=13 npx jest')).toEqual([
      { rule: 'whole-suite', rewrite: 'npm run test:related' },
    ]);
  });

  /** The environment rule needs a jest head to convict: touching these
   * variables around anything else is somebody's ordinary configuration. */
  it.each([
    ['a build', 'CI=true npm run build'],
    ['a lint', 'unset CI && npx eslint src/x.ts'],
    ['a bare unset', 'unset BLUMINT_GOVERNOR_CLI'],
  ])('leaves %s alone', (_label, command) => {
    expect(find(command)).toEqual([]);
  });

  it.each([
    ['a scoped run', 'npx jest src/tests/x.test.ts'],
    ['the canonical script', 'npm run test:related -- src/rules/x.ts'],
    ['an ordinary install', 'npm install'],
  ])('leaves %s alone', (_label, command) => {
    expect(find(command)).toEqual([]);
  });

  /** An operator the splitter cannot model could be hiding another invocation,
   * so the whole command abstains rather than convicting what it can see. */
  it('reports an unmodelled operator as unreadable', () => {
    expect(findGateContainmentOffenses('(npx jest)')).toEqual({
      kind: 'unreadable',
      reason: 'operator:(',
    });
  });

  /**
   * A wrapper option whose value is a whole command is the hole `env -S` opens,
   * so it is reported rather than folded into the ordinary "read it, no
   * opinion" answer — the two are indistinguishable to an operator otherwise,
   * and only one of them is a shape this guard is blind to.
   */
  it('reports an unmodelled wrapper option as unreadable', () => {
    expect(findGateContainmentOffenses("env -S 'npx jest'")).toEqual({
      kind: 'unreadable',
      reason: 'unmodelled-prefix',
    });
  });

  /** The deny outranks the fail-open line: a stderr line an operator may never
   * read is worth less than the deny it would replace. */
  it('convicts what it can read even beside a segment it cannot', () => {
    expect(find("npx jest && env -S 'echo done'")).toEqual([
      { rule: 'whole-suite', rewrite: 'npm run test:related' },
    ]);
  });

  /** An `xargs` prefix is a silent abstention, not a hole: its operands are on
   * stdin BY DESIGN, so a scoped run behind one reads as carrying none. */
  it('leaves a stdin-fed run alone silently', () => {
    expect(find('xargs npx jest')).toEqual([]);
  });

  /** A republish this lexer cannot make faithful is worth a fail-open line
   * rather than a remedy naming a command the author never wrote. */
  it('reports a governor strip it cannot republish as unreadable', () => {
    expect(
      findGateContainmentOffenses('CI=true npx jest "$FILES"'),
    ).toMatchObject({ kind: 'unreadable' });
  });

  /** A newline is an invocation boundary, not whitespace: without the
   * substitution the second command is absorbed into the first's arguments. */
  it('reads a newline as a segment boundary', () => {
    expect(find('npm run build\nnpx jest')).toEqual([
      { rule: 'whole-suite', rewrite: 'npm run test:related' },
    ]);
  });
});
