import { ESLintUtils } from '@typescript-eslint/utils';
import { RuleTester } from 'eslint';
import { assertValidCasesCanFail } from './validCaseFalsifiability';

/**
 * Installs the `valid`-case falsifiability check on every `RuleTester`, loaded
 * as a jest `setupFiles` entry so it is active for all suites.
 *
 * Patching the prototype rather than wrapping the shared testers in
 * `ruleTester.ts` is deliberate: eight suites build their own `RuleTester`
 * despite CLAUDE.md saying not to, and those are precisely the ones a wrapper
 * around the shared exports would miss — including `no-unused-usestate`, which
 * the dynamic sweep also cannot instrument. Guarding the prototype leaves no way
 * to opt out by accident.
 */

type ValidCase = string | { code?: string };
type RunArgs = [
  name: string,
  rule: unknown,
  tests: { valid?: readonly ValidCase[] },
];

/** Marks a prototype as patched so a re-import cannot double-wrap `run`. */
const INSTALLED = Symbol.for('blumint.validCaseGuard.installed');

type Patchable = {
  run: (...args: RunArgs) => unknown;
  [INSTALLED]?: boolean;
};

function install(prototype: Patchable | undefined): void {
  if (!prototype || prototype[INSTALLED]) {
    return;
  }
  const original = prototype.run;
  prototype.run = function patchedRun(...args: RunArgs) {
    const [name, , tests] = args;
    assertValidCasesCanFail(name, tests?.valid ?? []);
    return original.apply(this, args);
  };
  prototype[INSTALLED] = true;
}

// Both are patched because the typescript-eslint tester does not necessarily
// inherit `run` from the core one; whichever a suite reaches for is covered.
install(ESLintUtils.RuleTester?.prototype as unknown as Patchable);
install(RuleTester?.prototype as unknown as Patchable);
