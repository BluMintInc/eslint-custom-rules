import { isInsideWorkspace, workspaceRootOf } from './change-log';

/**
 * The change log feeds the stop hook's lint set, so an entry outside the
 * workspace is not merely noise: linting it resolves whatever ESLint config sits
 * above it, and a stray `/tmp/.eslintrc.js` from an unrelated run aborts the
 * entire lint on a plugin that was never installed there. Such entries also
 * outlive their files — worktrees from months-old issues accumulated in the log
 * long after deletion.
 *
 * `track-changes.ts` guards its entry point with `import.meta.url`, which jest
 * cannot parse under the CJS transform; that is why the module had no test. The
 * decision logic lives in `change-log.ts` so it is reachable from here.
 */

describe('isInsideWorkspace', () => {
  it('accepts a workspace file and rejects a scratch path (control)', () => {
    expect(isInsideWorkspace('/repo/src/rules/a.ts', '/repo')).toBe(true);
    expect(isInsideWorkspace('/repo', '/repo')).toBe(true);
    expect(isInsideWorkspace('/tmp/probe.js', '/repo')).toBe(false);
  });

  it('rejects a sibling worktree, the shape that filled the log', () => {
    expect(
      isInsideWorkspace('/home/joe/eslint-wt-1407/src/x.ts', '/repo'),
    ).toBe(false);
  });

  it('does not treat a sibling sharing a name prefix as inside', () => {
    // `/repo-scratch` starts with `/repo`; only a separator boundary counts.
    expect(isInsideWorkspace('/repo-scratch/x.ts', '/repo')).toBe(false);
  });

  it('rejects a path that escapes the workspace via ..', () => {
    expect(isInsideWorkspace('/repo/../tmp/x.ts', '/repo')).toBe(false);
  });

  it('resolves a relative path against the workspace', () => {
    expect(isInsideWorkspace('src/rules/a.ts', '/repo')).toBe(true);
    expect(isInsideWorkspace('../tmp/a.ts', '/repo')).toBe(false);
  });
});

describe('workspaceRootOf', () => {
  it('recovers the workspace from the log path', () => {
    expect(
      workspaceRootOf('/repo/.claude/tmp/hooks/agent-change-log.json'),
    ).toBe('/repo');
  });

  it('falls back to the process cwd when the marker is absent', () => {
    expect(workspaceRootOf('/somewhere/else.json')).toBe(process.cwd());
  });
});
