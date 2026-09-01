import { existsSync, readFileSync } from 'fs';
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
 * Context expressions whose value differs between two runs of the same branch.
 * `github.ref`/`github.workflow` are deliberately absent: they are constant
 * across the concurrent runs a release mutex must exclude, so interpolating
 * them still yields a shared bucket.
 */
const PER_RUN_CONTEXTS = [
  'github.sha',
  'github.run_id',
  'github.run_number',
  'github.run_attempt',
  'github.event.head_commit.id',
  'github.event.after',
];

/** The per-run contexts a `concurrency.group` expression interpolates. */
function perRunContexts(group: string | undefined): string[] {
  if (!group) return [];
  return PER_RUN_CONTEXTS.filter((ctx) =>
    new RegExp(`\\$\\{\\{[^}]*\\b${ctx.replace(/\./g, '\\.')}\\b`).test(group),
  );
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
    // A group is only a mutex if concurrent runs land in the SAME bucket. Any
    // per-run context in the expression gives every run its own group, which
    // satisfies a truthiness check while serializing nothing — the exact shape
    // this guard exists to forbid, since two runs both checking out the branch
    // tip would publish twice.
    expect(perRunContexts(workflow.concurrency?.group)).toEqual([]);
    // Cancelling mid-publish could abort between the npm publish and the
    // chore(release) commit pushed back to main.
    expect(workflow.concurrency?.['cancel-in-progress']).not.toBe(true);
  });

  it('detects a per-run concurrency group (positive control)', () => {
    expect(perRunContexts('release-${{ github.sha }}')).toEqual(['github.sha']);
    expect(perRunContexts('release-${{ github.run_id }}')).toEqual([
      'github.run_id',
    ]);
    expect(perRunContexts('release-main')).toEqual([]);
    expect(perRunContexts('release-${{ github.ref }}')).toEqual([]);
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

/**
 * `release-manifest.json` is the contract agora reads to re-enable rules
 * (`sync-eslint-rules.ts` consumes each entry's `rules[].name` verbatim), and
 * the whole pipeline that produces it lives in `.releaserc.json` — a JSON file
 * no compiler, linter or type checker looks at. The prepareCmd names three
 * flags by string; `parseArgs` reads three keys by string; nothing connects
 * them. Rename either side and `parseArgs` silently yields `prevTag: ''`,
 * which selects the all-history range and names most of the plugin's rules in
 * a single release entry (measured: 3,505 commits / 181 of 194 rules).
 */
const RELEASERC = join(__dirname, '../../.releaserc.json');
const MANIFEST_SCRIPT = 'scripts/generate-release-manifest.js';
const DISPATCH_SCRIPT = 'scripts/dispatch-agora-release.js';
const MANIFEST_ASSET = 'release-manifest.json';

type ReleaseConfig = {
  plugins?: (string | [string, Record<string, unknown>])[];
};

const releaseConfig: ReleaseConfig = JSON.parse(
  readFileSync(RELEASERC, 'utf8'),
);

function pluginConfig(
  config: ReleaseConfig,
  id: string,
): Record<string, unknown> | undefined {
  for (const plugin of config.plugins ?? []) {
    if (Array.isArray(plugin) && plugin[0] === id) {
      return (plugin[1] ?? {}) as Record<string, unknown>;
    }
  }
  return undefined;
}

/** The `&&`-joined segment of a shell command that invokes `script`. */
function segmentFor(command: string, script: string): string {
  return (
    command
      .split('&&')
      .map((part) => part.trim())
      .find((part) => part.includes(script)) ?? ''
  );
}

/** The `--flag` names a command segment passes. */
function flagsPassed(segment: string): string[] {
  return [...segment.matchAll(/--([\w-]+)=/g)].map((match) => match[1]).sort();
}

/**
 * The `args[...]` keys a script's `parseArgs` reads. Extracted from source
 * rather than by calling it: the defect is a NAME mismatch, and a call would
 * happily return the same three-field shape whatever names it read.
 */
function argKeysRead(source: string): string[] {
  const start = source.indexOf('function parseArgs(');
  const end = source.indexOf('\n}', start);
  const body = source.slice(start, end);
  const keys = new Set<string>();
  for (const match of body.matchAll(/args\.([A-Za-z_$][\w$]*)/g)) {
    keys.add(match[1]);
  }
  for (const match of body.matchAll(/args\[['"]([^'"]+)['"]\]/g)) {
    keys.add(match[1]);
  }
  return [...keys].sort();
}

/** Kebab-case is the flag spelling; `parseArgs` may store either form. */
function normalizeKey(key: string): string {
  return key.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`);
}

const execPlugin = pluginConfig(releaseConfig, '@semantic-release/exec') ?? {};
const gitPlugin = pluginConfig(releaseConfig, '@semantic-release/git') ?? {};
const prepareCmd = String(execPlugin.prepareCmd ?? '');
const successCmd = String(execPlugin.successCmd ?? '');
const gitAssets = (gitPlugin.assets ?? []) as string[];
const manifestSource = readFileSync(
  join(__dirname, '../..', MANIFEST_SCRIPT),
  'utf8',
);

describe('release manifest wiring cannot silently drift', () => {
  it('parses a config that declares the manifest pipeline (non-vacuity)', () => {
    expect(releaseConfig.plugins?.length).toBeGreaterThan(5); // measured 7
    expect(prepareCmd).toContain(MANIFEST_SCRIPT);
    expect(successCmd).toContain(DISPATCH_SCRIPT);
    expect(gitAssets.length).toBeGreaterThan(3); // measured 5
  });

  it('binds every prepareCmd flag to a key parseArgs reads, and back', () => {
    const passed = flagsPassed(segmentFor(prepareCmd, MANIFEST_SCRIPT));
    const read = argKeysRead(manifestSource).map(normalizeKey).sort();

    expect(passed.length).toBeGreaterThan(2); // measured 3
    expect(passed).toEqual(read);
  });

  it('commits the generated manifest via the git assets list', () => {
    expect(gitAssets).toContain(MANIFEST_ASSET);
  });

  it('points prepareCmd and successCmd at scripts that exist', () => {
    for (const script of [MANIFEST_SCRIPT, DISPATCH_SCRIPT]) {
      expect(existsSync(join(__dirname, '../..', script))).toBe(true);
    }
  });

  it('passes the dispatcher the version flag it reads', () => {
    const passed = flagsPassed(segmentFor(successCmd, DISPATCH_SCRIPT));
    expect(passed).toContain('version');
  });

  it('rejects a renamed flag on either side (positive control)', () => {
    const renamedCommand = prepareCmd.replace('--prev-tag=', '--previous-tag=');
    expect(renamedCommand).not.toEqual(prepareCmd);
    expect(
      flagsPassed(segmentFor(renamedCommand, MANIFEST_SCRIPT)),
    ).not.toEqual(argKeysRead(manifestSource).map(normalizeKey).sort());

    const renamedSource = manifestSource.replace(
      "args['prev-tag']",
      "args['previousTag']",
    );
    expect(renamedSource).not.toEqual(manifestSource);
    expect(argKeysRead(renamedSource).map(normalizeKey).sort()).not.toEqual(
      flagsPassed(segmentFor(prepareCmd, MANIFEST_SCRIPT)),
    );
  });

  it('rejects an assets list missing the manifest (positive control)', () => {
    const stripped = gitAssets.filter((asset) => asset !== MANIFEST_ASSET);
    expect(stripped).not.toContain(MANIFEST_ASSET);
    expect(stripped.length).toBe(gitAssets.length - 1);
  });
});

/**
 * Node caps `execFileSync` output at 1 MiB by default, and the all-history
 * range this script documents as its fallback measured 1,998,359 bytes — so
 * the fallback died with an opaque `spawnSync git ENOBUFS` naming neither the
 * range nor the manifest.
 *
 * The cap is emulated rather than exercised against real history on purpose:
 * `test-report.yml` checks out at the default `fetch-depth: 1`, so in CI this
 * repository is a one-commit shallow clone. A history-derived assertion would
 * measure the clone rather than the repository and pass vacuously.
 */
const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;
const ALL_HISTORY_BYTES = 1_998_359;
const PER_RELEASE_BYTES = 38_949;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { gitCommits } = require('../../scripts/generate-release-manifest');

function cappingExec(payloadBytes: number) {
  return (
    _command: string,
    _args: string[],
    options?: { maxBuffer?: number },
  ): string => {
    if (payloadBytes > Number(options?.maxBuffer ?? NODE_DEFAULT_MAX_BUFFER)) {
      const error: NodeJS.ErrnoException = new Error('spawnSync git ENOBUFS');
      error.code = 'ENOBUFS';
      throw error;
    }
    return '';
  };
}

describe('the all-history manifest fallback survives its own payload', () => {
  it('reads the all-history range without ENOBUFS', () => {
    expect(() => gitCommits('', cappingExec(ALL_HISTORY_BYTES))).not.toThrow();
  });

  it('raises the cap above node default rather than relying on it', () => {
    let seen: { maxBuffer?: number } | undefined;
    gitCommits(
      '',
      (_c: string, _a: string[], options: { maxBuffer?: number }) => {
        seen = options;
        return '';
      },
    );
    expect(Number(seen?.maxBuffer) > NODE_DEFAULT_MAX_BUFFER).toBe(true);
  });

  it('detects the uncapped shape it replaces (positive control)', () => {
    expect(() =>
      cappingExec(ALL_HISTORY_BYTES)('git', [], { encoding: 'utf8' } as never),
    ).toThrow(/ENOBUFS/);
    expect(Number(undefined) > NODE_DEFAULT_MAX_BUFFER).toBe(false);
  });

  it('leaves a per-release range unaffected either way (negative control)', () => {
    expect(PER_RELEASE_BYTES).toBeLessThan(NODE_DEFAULT_MAX_BUFFER);
    expect(() =>
      cappingExec(PER_RELEASE_BYTES)('git', [], { encoding: 'utf8' } as never),
    ).not.toThrow();
  });
});
