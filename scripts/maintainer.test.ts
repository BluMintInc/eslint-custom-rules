import {
  branchNameFor,
  chooseAgent,
  classifyIssue,
  filterActionable,
  isDeferred,
  isLintablePath,
  isQueueEmpty,
  isRuleImplPath,
  maintainerGitEnv,
  mergeAndClose,
  normalizeIssues,
  parseMergeArgs,
  parseVersionArg,
  releaseIfEmpty,
  ruleScopeFromDiff,
  selectNextIssue,
  sortIssues,
  validateViaStopHooks,
  type ChangedFile,
  type Issue,
} from './maintainer';

const issue = (
  number: number,
  labels: string[],
  createdAt: string,
  title = `Issue ${number}`,
): Issue => ({ number, title, labels, createdAt });

describe('classifyIssue', () => {
  it('treats a bug label as a bug', () => {
    expect(classifyIssue(issue(1, ['bug'], 'x'))).toBe('bug');
  });
  it('treats rule-request as a feature', () => {
    expect(classifyIssue(issue(1, ['rule-request'], 'x'))).toBe('rule-request');
  });
  it('treats anything else as other', () => {
    expect(classifyIssue(issue(1, ['enhancement'], 'x'))).toBe('other');
  });
  it('prefers bug when both labels present', () => {
    expect(classifyIssue(issue(1, ['rule-request', 'bug'], 'x'))).toBe('bug');
  });
});

describe('chooseAgent + branchNameFor', () => {
  it('routes rule-request to implement-rule', () => {
    expect(chooseAgent('rule-request')).toBe('implement-rule');
    expect(branchNameFor('implement-rule', 42)).toBe(
      'develop-implement-rule-42',
    );
  });
  it('routes bug and other to fix-bug', () => {
    expect(chooseAgent('bug')).toBe('fix-bug');
    expect(chooseAgent('other')).toBe('fix-bug');
    expect(branchNameFor('fix-bug', 7)).toBe('develop-fix-bug-7');
  });
});

describe('sortIssues / selectNextIssue', () => {
  it('orders bugs before features, oldest first within a bucket', () => {
    const issues = [
      issue(10, ['rule-request'], '2026-01-01T00:00:00Z'),
      issue(11, ['bug'], '2026-02-01T00:00:00Z'),
      issue(12, ['bug'], '2026-01-15T00:00:00Z'),
      issue(13, ['enhancement'], '2025-12-01T00:00:00Z'),
    ];
    /** bugs first (oldest: 12 then 11), then features/other oldest-first (13 < 10). */
    expect(sortIssues(issues).map((i) => i.number)).toEqual([12, 11, 13, 10]);
  });

  it('breaks ties on createdAt by issue number', () => {
    const issues = [
      issue(20, ['bug'], '2026-01-01T00:00:00Z'),
      issue(19, ['bug'], '2026-01-01T00:00:00Z'),
    ];
    expect(sortIssues(issues).map((i) => i.number)).toEqual([19, 20]);
  });

  it('selects the highest-priority oldest bug with its agent + branch', () => {
    const next = selectNextIssue([
      issue(10, ['rule-request'], '2026-01-01T00:00:00Z'),
      issue(11, ['bug'], '2026-02-01T00:00:00Z'),
    ]);
    expect(next).toEqual({
      number: 11,
      title: 'Issue 11',
      kind: 'bug',
      agent: 'fix-bug',
      branch: 'develop-fix-bug-11',
    });
  });

  it('returns null on an empty queue', () => {
    expect(selectNextIssue([])).toBeNull();
    expect(isQueueEmpty([])).toBe(true);
  });
});

