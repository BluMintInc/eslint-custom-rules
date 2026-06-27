import {
  extractIssues,
  parseCommit,
  buildRuleEntries,
  buildManifestEntry,
  mergeManifest,
  parseArgs,
  gitCommits,
} from './generate-release-manifest';

const RULE_NAMES = [
  'extract-global-constants',
  'consistent-callback-naming',
  'no-margin-properties',
];

describe('extractIssues', () => {
  it('prefers closing-keyword references', () => {
    expect(
      extractIssues('fix(x): thing (closes #12)\n\nAlso touches #999'),
    ).toEqual([12]);
  });

  it('supports fixes/resolves/closed verbs and dedups + sorts', () => {
    expect(
      extractIssues('fixes #5, resolves #3 and closes #5'),
    ).toEqual([3, 5]);
  });

  it('falls back to bare references when no closing verb present', () => {
    expect(extractIssues('relates to #7 and #2')).toEqual([2, 7]);
  });

  it('returns empty when no references', () => {
    expect(extractIssues('no refs here')).toEqual([]);
  });
});

describe('parseCommit', () => {
  it('parses type, scope, summary, and issues', () => {
    expect(
      parseCommit('fix(extract-global-constants): handle IIFE (closes #123)'),
    ).toEqual({
      type: 'fix',
      scope: 'extract-global-constants',
      summary: 'handle IIFE (closes #123)',
      issues: [123],
    });
  });

  it('parses a breaking-change marker without breaking', () => {
    const parsed = parseCommit('feat(no-margin-properties)!: rework');
    expect(parsed?.type).toBe('feat');
    expect(parsed?.scope).toBe('no-margin-properties');
  });

  it('returns null scope when none present', () => {
    expect(parseCommit('chore: release 1.2.3')?.scope).toBeNull();
  });

  it('returns null for non-conventional subjects', () => {
    expect(parseCommit('just some text')).toBeNull();
  });
});

describe('buildRuleEntries', () => {
  it('keeps only fix/feat commits with a real rule scope', () => {
    const entries = buildRuleEntries(
      [
        { subject: 'fix(extract-global-constants): a (closes #1)' },
        { subject: 'chore(extract-global-constants): noise' },
        { subject: 'fix(not-a-rule): ignored' },
        { subject: 'docs: nothing' },
      ],
      RULE_NAMES,
    );
    expect(entries).toEqual([
      {
        name: 'extract-global-constants',
        changeType: 'fix',
        issues: [1],
        summary: 'a (closes #1)',
      },
    ]);
  });

  it('groups multiple commits per rule, feat dominates, unions issues', () => {
    const entries = buildRuleEntries(
      [
        { subject: 'fix(no-margin-properties): a (closes #10)' },
        { subject: 'feat(no-margin-properties): b (closes #11)' },
      ],
      RULE_NAMES,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'no-margin-properties',
      changeType: 'feat',
      issues: [10, 11],
    });
    expect(entries[0].summary).toContain('a (closes #10)');
    expect(entries[0].summary).toContain('b (closes #11)');
  });

  it('sorts rule entries by name', () => {
    const entries = buildRuleEntries(
      [
        { subject: 'fix(no-margin-properties): z (closes #1)' },
        { subject: 'fix(consistent-callback-naming): a (closes #2)' },
      ],
      RULE_NAMES,
    );
    expect(entries.map((e) => e.name)).toEqual([
      'consistent-callback-naming',
      'no-margin-properties',
    ]);
  });
});

describe('buildManifestEntry', () => {
  it('produces the {version,date,rules} shape', () => {
    const entry = buildManifestEntry({
      version: '1.16.0',
      date: '2026-06-26T00:00:00.000Z',
      commits: [{ subject: 'fix(no-margin-properties): a (closes #9)' }],
      ruleNames: RULE_NAMES,
    });
    expect(entry).toEqual({
      version: '1.16.0',
      date: '2026-06-26T00:00:00.000Z',
      rules: [
        {
          name: 'no-margin-properties',
          changeType: 'fix',
          issues: [9],
          summary: 'a (closes #9)',
        },
      ],
    });
  });
});

describe('mergeManifest', () => {
  const base = {
    version: '1.15.0',
    date: 'd',
    rules: [],
  };

  it('prepends a new entry (newest-first)', () => {
    const next = { version: '1.16.0', date: 'd2', rules: [] };
    expect(mergeManifest([base], next).map((e) => e.version)).toEqual([
      '1.16.0',
      '1.15.0',
    ]);
  });

  it('replaces an existing entry for the same version', () => {
    const replacement = {
      version: '1.15.0',
      date: 'd2',
      rules: [
        { name: 'no-margin-properties', changeType: 'fix', issues: [], summary: 's' },
      ],
    };
    const merged = mergeManifest([base], replacement);
    expect(merged).toHaveLength(1);
    expect(merged[0].rules).toHaveLength(1);
  });

  it('tolerates a non-array existing manifest', () => {
    const next = { version: '1.0.0', date: 'd', rules: [] };
    expect(mergeManifest(undefined, next)).toEqual([next]);
  });
});

describe('parseArgs', () => {
  it('parses equals-form flags and empty prev-tag', () => {
    expect(
      parseArgs(['--version=1.16.0', '--git-tag=v1.16.0', '--prev-tag=']),
    ).toEqual({ version: '1.16.0', gitTag: 'v1.16.0', prevTag: '' });
  });
});

describe('gitCommits', () => {
  it('builds a prevTag..HEAD range and parses NUL/RS-delimited output', () => {
    const calls: string[][] = [];
    const fakeExec = (_cmd: string, args: string[]) => {
      calls.push(args);
      return [
        `abc\x1ffix(no-margin-properties): a (closes #1)\x1fbody one`,
        `def\x1ffeat(consistent-callback-naming): b\x1f`,
      ].join('\x1e');
    };
    const commits = gitCommits('v1.15.0', fakeExec);
    expect(calls[0]).toContain('v1.15.0..HEAD');
    expect(commits).toEqual([
      {
        hash: 'abc',
        subject: 'fix(no-margin-properties): a (closes #1)',
        body: 'body one',
      },
      {
        hash: 'def',
        subject: 'feat(consistent-callback-naming): b',
        body: '',
      },
    ]);
  });

  it('uses HEAD (all history) when prevTag is empty', () => {
    const calls: string[][] = [];
    const fakeExec = (_cmd: string, args: string[]) => {
      calls.push(args);
      return '';
    };
    gitCommits('', fakeExec);
    expect(calls[0]).toContain('HEAD');
    expect(calls[0]).not.toContain('..HEAD');
  });
});
