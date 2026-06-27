import {
  ALLOWED_NON_RULE_SCOPES,
  buildRange,
  findInvalidScopeCommits,
  gitCommits,
  parseArgs,
} from './validate-commit-scopes';

const RULES = ['extract-global-constants', 'no-margin-properties'];

describe('findInvalidScopeCommits', () => {
  it('accepts fix/feat commits scoped to a real rule', () => {
    expect(
      findInvalidScopeCommits(
        [
          { hash: 'a', subject: 'fix(extract-global-constants): x' },
          { hash: 'b', subject: 'feat(no-margin-properties): y' },
        ],
        RULES,
      ),
    ).toEqual([]);
  });

  it('flags a fix/feat scope that is not a rule name', () => {
    const violations = findInvalidScopeCommits(
      [{ hash: 'c', subject: 'fix(not-a-rule): oops' }],
      RULES,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain("'not-a-rule'");
  });

  it('flags a fix/feat commit missing a scope', () => {
    const violations = findInvalidScopeCommits(
      [{ hash: 'd', subject: 'fix: no scope here' }],
      RULES,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('must declare a scope');
  });

  it('ignores non-release types (chore/docs/etc.)', () => {
    expect(
      findInvalidScopeCommits(
        [
          { hash: 'e', subject: 'chore(whatever): noise' },
          { hash: 'f', subject: 'docs: stuff' },
          { hash: 'g', subject: 'refactor(anything): tidy' },
        ],
        RULES,
      ),
    ).toEqual([]);
  });

  it('ignores non-conventional subjects (commitlint type-enum handles them)', () => {
    expect(
      findInvalidScopeCommits([{ hash: 'h', subject: 'merged stuff' }], RULES),
    ).toEqual([]);
  });

  it('permits cross-cutting allowlisted scopes', () => {
    expect(
      findInvalidScopeCommits(
        [{ hash: 'i', subject: `fix(${ALLOWED_NON_RULE_SCOPES[0]}): bump dep` }],
        RULES,
      ),
    ).toEqual([]);
  });
});

describe('buildRange', () => {
  it('honors an explicit --range', () => {
    expect(buildRange({ range: 'origin/main..HEAD' }, {})).toBe(
      'origin/main..HEAD',
    );
  });

  it('uses --base when provided', () => {
    expect(buildRange({ base: 'origin/develop' }, {})).toBe(
      'origin/develop..HEAD',
    );
  });

  it('falls back to GITHUB_BASE_REF', () => {
    expect(buildRange({}, { GITHUB_BASE_REF: 'develop' })).toBe(
      'develop..HEAD',
    );
  });

  it('defaults to origin/develop when nothing supplied', () => {
    expect(buildRange({}, {})).toBe('origin/develop..HEAD');
  });
});

describe('parseArgs', () => {
  it('parses equals-form flags', () => {
    expect(parseArgs(['--base=origin/develop', '--range=a..b'])).toEqual({
      base: 'origin/develop',
      range: 'a..b',
    });
  });
});

describe('gitCommits', () => {
  it('parses NUL/RS-delimited git log output', () => {
    const fakeExec = (() =>
      [`h1\x1ffix(no-margin-properties): a\x1fbody`].join(
        '\x1e',
      )) as unknown as typeof import('node:child_process').execFileSync;
    const commits = gitCommits('origin/develop..HEAD', fakeExec);
    expect(commits).toEqual([
      { hash: 'h1', subject: 'fix(no-margin-properties): a', body: 'body' },
    ]);
  });
});
