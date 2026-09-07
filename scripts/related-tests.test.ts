import {
  GOVERNOR_CLI_ENV,
  GOVERNOR_PROFILE,
  GOVERNOR_TSCONFIG_ENV,
  resolveGovernorTsconfig,
} from './governor';
import {
  buildRelatedTestsInvocation,
  resolveRelatedTestOperands,
} from './related-tests';
import { REGISTRY_GUARD_SUITES } from './registry-guard-suites';

const CLI = '/home/agent/agora/scripts/exec-governor/cli.ts';
const present = () => true;
const governed = { env: { [GOVERNOR_CLI_ENV]: CLI }, fileExists: present };
const ungoverned = { env: {}, fileExists: present };

const GUARD_PATHS = REGISTRY_GUARD_SUITES.map(({ path }) => path);

describe('resolveRelatedTestOperands', () => {
  it('passes an ordinary change through untouched', () => {
    expect(
      resolveRelatedTestOperands(['src/rules/foo.ts', 'src/tests/foo.test.ts']),
    ).toEqual(['src/rules/foo.ts', 'src/tests/foo.test.ts']);
  });

  /**
   * The registry loads through a computed path, so relatedness selects nothing
   * when it changes. Naming the guards is what keeps a rule registered with a
   * missing doc page or a mismatched severity from passing the local gate.
   */
  it('appends every registry guard when the registry itself changed', () => {
    const operands = resolveRelatedTestOperands(['src/index.ts']);
    expect(operands[0]).toBe('src/index.ts');
    expect(operands).toEqual(['src/index.ts', ...GUARD_PATHS]);
  });

  /**
   * The Stop hook's change log records the absolute path Claude Code reports,
   * while the maintainer's git diff yields a repo-relative one. Both name the
   * same registry, so both must expand.
   */
  it('recognizes the registry named by an absolute path', () => {
    const operands = resolveRelatedTestOperands([
      '/home/agent/eslint-custom-rules/src/index.ts',
    ]);
    expect(operands).toHaveLength(1 + GUARD_PATHS.length);
    expect(operands).toContain(
      'src/tests/recommended-severity-consistency.test.ts',
    );
  });

  it.each([
    ['a nested index', 'src/utils/index.ts'],
    ['a suffix collision', 'vendor-src/index.ts'],
    ['a test named index', 'src/tests/index.test.ts'],
  ])('does not expand for %s', (_label, file) => {
    expect(resolveRelatedTestOperands([file])).toEqual([file]);
  });

  it('names a guard the change already carries only once', () => {
    const operands = resolveRelatedTestOperands([
      'src/index.ts',
      'src/tests/visitor-key-validity.test.ts',
    ]);
    const named = operands.filter((file) =>
      file.endsWith('visitor-key-validity.test.ts'),
    );
    expect(named).toHaveLength(1);
  });

  it('does not alias the caller’s array', () => {
    const changed = ['src/index.ts'];
    const operands = resolveRelatedTestOperands(changed);
    expect(operands).not.toBe(changed);
    expect(changed).toEqual(['src/index.ts']);
  });
});

describe('buildRelatedTestsInvocation', () => {
  /**
   * The governor spawns its child as argv with no shell, so an `npx` head dies
   * ENOENT on Git Bash. Jest's own JS entry point is the head that survives
   * both spawn styles.
   */
  it('heads the bare payload with node and jest’s entry point', () => {
    const { bare } = buildRelatedTestsInvocation(
      ['src/rules/foo.ts'],
      ungoverned,
    );
    expect(bare).toEqual([
      'node',
      [
        './node_modules/jest/bin/jest',
        '--findRelatedTests',
        'src/rules/foo.ts',
        '--passWithNoTests',
      ],
    ]);
  });

  it('runs the bare payload when no governor is configured', () => {
    const invocation = buildRelatedTestsInvocation(
      ['src/rules/foo.ts'],
      ungoverned,
    );
    expect([invocation.command, invocation.args]).toEqual(invocation.bare);
    expect(invocation.env).toEqual({});
  });

  it('wraps the payload and carries the governor’s tsconfig when configured', () => {
    const { command, args, env, bare } = buildRelatedTestsInvocation(
      ['src/rules/foo.ts'],
      governed,
    );
    expect(command).toBe('npx');
    expect(args).toEqual([
      'tsx',
      CLI,
      'run',
      `--profile=${GOVERNOR_PROFILE}`,
      '--',
      ...bare[0].split(' '),
      ...bare[1],
    ]);
    expect(env).toEqual({
      [GOVERNOR_TSCONFIG_ENV]: resolveGovernorTsconfig(CLI),
    });
  });

  it('expands the registry guards into the operands it runs', () => {
    const { bare } = buildRelatedTestsInvocation(['src/index.ts'], ungoverned);
    for (const path of GUARD_PATHS) {
      expect(bare[1]).toContain(path);
    }
  });

  /**
   * The Bash guard's published rewrite republishes a denied command's surviving
   * flags after `--`, so a rewrite that carried `--coverage` must reach jest as
   * a flag rather than as a path operand.
   */
  it('appends caller flags after the operands', () => {
    const { bare } = buildRelatedTestsInvocation(
      ['src/rules/foo.ts'],
      ungoverned,
      ['--coverage'],
    );
    expect(bare[1]).toEqual([
      './node_modules/jest/bin/jest',
      '--findRelatedTests',
      'src/rules/foo.ts',
      '--passWithNoTests',
      '--coverage',
    ]);
  });
});
