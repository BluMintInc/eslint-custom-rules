import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';

/**
 * The release workflow can fail *silently*: semantic-release declines with
 * "The local branch main is behind the remote one, therefore a new version
 * won't be published" and the job still **exits 0**. The run shows a green
 * check while nothing ships, so no gate and no human notices.
 *
 * That state is reachable whenever a run executes against a sha that
 * `origin/main` has already passed — which happens routinely when Actions
 * delays run creation (#1822 stranded the fixes for #1814 and #1816 behind
 * v1.20.125 for hours this way, across two green runs).
 *
 * `ref` on the checkout is what forecloses it: the run releases the branch
 * tip rather than the sha that triggered it. This guard exists because the
 * defect it prevents is invisible in CI — the suite is the only place that
 * can see the workflow is mis-shaped.
 */

const RELEASE_WORKFLOW = join(
  __dirname,
  '../../.github/workflows/semantic-release.yml',
);

type Step = { uses?: string; with?: Record<string, unknown> };
type Workflow = {
  on?: Record<string, unknown>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, { steps?: Step[] }>;
};

function parse(source: string): Workflow {
  return load(source) as Workflow;
}

/**
 * YAML 1.1 resolves a bare `on` key to boolean `true`. js-yaml's default
 * schema keeps it a string, but reading both keeps the guard from silently
 * finding no triggers (and asserting nothing) if that resolution ever changes.
 */
function triggersOf(workflow: Workflow): Record<string, unknown> {
  const asBooleanKey = (workflow as Record<string, unknown>)[
    true as unknown as string
  ];
  return (workflow.on ?? asBooleanKey ?? {}) as Record<string, unknown>;
}

function releaseBranchesOf(workflow: Workflow): string[] {
  const push = triggersOf(workflow).push as { branches?: string[] } | undefined;
  return push?.branches ?? [];
}

function checkoutStepsOf(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).filter((step) =>
      step.uses?.startsWith('actions/checkout'),
    ),
  );
}

/**
 * The defect predicate: a checkout that does not pin `ref` to a branch the
 * workflow releases from inherits the triggering sha, which is what goes
 * stale.
 */
function unpinnedCheckouts(workflow: Workflow): Step[] {
  const branches = releaseBranchesOf(workflow);
  return checkoutStepsOf(workflow).filter(
    (step) => !branches.includes(String(step.with?.ref ?? '')),
  );
}

const source = readFileSync(RELEASE_WORKFLOW, 'utf8');
const workflow = parse(source);

/** The shape shipped before #1822 — checkout with no `ref`. */
const PRE_FIX_WORKFLOW = `
name: Release
on:
  push:
    branches:
      - main
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Release
        run: npx semantic-release
`;

describe('release workflow cannot strand a publish', () => {
  it('parses a workflow that actually declares a release (non-vacuity)', () => {
    // Without these floors a renamed path or a parse quirk would empty every
    // collection below and the assertions would pass while proving nothing.
    expect(Object.keys(workflow.jobs ?? {}).length).toBeGreaterThan(0);
    expect(checkoutStepsOf(workflow).length).toBeGreaterThan(0);
    expect(releaseBranchesOf(workflow)).toContain('main');
  });

  it('pins every checkout to a release branch, not the triggering sha', () => {
    const offenders = unpinnedCheckouts(workflow);
    const detail = offenders
      .map((s) => `  ${s.uses} (ref: ${String(s.with?.ref ?? '<unset>')})`)
      .join('\n');
    expect(
      offenders.length === 0
        ? ''
        : `${offenders.length} checkout step(s) do not pin "ref" to a release branch ` +
            `(${releaseBranchesOf(workflow).join(', ')}):\n${detail}\n` +
            '  A run created after a later push would check out a stale sha, and ' +
            'semantic-release would decline with "the local branch is behind the ' +
            'remote one" while still exiting 0 — a green run that publishes nothing.',
    ).toBe('');
  });

  it('keeps workflow_dispatch as the manual recovery lever', () => {
    // A stranded release cannot be recovered by re-pushing: main is already at
    // the target commit, so the push is a no-op and fires no event.
    expect(Object.keys(triggersOf(workflow))).toContain('workflow_dispatch');
  });

  it('serializes releases so tip-checkout cannot double-publish', () => {
    expect(typeof workflow.concurrency?.group).toBe('string');
    expect(workflow.concurrency?.group).toBeTruthy();
    // Cancelling mid-publish could abort between the npm publish and the
    // chore(release) commit pushed back to main.
    expect(workflow.concurrency?.['cancel-in-progress']).not.toBe(true);
  });

  it('detects the stranding shape it is meant to catch (positive control)', () => {
    const preFix = parse(PRE_FIX_WORKFLOW);
    expect(checkoutStepsOf(preFix).length).toBe(1);
    expect(unpinnedCheckouts(preFix).length).toBe(1);
  });

  it('does not flag the shipped workflow (negative control)', () => {
    expect(unpinnedCheckouts(workflow).length).toBe(0);
  });
});
