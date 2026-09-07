import { parse } from 'shell-quote';
import { resolveToolInvocation } from './resolveToolInvocation';

const resolve = (command: string) => {
  return resolveToolInvocation(parse(command), 0);
};

describe('resolveToolInvocation', () => {
  it.each([
    ['a bare binary', 'jest'],
    ['the npx launcher', 'npx jest'],
    ['a node entry point', 'node ./node_modules/jest/bin/jest.js'],
    ['a bin shim', './node_modules/.bin/jest'],
    ['the bunx launcher', 'bunx jest'],
    ['yarn', 'yarn jest'],
    ['yarn run', 'yarn run jest'],
    ['pnpm exec', 'pnpm exec jest'],
    ['npm exec', 'npm exec jest'],
    ['npm exec behind an npm option', 'npm --silent exec jest'],
    ['a Windows shim', 'npx.cmd jest'],
  ])('resolves %s to the jest binary', (_label, command) => {
    expect(resolve(command)).toEqual({
      kind: 'jest-binary',
      argumentsIndex: expect.any(Number),
    });
  });

  it('places the arguments index just after the binary', () => {
    expect(resolve('npx --package=jest jest --bail')).toEqual({
      kind: 'jest-binary',
      argumentsIndex: 3,
    });
  });

  it.each([
    ['the npm test alias', 'npm test', 'test'],
    ['the one-letter alias', 'npm t', 'test'],
    ['run', 'npm run test:ci', 'test:ci'],
    ['run-script', 'npm run-script test:related', 'test:related'],
    /** npm's own aliases for `run`, which run the script either way, so a set
     * naming only `run` is a deny one typo walks past. */
    ['the rum alias', 'npm rum test', 'test'],
    ['the urn alias', 'npm urn test:ci', 'test:ci'],
  ])('resolves %s to an npm script', (_label, command, script) => {
    expect(resolve(command)).toMatchObject({ kind: 'npm-script', script });
  });

  /**
   * npm's own options sit at two positions, and either one hides the whole
   * suite from a walk that models only the launchers: `--silent` is the flag an
   * agent reaches for the moment output gets long, and one of them in front of
   * the subcommand is enough to make the entire segment resolve to nothing.
   */
  it.each([
    ['a long option', 'npm --silent test', 'test'],
    ['a short option', 'npm -s test', 'test'],
    ['an option before run', 'npm --silent run test:ci', 'test:ci'],
    ['an option after run', 'npm run -s test', 'test'],
    ['an option after run-script', 'npm run-script --silent test', 'test'],
    ['a separate value', 'npm --loglevel error test', 'test'],
    ['a joined value', 'npm --loglevel=error test', 'test'],
    ['a value option before run', 'npm --prefix . run test', 'test'],
    ['the prefix shorthand', 'npm -C . run test', 'test'],
  ])('walks npm past %s', (_label, command, script) => {
    expect(resolve(command)).toMatchObject({ kind: 'npm-script', script });
  });

  /**
   * The arity is why the value options are listed rather than the booleans: an
   * unlisted value option's VALUE reads as the subcommand, so a flat "skip any
   * dash token" walk would convict this build of running the whole suite.
   */
  it.each([['npm --prefix test run build'], ['npm -C test run build']])(
    'reads %s’s option value as its own, not as the subcommand',
    (command) => {
      expect(resolve(command)).toMatchObject({
        kind: 'npm-script',
        script: 'build',
      });
    },
  );

  /**
   * An npm script's own arguments begin after `--`; everything before it is
   * npm's. Without that the run's flags read as npm's and a scoped
   * `npm test -- src/x.test.ts` would classify as a whole-suite run.
   */
  it('grades an npm script from the tokens after `--`', () => {
    const segment = parse('npm test -- --bail src/x.test.ts');

    expect(resolveToolInvocation(segment, 0)).toEqual({
      kind: 'npm-script',
      script: 'test',
      argumentsIndex: 3,
    });
  });

  it('reports an npm script with no `--` as carrying no arguments', () => {
    const segment = parse('npm run test:ci');

    expect(resolveToolInvocation(segment, 0)).toEqual({
      kind: 'npm-script',
      script: 'test:ci',
      argumentsIndex: segment.length,
    });
  });

  it.each([
    ['a launcher running something else', 'npx eslint src/'],
    ['an unrelated binary', 'tsc --noEmit'],
    ['an npm subcommand that runs nothing', 'npm install'],
    ['a run with no script name', 'npm run'],
    ['a launcher whose option value hides the program', 'npx -c "jest"'],
    ['an npm option whose value hides the subcommand', 'npm -c "test"'],
    ['a truncated launcher', 'npx'],
    ['an npm head that is options and nothing else', 'npm --silent'],
    /**
     * The rules table grades npm SCRIPTS and no other package manager's, so
     * these are out of scope by decision rather than by oversight: neither
     * manager is installed on the box this repo's suite is sized for, and both
     * forward a trailing operand with no `--`, so a script arm would deny the
     * scoped `yarn test src/tests/x.test.ts` it cannot tell from a bare run.
     * A jest BINARY through either launcher is still convicted.
     */
    ['a yarn script', 'yarn test'],
    ['a pnpm script', 'pnpm test'],
  ])('holds no opinion about %s', (_label, command) => {
    expect(resolve(command)).toBeUndefined();
  });

  /** A quoted inner command is one string token in operand position, so the
   * head is the wrapper and the segment is left alone — the property that lets
   * every `npm run …` remedy pass with no exemption list. */
  it('reads the head rather than the command text', () => {
    expect(resolve('npx tsx scripts/x.ts -- "npx jest"')).toBeUndefined();
  });
});