describe('isDeferred / filterActionable', () => {
  it('treats an issue labeled human as deferred', () => {
    expect(isDeferred(issue(1, ['rule-request', 'human'], 'x'))).toBe(true);
    expect(isDeferred(issue(2, ['rule-request'], 'x'))).toBe(false);
    expect(isDeferred(issue(3, ['bug'], 'x'))).toBe(false);
  });

  it('drops human-labeled issues from the actionable queue', () => {
    const issues = [
      issue(10, ['rule-request'], 'a'),
      issue(11, ['rule-request', 'human'], 'b'),
      issue(12, ['bug'], 'c'),
    ];
    expect(filterActionable(issues).map((i) => i.number)).toEqual([10, 12]);
  });

  it('a queue of only deferred issues filters to empty (release can fire)', () => {
    const issues = [
      issue(20, ['rule-request', 'human'], 'a'),
      issue(21, ['enhancement', 'human'], 'b'),
    ];
    const actionable = filterActionable(issues);
    expect(actionable).toEqual([]);
    expect(isQueueEmpty(actionable)).toBe(true);
  });
});

describe('normalizeIssues', () => {
  it('flattens gh label objects to names', () => {
    expect(
      normalizeIssues([
        {
          number: 5,
          title: 'T',
          labels: [{ name: 'bug' }, { name: 'priority-high' }],
          createdAt: 'd',
        },
      ]),
    ).toEqual([
      {
        number: 5,
        title: 'T',
        labels: ['bug', 'priority-high'],
        createdAt: 'd',
      },
    ]);
  });

  it('tolerates a missing labels array', () => {
    expect(
      normalizeIssues([{ number: 6, title: 'T', createdAt: 'd' }]),
    ).toEqual([{ number: 6, title: 'T', labels: [], createdAt: 'd' }]);
  });
});

describe('isLintablePath', () => {
  it('accepts source ts/tsx/js/jsx files', () => {
    expect(isLintablePath('src/rules/foo.ts')).toBe(true);
    expect(isLintablePath('src/util/bar.tsx')).toBe(true);
    expect(isLintablePath('scripts/baz.js')).toBe(true);
  });

  it('excludes tests, .github/, node_modules/, .claude/tmp/, and non-source', () => {
    expect(isLintablePath('src/rules/foo.test.ts')).toBe(false);
    expect(isLintablePath('src/rules/foo.spec.tsx')).toBe(false);
    expect(isLintablePath('.github/scripts/x.ts')).toBe(false);
    expect(isLintablePath('node_modules/pkg/index.ts')).toBe(false);
    expect(isLintablePath('src/.claude/tmp/scratch.ts')).toBe(false);
    expect(isLintablePath('docs/rules/foo.md')).toBe(false);
  });

  it('does NOT skip a source file whose name merely contains "node_modules"', () => {
    expect(isLintablePath('src/util/node_modules_shim.ts')).toBe(true);
  });
});

