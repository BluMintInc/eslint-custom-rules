import { join } from 'node:path';
import {
  GOVERNOR_CLI_ENV,
  GOVERNOR_PROFILE,
  governArgv,
  governShellCommand,
  isGovernorStartupFailure,
  resolveGovernorCli,
} from './governor';

const CLI = '/home/agent/agora/scripts/exec-governor/cli.ts';
const present = () => true;
const absent = () => false;

describe('resolveGovernorCli', () => {
  it('returns the configured path when it exists', () => {
    expect(
      resolveGovernorCli({
        env: { [GOVERNOR_CLI_ENV]: CLI },
        fileExists: present,
      }),
    ).toBe(CLI);
  });

  it('trims surrounding whitespace before probing the path', () => {
    const probed: string[] = [];
    const result = resolveGovernorCli({
      env: { [GOVERNOR_CLI_ENV]: `  ${CLI}  ` },
      fileExists: (path) => {
        probed.push(path);
        return true;
      },
    });
    expect(result).toBe(CLI);
    expect(probed).toEqual([CLI]);
  });

  it('returns null when unset, so a checkout with no agora beside it is unaffected', () => {
    expect(resolveGovernorCli({ env: {}, fileExists: present })).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
  ])('returns null for a %s value', (_label, value) => {
    expect(
      resolveGovernorCli({
        env: { [GOVERNOR_CLI_ENV]: value },
        fileExists: present,
      }),
    ).toBeNull();
  });

  /**
   * The degradation that keeps a moved clone from turning every gate on the box
   * red. An unreachable governor is a machine-configuration fact, not a defect
   * in the change under test.
   */
  it('returns null when the configured path is gone', () => {
    expect(
      resolveGovernorCli({
        env: { [GOVERNOR_CLI_ENV]: CLI },
        fileExists: absent,
      }),
    ).toBeNull();
  });
});

describe('governArgv', () => {
  it('passes the command through untouched when no governor is configured', () => {
    expect(
      governArgv('npx', ['jest', '--passWithNoTests'], {
        env: {},
        fileExists: present,
      }),
    ).toEqual(['npx', ['jest', '--passWithNoTests']]);
  });

  it('copies the argv rather than aliasing the caller’s array', () => {
    const args = ['jest'];
    const [, produced] = governArgv('npx', args, {
      env: {},
      fileExists: present,
    });
    expect(produced).not.toBe(args);
    expect(produced).toEqual(args);
  });

  it('routes through the governor with the command after the separator', () => {
    expect(
      governArgv('npx', ['jest', '--findRelatedTests', 'a.ts'], {
        env: { [GOVERNOR_CLI_ENV]: CLI },
        fileExists: present,
      }),
    ).toEqual([
      'npx',
      [
        'tsx',
        CLI,
        'run',
        `--profile=${GOVERNOR_PROFILE}`,
        '--',
        'npx',
        'jest',
        '--findRelatedTests',
        'a.ts',
      ],
    ]);
  });

  it('reserves against the jest profile, the one sizing a worker fleet', () => {
    expect(GOVERNOR_PROFILE).toBe('jest');
  });
});

describe('governShellCommand', () => {
  const bare = 'node ./node_modules/jest/bin/jest --passWithNoTests';

  it('passes the command through untouched when no governor is configured', () => {
    expect(governShellCommand(bare, { env: {}, fileExists: present })).toBe(
      bare,
    );
  });

  it('prefixes the governor run and keeps the command after the separator', () => {
    expect(
      governShellCommand(bare, {
        env: { [GOVERNOR_CLI_ENV]: CLI },
        fileExists: present,
      }),
    ).toBe(`npx tsx '${CLI}' run --profile=${GOVERNOR_PROFILE} -- ${bare}`);
  });

  it('quotes a path holding a space so it stays one argument', () => {
    const spaced = '/home/agent/my agora/scripts/exec-governor/cli.ts';
    expect(
      governShellCommand(bare, {
        env: { [GOVERNOR_CLI_ENV]: spaced },
        fileExists: present,
      }),
    ).toContain(`'${spaced}'`);
  });

  /**
   * The governor execs its program directly rather than through a shell, so an
   * environment assignment must stay OUTSIDE the wrapper. Were the wrapper to
   * absorb it, `CLAUDE_AGENT_COVERAGE_CHECK=true` would become the program name
   * and the coverage gate would die with ENOENT. `agent-check.ts` prefixes the
   * assignment to the string this returns; this pins the shape it relies on.
   */
  it('begins with the governor invocation, leaving room for an env prefix', () => {
    const governed = governShellCommand(bare, {
      env: { [GOVERNOR_CLI_ENV]: CLI },
      fileExists: present,
    });
    expect(governed.startsWith('npx tsx ')).toBe(true);
    expect(`CLAUDE_AGENT_COVERAGE_CHECK=true ${governed}`).toContain(
      `=true npx tsx `,
    );
  });
});

/**
 * `jest.config.js` reads the governor's worker grant by literal name, because
 * it is CommonJS loaded before any TypeScript transform exists and the two
 * repos are separate clones. A drift in that literal is silent: jest reads an
 * undefined variable, falls back to sizing from installed memory, and every
 * gate stays green while the grant is ignored — exactly the blindness the
 * governor exists to remove. These arms make the drift loud.
 */
