import { findMsysArgvOffenses } from './findMsysArgvOffenses';

const expectSingleOffense = (command: string) => {
  const offenses = expectOffenses(command);
  expect(offenses).toHaveLength(1);
  const [offense] = offenses;
  if (offense === undefined) {
    throw new Error('unreachable: length was asserted above');
  }
  return offense;
};

/**
 * Every `git show` command quoted here is a verbatim field report from agora's
 * #44340. The guard has to recognize the commands agents actually typed, not a
 * tidied-up shape. agora's firebase arms are absent with the family itself: no
 * firebase CLI runs in this repo.
 */
const expectOffenses = (command: string) => {
  const found = findMsysArgvOffenses(command);
  if (found.kind !== 'offenses') {
    throw new Error(`expected offenses, got ${found.kind}: ${found.reason}`);
  }
  return found.offenses;
};

describe('findMsysArgvOffenses — the git <ref>:<path> arm', () => {
  it('flags a reported read verbatim, including its redirect', () => {
    const offense = expectSingleOffense(
      'git show origin/develop:.claude/skills/jest/SKILL.md > .claude/tmp/SKILL-develop.md',
    );

    expect(offense).toEqual({
      family: 'git-ref-path',
      verb: 'show',
      argument: 'origin/develop:.claude/skills/jest/SKILL.md',
      retry: {
        kind: 'prefix',
        command:
          'git show origin/develop:.claude/skills/jest/SKILL.md > .claude/tmp/SKILL-develop.md',
      },
    });
  });

  it('flags an unquoted ref:path with a nested dot-directory', () => {
    const offense = expectSingleOffense(
      'git show origin/develop:.github-issues/diagnoses/rule-crash/rule-crash-diagnosis.md',
    );

    expect(offense.argument).toBe(
      'origin/develop:.github-issues/diagnoses/rule-crash/rule-crash-diagnosis.md',
    );
  });

  it('flags a double-quoted read, whose quoting did not help', () => {
    const offense = expectSingleOffense(
      'git show "origin/fix/enforce-empty-object-check-2344:.claude/skills/jest/SKILL.md"',
    );

    expect(offense.argument).toBe(
      'origin/fix/enforce-empty-object-check-2344:.claude/skills/jest/SKILL.md',
    );
  });

  /**
   * The reports' own discriminating data point: an ordinary source read ran
   * unmangled in the same session that a `.claude/…` read was mangled.
   * Reported, not reproduced — and it argues FOR unconditional prefixing either
   * way, so the guard treats both alike rather than modelling a selectivity
   * nobody has pinned down.
   */
  it('flags a src read exactly as it flags a dot-directory one', () => {
    expect(
      expectSingleOffense('git show origin/develop:src/utils/loadPlugin.ts')
        .argument,
    ).toBe('origin/develop:src/utils/loadPlugin.ts');
  });

  it.each(['show', 'cat-file', 'ls-tree', 'rev-parse'])(
    'covers the verb %p doctrine names for this argument shape',
    (verb) => {
      expect(
        expectSingleOffense(`git ${verb} origin/develop:.claude/x`).verb,
      ).toBe(verb);
    },
  );

  it('reads past git globals to reach the verb', () => {
    expect(
      expectSingleOffense(
        'git --no-pager -c core.pager=cat show origin/develop:.claude/x',
      ).verb,
    ).toBe('show');
  });

  it.each(['-p', '--no-pager', '--literal-pathspecs', '--exec-path=/c/git'])(
    'consumes the unmodelled boolean global %p and still finds the verb',
    (global) => {
      expect(
        expectSingleOffense(`git ${global} show origin/develop:.claude/x`).verb,
      ).toBe('show');
    },
  );

  /**
   * The walk's one error budget, pinned as a KNOWN fail-open rather than left
   * implicit: a value-taking global the option list omits leaves its value in
   * verb position, where it fails the verb-set test and the segment is allowed.
   * That is the safe direction — a walk that guessed an unknown flag's arity
   * would eventually publish a retry that is not the author's command — and
   * adding the flag to `GIT_VALUE_OPTIONS` converts this to a deny.
   */
  it('fails OPEN on a value-taking global the option list omits', () => {
    expect(
      expectOffenses(
        'git --upload-pack /c/bin/git-upload-pack show origin/develop:.claude/x',
      ),
    ).toEqual([]);
  });

  it('rebuilds only the offending segment of a compound command', () => {
    const offense = expectSingleOffense(
      'npm run build && git show origin/develop:.claude/x',
    );

    expect(offense.retry).toEqual({
      kind: 'prefix',
      command: 'git show origin/develop:.claude/x',
    });
  });

  it('reports every offending segment, leaving the caller to name the first', () => {
    const offenses = expectOffenses(
      'git show origin/develop:a/b; git cat-file -p origin/develop:c/d',
    );

    expect(
      offenses.map(({ verb }) => {
        return verb;
      }),
    ).toEqual(['show', 'cat-file']);
  });
});