describe('validateViaStopHooks', () => {
  it('runs build → eslint on changed files → jest scoped to related tests, returning true when all pass', () => {
    const calls: string[] = [];
    const ok = validateViaStopHooks(
      (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`),
      () => ['src/rules/foo.ts', 'src/util/bar.ts'],
      () => ['src/rules/foo.ts', 'src/tests/foo.test.ts'],
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([
      'npm run build',
      'npx eslint src/rules/foo.ts src/util/bar.ts',
      'npx jest --findRelatedTests src/rules/foo.ts src/tests/foo.test.ts --passWithNoTests',
    ]);
  });

  it('skips the lint step when no source files changed but still runs related tests', () => {
    const calls: string[] = [];
    const ok = validateViaStopHooks(
      (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`),
      () => [],
      () => ['src/tests/foo.test.ts'],
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([
      'npm run build',
      'npx jest --findRelatedTests src/tests/foo.test.ts --passWithNoTests',
    ]);
  });

  it('skips the test step when no TypeScript files changed', () => {
    const calls: string[] = [];
    const ok = validateViaStopHooks(
      (cmd, args) => calls.push(`${cmd} ${args.join(' ')}`),
      () => [],
      () => [],
    );
    expect(ok).toBe(true);
    expect(calls).toEqual(['npm run build']);
  });

  it('returns false and stops at the first failing step', () => {
    const calls: string[] = [];
    const ok = validateViaStopHooks(
      (cmd, args) => {
        calls.push(`${cmd} ${args.join(' ')}`);
        if (args.includes('eslint')) {
          throw new Error('lint failed');
        }
      },
      () => ['src/rules/foo.ts'],
      () => ['src/rules/foo.ts'],
    );
    expect(ok).toBe(false);
    expect(calls).toEqual(['npm run build', 'npx eslint src/rules/foo.ts']);
  });
});

describe('mergeAndClose', () => {
  it('checks out develop, no-ff merges with a closes-#n message, pushes', () => {
    const calls: string[][] = [];
    mergeAndClose({ issue: 99, branch: 'develop-fix-bug-99' }, (cmd, args) =>
      calls.push([cmd, ...args]),
    );
    expect(calls).toEqual([
      ['git', 'checkout', 'develop'],
      [
        'git',
        'merge',
        '--no-ff',
        'develop-fix-bug-99',
        '-m',
        'chore(repo): merge develop-fix-bug-99 (closes #99)',
      ],
      ['git', 'push', 'origin', 'develop'],
    ]);
  });

  it('performs no git actions in dry-run', () => {
    const calls: string[][] = [];
    mergeAndClose(
      { issue: 99, branch: 'develop-fix-bug-99', dryRun: true },
      (cmd, args) => calls.push([cmd, ...args]),
    );
    expect(calls).toEqual([]);
  });
});

describe('maintainerGitEnv', () => {
  it('disables husky hooks so package-change hooks cannot dirty the tree mid-merge', () => {
    expect(maintainerGitEnv({ PATH: '/usr/bin' }).HUSKY).toBe('0');
  });

  it('preserves the rest of the base environment', () => {
    const env = maintainerGitEnv({ PATH: '/usr/bin', HOME: '/home/ci' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/ci');
  });

  it('overrides a pre-existing HUSKY value in the base environment', () => {
    expect(maintainerGitEnv({ HUSKY: '1' }).HUSKY).toBe('0');
  });

  it('does not mutate the base environment object', () => {
    const base: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
    maintainerGitEnv(base);
    expect(base.HUSKY).toBeUndefined();
  });
});

describe('parseMergeArgs', () => {
  it('accepts a numeric --issue and a string --branch', () => {
    expect(
      parseMergeArgs({ issue: '42', branch: 'develop-fix-bug-42' }),
    ).toEqual({ issue: 42, branch: 'develop-fix-bug-42' });
  });

  it('rejects a bare --issue (parsed to true ⇒ would coerce to 1)', () => {
    expect(parseMergeArgs({ issue: true, branch: 'b' })).toBeNull();
  });

  it('rejects a bare --branch (parsed to true ⇒ would stringify to "true")', () => {
    expect(parseMergeArgs({ issue: '1', branch: true })).toBeNull();
  });

  it('rejects a non-positive or non-integer issue', () => {
    expect(parseMergeArgs({ issue: '0', branch: 'b' })).toBeNull();
    expect(parseMergeArgs({ issue: '-3', branch: 'b' })).toBeNull();
    expect(parseMergeArgs({ issue: '1.5', branch: 'b' })).toBeNull();
    expect(parseMergeArgs({ issue: 'x', branch: 'b' })).toBeNull();
  });

  it('rejects missing flags', () => {
    expect(parseMergeArgs({})).toBeNull();
  });
});

describe('parseVersionArg', () => {
  it('returns a string --version', () => {
    expect(parseVersionArg({ version: '1.16.0' })).toBe('1.16.0');
  });

  it('rejects a bare --version (parsed to true) and a missing one', () => {
    expect(parseVersionArg({ version: true })).toBeNull();
    expect(parseVersionArg({ version: '' })).toBeNull();
    expect(parseVersionArg({})).toBeNull();
  });
});

describe('releaseIfEmpty', () => {
  it('back-merges origin/main into develop, then promotes develop→main when the queue is empty', () => {
    const calls: string[][] = [];
    const released = releaseIfEmpty([], {}, (cmd, args) =>
      calls.push([cmd, ...args]),
    );
    expect(released).toBe(true);
    expect(calls).toEqual([
      ['git', 'fetch', 'origin', 'main'],
      ['git', 'checkout', 'develop'],
      ['git', 'merge', '--no-edit', 'origin/main'],
      ['git', 'push', 'origin', 'develop'],
      ['git', 'checkout', 'main'],
      ['git', 'merge', '--ff-only', 'origin/main'],
      ['git', 'merge', '--ff-only', 'develop'],
      ['git', 'push', 'origin', 'main'],
    ]);
  });

  it('does nothing when issues remain', () => {
    const calls: string[][] = [];
    const released = releaseIfEmpty([issue(1, ['bug'], 'd')], {}, (cmd, args) =>
      calls.push([cmd, ...args]),
    );
    expect(released).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('isRuleImplPath', () => {
  it('accepts a kebab-case rule implementation file', () => {
    expect(isRuleImplPath('src/rules/no-stablehash-react-nodes.ts')).toBe(true);
    expect(isRuleImplPath('src/rules/require-memo.ts')).toBe(true);
  });

  it('rejects tests, docs, declaration files, and non-rule sources', () => {
    expect(isRuleImplPath('src/tests/require-memo.test.ts')).toBe(false);
    expect(isRuleImplPath('src/rules/require-memo.d.ts')).toBe(false);
    expect(isRuleImplPath('docs/rules/require-memo.md')).toBe(false);
    expect(isRuleImplPath('src/index.ts')).toBe(false);
    expect(isRuleImplPath('src/utils/ASTHelpers.ts')).toBe(false);
    expect(isRuleImplPath('src/rules/nested/foo.ts')).toBe(false);
  });
});

describe('ruleScopeFromDiff', () => {
  const diff = (entries: ChangedFile[]) => (): ChangedFile[] => entries;
  const known = (names: string[]) => (): string[] => names;

  it('maps a newly added rule file to feat, ignoring its sibling files', () => {
    const scope = ruleScopeFromDiff(
      diff([
        { status: 'A', file: 'src/rules/no-foo.ts' },
        { status: 'A', file: 'src/tests/no-foo.test.ts' },
        { status: 'A', file: 'docs/rules/no-foo.md' },
        { status: 'M', file: 'src/index.ts' },
        { status: 'M', file: 'README.md' },
      ]),
      known(['no-foo']),
    );
    expect(scope).toEqual({ rule: 'no-foo', changeType: 'feat' });
  });

  it('maps a modified rule file to fix', () => {
    const scope = ruleScopeFromDiff(
      diff([
        { status: 'M', file: 'src/rules/require-memo.ts' },
        { status: 'M', file: 'src/tests/require-memo.test.ts' },
      ]),
      known(['require-memo']),
    );
    expect(scope).toEqual({ rule: 'require-memo', changeType: 'fix' });
  });

  it('throws when no rule file changed', () => {
    expect(() =>
      ruleScopeFromDiff(
        diff([{ status: 'M', file: 'src/utils/ASTHelpers.ts' }]),
        known(['require-memo']),
      ),
    ).toThrow(/no src\/rules\/\*\.ts file changed/);
  });

  it('throws when more than one rule file changed (one rule per commit)', () => {
    expect(() =>
      ruleScopeFromDiff(
        diff([
          { status: 'M', file: 'src/rules/no-foo.ts' },
          { status: 'M', file: 'src/rules/no-bar.ts' },
        ]),
        known(['no-foo', 'no-bar']),
      ),
    ).toThrow(/one rule per commit/);
  });

  it('throws when the derived rule is not registered in the rules map', () => {
    expect(() =>
      ruleScopeFromDiff(
        diff([{ status: 'A', file: 'src/rules/no-foo.ts' }]),
        known(['require-memo']),
      ),
    ).toThrow(/not registered in src\/index\.ts/);
  });

  it('throws on an unexpected git status for the rule file', () => {
    expect(() =>
      ruleScopeFromDiff(
        diff([{ status: 'D', file: 'src/rules/no-foo.ts' }]),
        known(['no-foo']),
      ),
    ).toThrow(/unexpected git status/);
  });
});
