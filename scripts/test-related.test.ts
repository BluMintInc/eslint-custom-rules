import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'shell-quote';
import {
  classifyToolRun,
  JEST_VALUE_OPTIONS,
} from './claude-hooks/gate-containment/classifyToolRun';
import { resolveToolInvocation } from './claude-hooks/gate-containment/resolveToolInvocation';
import { StepFailure, type Runner } from './maintainer';
import { buildRelatedTestsInvocation } from './related-tests';
import { main, partitionArguments, USAGE } from './test-related';

const CLI = __filename;

/**
 * Pins the governor to a reachable path, so each arm states the shape it tests
 * rather than passing on a laptop and failing on the box with an agora clone
 * beside it.
 */
const withGovernorCli = <T>(value: string | undefined, body: () => T): T => {
  const previous = process.env.BLUMINT_GOVERNOR_CLI;
  if (value === undefined) {
    delete process.env.BLUMINT_GOVERNOR_CLI;
  } else {
    process.env.BLUMINT_GOVERNOR_CLI = value;
  }
  try {
    return body();
  } finally {
    if (previous === undefined) {
      delete process.env.BLUMINT_GOVERNOR_CLI;
    } else {
      process.env.BLUMINT_GOVERNOR_CLI = previous;
    }
  }
};

/** The shape a governor that dies before it reaches jest leaves behind. */
const GOVERNOR_CRASH = [
  "Error: Cannot find module 'functions/src/util/assertSafe'",
  'Require stack:',
  `- ${CLI}`,
].join('\n');

describe('partitionArguments', () => {
  it('splits jest flags from file operands', () => {
    expect(
      partitionArguments(['src/rules/foo.ts', '--coverage', 'src/index.ts']),
    ).toEqual({
      flags: ['--coverage'],
      files: ['src/rules/foo.ts', 'src/index.ts'],
      help: false,
    });
  });

  it('reports an empty invocation, which runs the branch’s changed files', () => {
    expect(partitionArguments([])).toEqual({
      flags: [],
      files: [],
      help: false,
    });
  });

  /**
   * `npm run test:related -- <args>` strips the first separator, but a caller
   * that spells a second one must not have it reach jest as a path.
   */
  it('drops a bare separator', () => {
    expect(partitionArguments(['--', 'src/rules/foo.ts'])).toEqual({
      flags: [],
      files: ['src/rules/foo.ts'],
      help: false,
    });
  });

  it.each([['--help'], ['-h']])('treats %s as a help request', (token) => {
    expect(partitionArguments([token]).help).toBe(true);
  });

  /**
   * A detached flag value is indistinguishable from a path operand, so the
   * attached spelling is the one this script reads, and the Bash guard
   * republishes every value option attached to match.
   */
  it('keeps an attached flag value on the flag', () => {
    expect(partitionArguments(['--testPathPattern=foo']).flags).toEqual([
      '--testPathPattern=foo',
    ]);
  });
});

describe('main', () => {
  const recorder = () => {
    const calls: Array<{
      command: string;
      capture: boolean;
      env?: Record<string, string>;
    }> = [];
    const run: Runner = (cmd, args, options) => {
      calls.push({
        command: `${cmd} ${args.join(' ')}`,
        capture: options?.capture === true,
        env: options?.env,
      });
    };
    return { calls, run };
  };

  it('prints usage and runs nothing for a help request', () => {
    const { calls, run } = recorder();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(main(['--help'], { run })).toBe(0);
    } finally {
      log.mockRestore();
    }
    expect(calls).toEqual([]);
  });

  /**
   * A branch with nothing to test is not a failure. Exiting non-zero here would
   * make the canonical scoped command red on every no-op branch, which is how a
   * gate stops being run at all.
   */
  it('runs nothing and succeeds when the branch changed no TypeScript', () => {
    const { calls, run } = recorder();
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(main([], { run, changedFiles: () => [] })).toBe(0);
    } finally {
      log.mockRestore();
    }
    expect(calls).toEqual([]);
  });

  it('falls back to the branch’s changed files when given no operands', () => {
    const { calls, run } = recorder();
    withGovernorCli(undefined, () =>
      expect(main([], { run, changedFiles: () => ['src/rules/foo.ts'] })).toBe(
        0,
      ),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toContain('src/rules/foo.ts');
  });

  /**
   * The governed attempt is captured because its failure has to be READ: with
   * `stdio: 'inherit'` there is no output to hand `isGovernorStartupFailure`,
   * which is what made every gate on the box red (#2332).
   */
  it('captures the governed attempt and hands it the governor’s tsconfig', () => {
    const { calls, run } = recorder();
    withGovernorCli(CLI, () =>
      expect(main(['src/rules/foo.ts'], { run })).toBe(0),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].capture).toBe(true);
    expect(calls[0].env).toEqual({
      TSX_TSCONFIG_PATH: expect.stringContaining('tsconfig.json'),
    });
  });

  /**
   * The governor buys a reservation, not correctness, so one that cannot start
   * must not decide the verdict: the same run goes again unwrapped, losing only
   * the reservation.
   */
  it('re-runs unwrapped when the governor cannot start, and succeeds', () => {
    const calls: string[] = [];
    const run: Runner = (cmd, args) => {
      const line = `${cmd} ${args.join(' ')}`;
      calls.push(line);
      if (line.includes('--profile=jest')) {
        throw new StepFailure('governor exited 1', GOVERNOR_CRASH);
      }
    };
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      withGovernorCli(CLI, () =>
        expect(main(['src/rules/foo.ts'], { run })).toBe(0),
      );
    } finally {
      error.mockRestore();
    }
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(
      'node ./node_modules/jest/bin/jest --findRelatedTests src/rules/foo.ts --passWithNoTests',
    );
  });

  /**
   * The unwrapped retry is the last lane there is, so its failure is the
   * verdict. Reporting success here would hand a green gate to a branch whose
   * tests never passed under either lane.
   */
  it('fails when the unwrapped retry fails too', () => {
    const calls: string[] = [];
    const run: Runner = (cmd, args) => {
      const line = `${cmd} ${args.join(' ')}`;
      calls.push(line);
      throw line.includes('--profile=jest')
        ? new StepFailure('governor exited 1', GOVERNOR_CRASH)
        : new StepFailure('jest exited 1', 'Tests: 1 failed, 2 passed');
    };
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      withGovernorCli(CLI, () =>
        expect(main(['src/rules/foo.ts'], { run })).toBe(1),
      );
    } finally {
      error.mockRestore();
    }
    expect(calls).toHaveLength(2);
  });

  /**
   * A step that dies without carrying output — an `execFileSync` ENOENT rather
   * than a captured non-zero exit — has nothing to identify a governor startup
   * failure with, so it is a plain failure and gets no retry.
   */
  it('fails without retrying when the step carried no output', () => {
    const calls: string[] = [];
    const run: Runner = (cmd, args) => {
      calls.push(`${cmd} ${args.join(' ')}`);
      throw new Error('spawn ENOENT');
    };
    withGovernorCli(CLI, () =>
      expect(main(['src/rules/foo.ts'], { run })).toBe(1),
    );
    expect(calls).toHaveLength(1);
  });

  it('fails without retrying when the tests themselves failed', () => {
    const calls: string[] = [];
    const run: Runner = (cmd, args) => {
      calls.push(`${cmd} ${args.join(' ')}`);
      throw new StepFailure('jest exited 1', 'Tests: 1 failed, 2 passed');
    };
    withGovernorCli(CLI, () =>
      expect(main(['src/rules/foo.ts'], { run })).toBe(1),
    );
    expect(calls).toHaveLength(1);
  });
});