describe('findMsysArgvOffenses — the convergence branch', () => {
  /**
   * The branch that makes one retry land: the deny publishes
   * `MSYS_NO_PATHCONV=1 <command>`, and re-issuing exactly that must produce no
   * second opinion. Without it the guard would deny its own prescription.
   */
  it('has no opinion once the prescribed prefix is present', () => {
    expect(
      expectOffenses(
        'MSYS_NO_PATHCONV=1 git show "origin/develop:.claude/skills/jest/SKILL.md"',
      ),
    ).toEqual([]);
  });

  it('still flags an unrelated env assignment', () => {
    expect(
      expectSingleOffense('GIT_PAGER=cat git show origin/develop:.claude/x')
        .verb,
    ).toBe('show');
  });

  /**
   * A pre-existing prefix makes a segment compliant ONLY when nothing else in
   * its argv needed converting. Doctrine names
   * `MSYS_NO_PATHCONV=1 git -C /c/… show <ref>:<path>` as broken and this
   * module's own deny text teaches against it — and because the mainline
   * doctrine is "prefix unconditionally", it is the shape an agent types
   * unprompted. Clearing the segment on the prefix alone silently allowed it.
   */
  it.each([
    [
      'a -C alongside the prefix',
      'MSYS_NO_PATHCONV=1 git -C /c/Users/dev/eslint-custom-rules show origin/develop:.claude/x',
    ],
    [
      'a --git-dir alongside the prefix',
      'MSYS_NO_PATHCONV=1 git --git-dir /c/repo/.git show origin/develop:a/b',
    ],
  ])('still denies %s', (_label, command) => {
    expect(expectOffenses(command)).toHaveLength(1);
  });

  /** The published retry must never carry the token twice. */
  it('strips the existing prefix from the command it republishes', () => {
    const { retry } = expectSingleOffense(
      'MSYS_NO_PATHCONV=1 git -C /c/repo show origin/develop:.claude/x',
    );

    expect(retry).toEqual({
      kind: 'split',
      directory: '/c/repo',
      command: 'git show origin/develop:.claude/x',
    });
  });
});

describe('findMsysArgvOffenses — banked convictions survive an unreadable sibling', () => {
  /**
   * Abstaining is right for a segment the lexer could not read and
   * catastrophic for its neighbours: discarding the convicted half made
   * `git show <ref>:<path> && git show "$REF:path"` fail open ENTIRELY, so the
   * first command ran unprefixed on Git Bash — the failure this guard exists to
   * prevent. Denying loses nothing, since only the OFFENDING segment is ever
   * republished.
   */
  it.each([
    [
      'the convicted segment first',
      'git show origin/develop:.claude/x && git show "$REF:path"',
    ],
    [
      'the convicted segment last',
      'git show "$REF:path" && git show origin/develop:.claude/x',
    ],
    [
      'joined by a semicolon',
      'git show origin/develop:.claude/x; git show "$REF:path"',
    ],
  ])('denies with %s', (_label, command) => {
    const offenses = expectOffenses(command);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]?.argument).toBe('origin/develop:.claude/x');
  });

  /** With nothing convicted there is no conviction to bank, so the whole
   * command still abstains — the lexer-limitation case, unchanged. */
  it('still abstains when the unreadable segment is the only candidate', () => {
    expect(
      findMsysArgvOffenses('npm run build && git show "$REF:path"'),
    ).toMatchObject({ kind: 'unreadable', reason: 'unexpandable-argv' });
  });
});

