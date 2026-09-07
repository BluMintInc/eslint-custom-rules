import { parse } from 'shell-quote';
import { classifyToolRun } from './classifyToolRun';
import { resolveToolInvocation } from './resolveToolInvocation';

/** Driven through the resolver rather than a hand-built invocation, so the two
 * modules' notion of where a run's arguments begin cannot drift apart. */
const classify = (command: string) => {
  const segment = parse(command);
  const invocation = resolveToolInvocation(segment, 0);
  if (invocation === undefined) {
    throw new Error(`no invocation resolved for ${command}`);
  }
  return classifyToolRun(segment, invocation);
};

describe('classifyToolRun', () => {
  it.each([
    ['a bare jest', 'npx jest'],
    ['the npm suite', 'npm test'],
    ['the CI script', 'npm run test:ci'],
    ['a coverage run', 'npx jest --coverage'],
    ['a watcher', 'npx jest --watch'],
    ['a silent run', 'npx jest --silent --ci'],
    /** An npm global option in front of the subcommand: all 355 suites, from a
     * segment that resolves to no invocation at all without the option walk. */
    ['a quieted npm suite', 'npm --silent test'],
    ['its short spelling', 'npm -s test'],
    ['a quieted run', 'npm run -s test'],
    ['a quieted CI script', 'npm --silent run test:ci'],
  ])('convicts %s', (_label, command) => {
    expect(classify(command)).toMatchObject({ rule: 'whole-suite' });
  });

  it('publishes the canonical scoped script', () => {
    expect(classify('npx jest')).toEqual({
      rule: 'whole-suite',
      rewrite: 'npm run test:related',
    });
  });

  /**
   * The surviving arguments are republished, since a rewrite dropping `-u` or
   * `--bail` answers a different question than the command it replaces, and the
   * one blind retry this guard is architected around would then read every
   * stale snapshot as a regression.
   */
  it.each([
    ['npx jest -u --bail', 'npm run test:related -- -u --bail'],
    ['npm test -- --ci', 'npm run test:related -- --ci'],
    ['npx jest --coverage', 'npm run test:related -- --coverage'],
  ])('republishes %s surviving flags', (command, rewrite) => {
    expect(classify(command)).toEqual({ rule: 'whole-suite', rewrite });
  });

  /**
   * The one exception to republishing, and the reason this rule exists at all:
   * a jest CLI `--maxWorkers` outranks the config's own sizing, so carrying it
   * onto the remedy would publish a governed command that still fans out to the
   * count that filled the box.
   */
  it.each([
    ['npx jest --maxWorkers=13'],
    ['npx jest --maxWorkers 13'],
    ['npx jest -w 13'],
    ['npx jest --maxWorkers 13 --bail'],
  ])('drops the worker count from %s', (command) => {
    expect(classify(command)?.rewrite).not.toContain('13');
  });

  it('keeps the other flags when it drops the worker count', () => {
    expect(classify('npx jest --maxWorkers 13 --bail')).toEqual({
      rule: 'whole-suite',
      rewrite: 'npm run test:related -- --bail',
    });
  });

  it.each([
    ['a path operand', 'npx jest src/tests/x.test.ts'],
    ['a related run', 'npx jest --findRelatedTests src/rules/x.ts'],
    ['a path pattern', 'npx jest --testPathPattern=rules'],
    ['a name pattern', 'npx jest -t "denies"'],
    ['a changed-since run', 'npx jest --changedSince=develop'],
    ['a shard', 'npx jest --shard=1/4'],
    ['a listing', 'npx jest --listTests'],
    ['a config dump', 'npx jest --showConfig'],
    ['a cache clear', 'npx jest --clearCache'],
    ['help', 'npx jest --help'],
    ['a scoped npm suite', 'npm test -- src/tests/x.test.ts'],
    ['the canonical scoped script', 'npm run test:related'],
    ['a scoped canonical run', 'npm run test:related -- src/rules/x.ts'],
    ['an unrelated script', 'npm run build'],
    ['a quieted scoped suite', 'npm --silent test -- src/tests/x.test.ts'],
    /** The arity pin: `test` here is `--prefix`'s VALUE, so the script is
     * `build` and nothing about this run is the whole suite. */
    ['a build behind a value option', 'npm --prefix test run build'],
  ])('holds no opinion about %s', (_label, command) => {
    expect(classify(command)).toBeUndefined();
  });

  /**
   * A value the lexer would otherwise read as a path operand. Skipping it is
   * what keeps `--maxWorkers 13` — the exact spelling that filled the box —
   * from reading as a scoped run.
   *
   * The value is republished ATTACHED whatever spelling the author wrote,
   * because the remedy's own parser splits on the dash alone: republished
   * detached, `jest.config.js` would reach jest as a `--findRelatedTests`
   * operand and the retry would run zero tests at exit 0.
   * `test-related.test.ts` holds the two modules to that end to end.
   */
  it.each([
    ['npx jest --config jest.config.js'],
    ['npx jest --config=jest.config.js'],
  ])('republishes %s value attached', (command) => {
    expect(classify(command)).toEqual({
      rule: 'whole-suite',
      rewrite: 'npm run test:related -- --config=jest.config.js',
    });
  });

  /** An unexpandable token leaves the argument list unknown, so the run cannot
   * be republished faithfully and the command is left alone. A value option
   * whose value never arrived, or arrived as an expansion, leaves the same
   * unknown list an unreadable operand does. */
  it.each([
    ['an unexpandable token', 'npx jest $FLAGS'],
    ['an unexpandable value', 'npx jest --config $CONFIG'],
    ['a value that never arrived', 'npx jest --config'],
  ])('abstains on %s', (_label, command) => {
    expect(classify(command)).toBeUndefined();
  });
});
