/**
 * The recommended config's `--fix` must not introduce CORE eslint violations.
 *
 * `recommended-config-fix-closure.test.ts` answers the same question for blumint
 * rules only: it builds `OBSERVER_RULES` from `configs.recommended.rules` and
 * additionally drops any message whose `ruleId` is not `@blumintinc/blumint/*`.
 * A fix that leaves an unused variable or an unused import therefore passes it
 * silently — while the consumer's CI, which does run `no-unused-vars`, fails on
 * exactly that.
 *
 * Three shipped bugs lived in that blind spot: #1652 (deleting a dependency
 * array orphaned the `useMemo` binding a sibling rule had just hoisted for it),
 * #1653 (stripping a redundant parameter annotation orphaned the type imports it
 * was the only consumer of), and #1654 (the same for return annotations, where
 * several annotations shared one import).
 *
 * Each fixture is a COMPOSITION: the damage only appears when the whole
 * recommended config fixes to a fixpoint, so a single-rule RuleTester case
 * cannot express it. That is the dimension this file adds — the per-rule suites
 * already cover each fixer in isolation.
 */
import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '..', 'rules');

/**
 * Type-aware rules are excluded: this harness has no `parserOptions.project`,
 * and without a program their behaviour is not the behaviour a consumer gets.
 * `no-entire-object-hook-deps` is the concrete reason — with no type info every
 * dependency reads as `unknown`-typed, so it reports and auto-deletes deps it
 * would leave alone in a real program (the verdict flip tracked by #1621).
 * Including it makes the #1652 fixture fail for a reason that cannot happen in
 * a consumer's CI.
 *
 * Detected by reading the rule sources rather than `String(rule.create)`:
 * `createRule` wraps `create`, so stringifying it matches nothing and would
 * silently exclude no rule at all.
 */
const typeAwareNames = new Set(
  fs
    .readdirSync(RULES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .filter((file) =>
      /getParserServices|getTypeChecker/.test(
        fs.readFileSync(path.join(RULES_DIR, file), 'utf8'),
      ),
    )
    .map((file) => path.basename(file, '.ts')),
);

const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name] || typeAwareNames.has(name)) continue;
  RECOMMENDED[id] = severity;
}

const linter = new Linter();
linter.defineParser('ts', tsParser as never);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

const config = (rules: Record<string, unknown>, filename: string) =>
  ({
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: filename.endsWith('.tsx') },
    },
    rules,
  } as unknown as Linter.Config);

/**
 * `no-undef` is deliberately absent: with no `env` every ambient global reads as
 * undefined, an artefact rather than a finding.
 */
const CORE_RULES = {
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-self-assign': 'error',
};

const coreViolations = (code: string, filename: string) =>
  linter
    .verify(code, config(CORE_RULES, filename), { filename })
    .map((message) => `${message.ruleId}: ${message.message}`);

type Fixture = {
  name: string;
  issue: string;
  filename: string;
  code: string;
};

const FIXTURES: Fixture[] = [
  {
    name: 'deleting a dependency array must not orphan a hoisted binding',
    issue: '#1652',
    filename: '/repo/src/hooks/useThing.ts',
    code: `import { useEffect, useCallback } from 'react';

export const useThing = ({ items }: { items: string[] }) => {
  const { setThing } = useStore();
  const list = useList({ items });

  const handle = useCallback(async () => {
    if (!list) {
      return;
    }
    const only = list.length === 1;
    await setThing({ only });
  }, [list?.length, setThing]);

  useEffect(() => {
    handle();
  }, [handle]);

  return handle;
};
`,
  },
  {
    name: 'stripping a redundant parameter annotation must not orphan its type imports',
    issue: '#1653',
    filename: '/repo/functions/src/realtime/closeRoom.ts',
    code: `import { Change } from 'firebase-functions/v2';
import { DatabaseEvent } from 'firebase-functions/v2/database';
import { DataSnapshot } from '../../types/DataSnapshot';
import { RealtimeDbChangeHandler } from '../../v2/handlerTypes';
import { CallerCount } from '../../types/CallerCount';
import { CallerCountPath } from '../../types/CallerCountPath';

export const closeRoom: RealtimeDbChangeHandler<
  CallerCount,
  CallerCountPath
> = async (event: DatabaseEvent<Change<DataSnapshot<CallerCount>>>) => {
  const { params } = event;
  console.log(params);
};
`,
  },
  {
    name: 'several stripped return annotations sharing one import must unbind it',
    issue: '#1654',
    filename: '/repo/functions/src/util/computePool.ts',
    code: `import type { PrizePoolTarget, Tournament } from '../types/Tournament';

const selfFund = (contributor: Record<string, string>): PrizePoolTarget => {
  return contributor as never;
};

const crowdfundGoal = (goal: Record<string, string>): PrizePoolTarget => {
  return goal as never;
};

export const pick = (tournament: Tournament) => {
  return [selfFund({}), crowdfundGoal({}), tournament];
};
`,
  },
];

describe('the recommended config is closed under its own autofixes (core rules)', () => {
  /**
   * A gate that never fires proves nothing. This asserts the checker sees an
   * unused binding that is present from the start, so a clean result on the
   * fixtures below means the fixers left them clean — not that the check is
   * blind.
   */
  it('detects an unused binding (control)', () => {
    const dirty = 'const unusedThing = 1;\nexport const kept = 2;\n';
    expect(
      coreViolations(dirty, '/repo/src/util/control.ts').length,
    ).toBeGreaterThan(0);
    expect(
      coreViolations('export const kept = 2;\n', '/repo/src/util/control.ts'),
    ).toEqual([]);
  });

  it.each(FIXTURES)('$issue $name', ({ filename, code }) => {
    const before = coreViolations(code, filename);
    const fixed = linter.verifyAndFix(code, config(RECOMMENDED, filename), {
      filename,
    }).output;

    // Comparative: a fixture's own pre-existing violations cancel, so the
    // assertion is strictly "the fix did not ADD any".
    const introduced = coreViolations(fixed, filename).filter(
      (violation) => !before.includes(violation),
    );

    if (introduced.length > 0) {
      throw new Error(
        [
          `\`eslint --fix\` under the recommended config introduced ${introduced.length} core violation(s):`,
          ...introduced.map((violation) => `    ${violation}`),
          '',
          'A fixer removed a construct without cleaning up the binding it was the',
          'last reference to. The consumer runs these core rules, so this ships as',
          'a red CI they cannot fix with --fix. See #1652 / #1653 / #1654.',
          '',
          '--- fixed output ---',
          fixed,
        ].join('\n'),
      );
    }
    expect(introduced).toEqual([]);
  });

  it('exercises a non-trivial rule set', () => {
    // Guards against the config silently emptying (e.g. a rename of the plugin
    // prefix), which would make every fixture pass vacuously.
    expect(Object.keys(RECOMMENDED).length).toBeGreaterThan(100);
    // And against the type-aware detection silently matching nothing, which is
    // how the first draft of this file ran 16 rules with no program.
    expect(typeAwareNames.size).toBeGreaterThan(5);
  });
});