describe('findMsysArgvOffenses — the cross-product case', () => {
  /**
   * `MSYS_NO_PATHCONV=1` suppresses conversion for the WHOLE argv, so telling
   * this command to add the prefix would protect the `<ref>:<path>` and break
   * the `-C` — precisely the form the argv-scope bound forbids.
   */
  it('prescribes the split, never a blanket prefix, for git -C <absolute>', () => {
    const offense = expectSingleOffense(
      'git -C /c/Users/dev/eslint-custom-rules show origin/develop:.claude/x',
    );

    expect(offense.retry).toEqual({
      kind: 'split',
      directory: '/c/Users/dev/eslint-custom-rules',
      command: 'git show origin/develop:.claude/x',
    });
  });

  it('prescribes the rewrite lane for an absolute path a cd cannot express', () => {
    const offense = expectSingleOffense(
      'git --git-dir /c/repo/.git show origin/develop:.claude/x',
    );

    expect(offense.retry).toEqual({
      kind: 'rewrite',
      conflicting: ['/c/repo/.git'],
      command: 'git --git-dir /c/repo/.git show origin/develop:.claude/x',
    });
  });

  it('reads an absolute path out of an =-joined option value', () => {
    expect(
      expectSingleOffense(
        'git --git-dir=/c/repo/.git show origin/develop:.claude/x',
      ).retry,
    ).toMatchObject({ kind: 'rewrite', conflicting: ['/c/repo/.git'] });
  });

  /**
   * The prefix is argv-wide, so a remedy naming one of several absolute paths
   * still breaks the rest while reading as complete. Every one is named,
   * INCLUDING the `-C` value the split arm would have removed — the published
   * command no longer carries a `cd` to absorb it.
   */
  it('names every conflicting path when several share the argv', () => {
    expect(
      expectSingleOffense(
        'git -C /c/one -C /c/two --git-dir=/c/three/.git show origin/develop:.claude/x',
      ).retry,
    ).toMatchObject({
      kind: 'rewrite',
      conflicting: ['/c/one', '/c/two', '/c/three/.git'],
    });
  });

  /**
   * argv[0] is the program to exec and is never subject to MSYS argument
   * conversion, so an absolute-path binary is NOT a conflict — reporting it
   * would suppress the executable split in favour of a substitution the reader
   * cannot perform on the program's own path.
   */
  it('does not mistake an absolute-path binary for a conflicting argument', () => {
    expect(
      expectSingleOffense(
        '/mingw64/bin/git -C /c/repo show origin/develop:.claude/x',
      ).retry,
    ).toEqual({
      kind: 'split',
      directory: '/c/repo',
      command: '/mingw64/bin/git show origin/develop:.claude/x',
    });
  });

  /**
   * The split is only sound if removing the `-C` leaves nothing a blanket
   * prefix would still break. A SECOND `-C` survives that removal, so a naive
   * split would publish `cd /c/one && MSYS_NO_PATHCONV=1 git … -C /c/two …` —
   * handing back the very blanket prefix the message forbids one sentence
   * earlier. It must fall back to the rewrite lane.
   */
  it('refuses to split when a second absolute path survives the removal', () => {
    expect(
      expectSingleOffense(
        'git -c a=b -C /c/one -C /c/two show origin/develop:.claude/x',
      ).retry,
    ).toMatchObject({ kind: 'rewrite' });
  });

  it('still splits when removing the -C leaves nothing absolute behind', () => {
    expect(
      expectSingleOffense(
        'git -C /c/repo -c core.pager=cat show origin/develop:.claude/x',
      ).retry,
    ).toEqual({
      kind: 'split',
      directory: '/c/repo',
      command: 'git -c core.pager=cat show origin/develop:.claude/x',
    });
  });

  /**
   * A relative `-C` needs no conversion, so it is no conflict — the prefix is
   * safe and the guard must not degrade a converging one-hop retry into a
   * two-part instruction for it.
   */
  it('treats a relative -C as no conflict at all', () => {
    expect(
      expectSingleOffense('git -C ../sibling show origin/develop:.claude/x')
        .retry,
    ).toMatchObject({ kind: 'prefix' });
  });

  /**
   * The prefix scopes to ONE command's argv, so an absolute path in a
   * different segment is not in scope — this is the shape doctrine itself
   * prescribes as the split's second half.
   */
  it('ignores an absolute path in a different segment', () => {
    expect(
      expectSingleOffense(
        'cd /c/Users/dev/eslint-custom-rules && git show origin/develop:a/b',
      ).retry,
    ).toMatchObject({ kind: 'prefix' });
  });

  it('does not mistake a redirect target for a conflicting argument', () => {
    expect(
      expectSingleOffense('git show origin/develop:a/b > /tmp/out.md').retry,
    ).toMatchObject({ kind: 'prefix' });
  });
});