describe('the jest worker grant', () => {
  const GRANT_ENV = 'BLUMINT_MAX_WORKERS';

  const set = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  };

  /**
   * `CI` is pinned alongside the grant because `calculateWorkers` answers
   * `'100%'` for CI BEFORE it ever reads a grant. Left ambient, every arm below
   * asserts a different contract depending on where it runs — green on a
   * workstation, red on a runner, with the failure naming the grant rather than
   * the environment that decided it. Each arm states its own environment.
   */
  const loadMaxWorkers = (value?: string, ci = false) => {
    const previousGrant = process.env[GRANT_ENV];
    const previousCi = process.env.CI;
    set(GRANT_ENV, value);
    set('CI', ci ? 'true' : undefined);
    try {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../jest.config.js').maxWorkers;
    } finally {
      set(GRANT_ENV, previousGrant);
      set('CI', previousCi);
      jest.resetModules();
    }
  };

  it('sizes to the grant when one is present', () => {
    expect(loadMaxWorkers('3')).toBe(3);
  });

  /**
   * CI outranks the grant, and must: no governor runs on a hosted runner, so
   * there is no pool for a reservation to queue against and the job owns the
   * whole box. A grant reaching CI would mean something had leaked a stale
   * reservation into an environment that cannot release it.
   */
  it('leaves a CI run at 100%, grant or no grant', () => {
    expect(loadMaxWorkers(undefined, true)).toBe('100%');
    expect(loadMaxWorkers('3', true)).toBe('100%');
  });

  /**
   * Non-vacuity: the grant must MOVE the answer. An arm asserting only that a
   * grant of 3 yields 3 would also pass on a machine whose ungoverned sizing
   * happens to be 3, certifying nothing.
   */
  it('differs from the ungoverned sizing, so the grant is what decided it', () => {
    const ungoverned = loadMaxWorkers();
    expect(typeof ungoverned).toBe('number');
    expect(ungoverned).toBeGreaterThanOrEqual(1);
    const granted = ungoverned === 2 ? '5' : '2';
    expect(loadMaxWorkers(granted)).toBe(Number(granted));
    expect(loadMaxWorkers(granted)).not.toBe(ungoverned);
  });

  it.each([
    ['a non-numeric value', 'many'],
    ['zero', '0'],
    ['a negative count', '-4'],
    ['an empty value', ''],
  ])('falls back to the local sizing for %s', (_label, value) => {
    expect(loadMaxWorkers(value)).toBe(loadMaxWorkers());
  });

  /**
   * The real drift guard, live only where an agora clone is reachable: the
   * literal above is checked against the governor's own single source for it.
   * Skipped elsewhere (CI, a bare laptop), which is why the literal is also
   * pinned independently in the arm below.
   */
  it('matches the governor’s own spelling when a clone is reachable', () => {
    const cli = resolveGovernorCli();
    if (cli === null) {
      return;
    }
    const names = join(cli, '..', 'grantEnvNames.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MAX_WORKERS_ENV } = require(names);
    expect(MAX_WORKERS_ENV).toBe(GRANT_ENV);
  });

  it('is spelled BLUMINT_MAX_WORKERS in jest.config.js', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('node:fs');
    const source = readFileSync(
      join(__dirname, '..', 'jest.config.js'),
      'utf-8',
    );
    expect(source).toContain(`'${GRANT_ENV}'`);
  });
});

describe('isGovernorStartupFailure', () => {
  const governed = { env: { [GOVERNOR_CLI_ENV]: CLI }, fileExists: present };

  // The real shape: the governor resolves its own imports against ITS repo
  // root, so launching it from this checkout dies before jest is reached.
  const STARTUP_CRASH = [
    "Error: Cannot find module 'functions/src/util/assertSafe'",
    'Require stack:',
    `- ${CLI}`,
    "  code: 'MODULE_NOT_FOUND'",
  ].join('\n');

  it('recognizes a crash whose require stack names the governor', () => {
    expect(isGovernorStartupFailure(STARTUP_CRASH, governed)).toBe(true);
  });

  it('does NOT claim a missing module raised by the code under test', () => {
    const ownFailure = [
      "Error: Cannot find module '../utils/ASTHelpers'",
      'Require stack:',
      '- /home/agent/eslint-custom-rules/src/rules/some-rule.ts',
      "  code: 'MODULE_NOT_FOUND'",
    ].join('\n');
    expect(isGovernorStartupFailure(ownFailure, governed)).toBe(false);
  });

  it('does NOT claim an ordinary failing assertion that mentions the path', () => {
    expect(
      isGovernorStartupFailure(
        `expected 1 received 2 while running ${CLI}`,
        governed,
      ),
    ).toBe(false);
  });

  it('is inert when no governor is configured, so a bare run is never retried', () => {
    expect(
      isGovernorStartupFailure(STARTUP_CRASH, { env: {}, fileExists: present }),
    ).toBe(false);
  });

  it('is inert when the configured clone is gone, which already degrades to bare', () => {
    expect(
      isGovernorStartupFailure(STARTUP_CRASH, {
        env: { [GOVERNOR_CLI_ENV]: CLI },
        fileExists: absent,
      }),
    ).toBe(false);
  });
});