/**
 * The two modules the fixed point spans. The guard's own suite proves a denied
 * command is rewritten into one the guard allows; this proves the rewrite RUNS
 * what it replaced, which is the half that decides whether the one blind retry
 * is a test run or a silent green.
 */
describe('the rewrite the Bash guard publishes', () => {
  const REWRITE_HEAD = ['npm', 'run', 'test:related'] as const;

  const CHANGED = ['src/rules/foo.ts'] as const;

  /** The rewrite as a shell would hand it to `test-related.ts`: re-tokenized,
   * with the npm head and its separator dropped the way npm drops them. */
  const argumentsOf = (rewrite: string) => {
    const tokens = parse(rewrite).map((token) => {
      if (typeof token !== 'string') {
        throw new Error(`unlexable rewrite: ${rewrite}`);
      }
      return token;
    });
    expect(tokens.slice(0, REWRITE_HEAD.length)).toEqual([...REWRITE_HEAD]);
    return tokens.slice(REWRITE_HEAD.length);
  };

  const rewriteFor = (command: string) => {
    const segment = parse(command);
    const invocation = resolveToolInvocation(segment, 0);
    if (invocation === undefined) {
      throw new Error(`no invocation resolved for ${command}`);
    }
    const offense = classifyToolRun(segment, invocation);
    if (offense === undefined) {
      throw new Error(`${command} was not denied`);
    }
    return offense.rewrite;
  };

  /** Every value option, in the DETACHED spelling — the shape that used to
   * republish as two tokens and hand jest its own flag value as a path. */
  const detachedSpellings = [...JEST_VALUE_OPTIONS].map((option) => {
    return [option, `npx jest ${option} 20000`] as const;
  });

  it.each(detachedSpellings)(
    'leaves no %s value in the relatedness operands',
    (_option, command) => {
      const { flags, files } = partitionArguments(
        argumentsOf(rewriteFor(command)),
      );
      expect(files).toEqual([]);
      const { bare } = buildRelatedTestsInvocation([...CHANGED], {}, flags);
      const operands = bare[1].slice(
        bare[1].indexOf('--findRelatedTests') + 1,
        bare[1].indexOf('--passWithNoTests'),
      );
      expect(operands).toEqual([...CHANGED]);
    },
  );

  /**
   * The measured shape from the review: two value options at once, which used
   * to build `--findRelatedTests jest.config.js 30000` and run no tests at
   * exit 0.
   */
  it('carries both options and both values onto the flags', () => {
    const rewrite = rewriteFor(
      'npx jest --config jest.config.js --testTimeout 30000',
    );
    expect(rewrite).toBe(
      'npm run test:related -- --config=jest.config.js --testTimeout=30000',
    );
    expect(partitionArguments(argumentsOf(rewrite))).toEqual({
      flags: ['--config=jest.config.js', '--testTimeout=30000'],
      files: [],
      help: false,
    });
  });
});

describe('USAGE', () => {
  /**
   * The guard's deny text publishes this script as the rewrite for a
   * whole-suite spelling, so the usage line has to name the script the same
   * way an agent is told to run it.
   */
  it('names the npm script the Bash guard publishes', () => {
    expect(USAGE).toContain('npm run test:related');
  });

  /**
   * The rewrite a deny publishes has to be a command that exists. Binding the
   * usage text to the registration keeps the two from drifting apart into a
   * deny that publishes an unrunnable command.
   */
  it('matches a registered npm script', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts['test:related']).toBe(
      'tsx scripts/test-related.ts',
    );
  });
});