describe('findMsysArgvOffenses — the npx wrapper', () => {
  /**
   * `npx` puts itself in binary position, so the family must carry the WRAPPED
   * binary's index: keying the positional walk on `npx`'s own index made
   * `locateGitCandidate` read `git` as the subcommand, miss the verb set, and
   * ALLOW the command silently while the unwrapped form denied.
   */
  it.each([
    ['a bare npx git', 'npx git show origin/develop:.claude/x', 'show'],
    ['npx with a flag', 'npx -y git show origin/develop:.claude/x', 'show'],
    ['npx git cat-file', 'npx git cat-file -p origin/develop:a/b', 'cat-file'],
  ])('denies %s', (_label, command, verb) => {
    expect(expectSingleOffense(command).verb).toBe(verb);
  });

  /** The control: a wrapper `resolveInvocationHead` DOES model already
   * resolved correctly, and must keep doing so. */
  it.each([
    'timeout 30 git show origin/develop:.claude/x',
    'sudo git show origin/develop:.claude/x',
  ])('keeps denying the already-working wrapper form %p', (command) => {
    expect(expectSingleOffense(command).verb).toBe('show');
  });

  it('has no opinion on an npx that wraps something else entirely', () => {
    expect(
      expectOffenses('npx tsx scripts/test-related.ts src/rules/x.ts'),
    ).toEqual([]);
  });

  /**
   * `#` makes `shell-quote` yield a `{comment:…}` object mid-segment, so the
   * scan for the wrapped binary meets a non-string token and must skip it
   * rather than assume the segment ended.
   */
  it('skips a non-string token while looking past npx', () => {
    expect(
      expectOffenses('npx #note\ngit show origin/develop:.claude/x'),
    ).toEqual([]);
  });
});

describe('findMsysArgvOffenses — what it deliberately leaves alone', () => {
  it.each([
    ['a verb whose operand IS a working-tree path', 'git add src/index.ts'],
    ['a checkout', 'git checkout origin/develop -- src/index.ts'],
    ['a ref with no path', 'git show origin/develop'],
    ['a rev-parse flag', 'git rev-parse --show-toplevel'],
    ['a remote URL operand', 'git clone https://github.com/x/y.git'],
    ['a pathspec after the separator', 'git show HEAD -- a/b:c/d'],
    ['a quoted mention inside another command', 'echo "git show a:b/c"'],
    [
      'a commit message mentioning the shape',
      'git commit -m "fix git show a:b/c"',
    ],
    ['a wholly unrelated command', 'npm run test:related'],
  ])('has no opinion on %s', (_label, command) => {
    expect(expectOffenses(command)).toEqual([]);
  });
});

describe('findMsysArgvOffenses — fail-open, never deny, on anything unreadable', () => {
  /**
   * `shell-quote` resolves an unset variable to the EMPTY STRING with no
   * marker, so a guard parsing with a bare env would decide on an argument the
   * agent never wrote. The sentinel makes the expansion detectable, and the
   * only sound answer is to abstain.
   */
  it.each([
    ['a variable in the ref', 'git show "$REF:.claude/x"'],
    ['a variable in the path', 'git show "origin/develop:$FILE"'],
    ['a command substitution', 'git show $(git rev-parse HEAD):a/b'],
    ['a backtick substitution', 'git show `cat ref.txt`:a/b'],
  ])('abstains on %s', (_label, command) => {
    expect(findMsysArgvOffenses(command)).toMatchObject({
      kind: 'unreadable',
      reason: expect.any(String),
    });
  });

  /**
   * Measured against installed `shell-quote`: an unterminated quote is silently
   * CLOSED rather than reported, so no abstention is available here. Pinned as
   * a known limit rather than left implicit — and harmless, because bash itself
   * refuses such a command, so the deny replaces a syntax error the agent was
   * going to get anyway.
   */
  it('cannot see an unterminated quote, and flags the closed reading', () => {
    expect(expectSingleOffense('git show "origin/develop:a/b').argument).toBe(
      'origin/develop:a/b',
    );
  });

  it('abstains on an operator it cannot model', () => {
    expect(findMsysArgvOffenses('(git show origin/develop:a/b)')).toMatchObject(
      { kind: 'unreadable' },
    );
  });

  it('abstains on a heredoc rather than reading its body as argv', () => {
    expect(
      findMsysArgvOffenses('cat <<EOF\ngit show origin/develop:.claude/x\nEOF'),
    ).toMatchObject({ kind: 'unreadable' });
  });

  it('abstains on a truncated global option', () => {
    expect(expectOffenses('git -C')).toEqual([]);
  });

  it('reports a tokenizer throw rather than crashing the hook', () => {
    expect(findMsysArgvOffenses('git show ${')).toEqual({
      kind: 'unreadable',
      reason: 'unparseable-shell',
    });
  });

  it('has no opinion on a git command that never reaches a verb', () => {
    expect(expectOffenses('git --version')).toEqual([]);
  });

  /**
   * `#` swallows the rest of the line, so `shell-quote` hands back a
   * `{comment:…}` object in binary position — a segment whose command is
   * unknowable, and therefore not one to have an opinion about.
   */
  it('has no opinion when a comment stands in binary position', () => {
    expect(expectOffenses('# git show origin/develop:.claude/x')).toEqual([]);
  });

  it('has no opinion on an unmodelled wrapper prefix, silently', () => {
    expect(
      expectOffenses('script -c "git show origin/develop:a/b" out.log'),
    ).toEqual([]);
  });
});
