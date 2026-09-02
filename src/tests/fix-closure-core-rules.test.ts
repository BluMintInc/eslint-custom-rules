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
import { Linter, Rule } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  silentWithoutProgramRuleNames,
  typeAwareRuleNames,
} from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
  configs: { recommended: { rules: Record<string, unknown> } };
};
/* eslint-enable @typescript-eslint/no-var-requires */

const PREFIX = '@blumintinc/blumint/';

/**
 * Rules discounted BY NAME, at this guard's own level. The set is EMPTY, and
 * that is an earned outcome rather than an oversight.
 *
 * Its one entry was `no-entire-object-hook-deps`, discounted because with no
 * program every dependency reads as `unknown`-typed, so it reports and deletes
 * deps a consumer's CI would leave alone (the verdict flip tracked by #1621).
 *
 * What actually made a fixture go red was narrower than that reason. On the
 * #1652 fixture a sibling fixer hoists `list?.length` into a `listHash`
 * binding, and this rule then deleted that dependency — the last reference —
 * leaving `'listHash' is assigned a value but never used`. #2209 taught the
 * rule to decline a removal that strands its binding, so composing it now
 * introduces nothing here, measured over all three fixtures.
 *
 * The #1621 divergence itself is untouched and still real; it simply never
 * showed up as a CORE violation, which is the only question this guard asks.
 * The nine cross-corpus guards that discounted the same rule emptied their own
 * entries the same way and for the same kind of reason: each asks what the
 * fixer WRITES, which the #1621 reporting divergence does not speak to. Scope
 * stays per-guard rather than rule-global, since a rule-global exemption
 * un-gates every arm at once (#1839), and discounting one divergence never
 * justified unprobing the other fifteen `getParserServices` rules (#1879).
 *
 * An entry here is MEASURED, not asserted: `discounts only rules that still
 * diverge` puts the rule back and requires a fixture to go red, so an exemption
 * fails as stale rather than quietly outliving its reason. That is how this one
 * came out.
 */
const DIVERGENT_WITHOUT_PROGRAM = new Map<string, string>([]);

const RECOMMENDED: Record<string, unknown> = {};
for (const [id, severity] of Object.entries(plugin.configs.recommended.rules)) {
  if (!id.startsWith(PREFIX)) continue;
  const name = id.slice(PREFIX.length);
  if (!plugin.rules[name]) continue;
  if (silentWithoutProgramRuleNames.has(name)) continue;
  if (DIVERGENT_WITHOUT_PROGRAM.has(name)) continue;
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
    expect(Object.keys(RECOMMENDED).length).toBeGreaterThan(100); // measured 189
    // The type-aware rules this guard once dropped wholesale must be COMPOSED,
    // not skipped — only the one measured divergence is discounted. Asserting
    // their presence is what stops the blanket exclusion returning silently.
    const typeAwareInConfig = [...typeAwareRuleNames].filter(
      (name) => PREFIX + name in plugin.configs.recommended.rules,
    );
    expect(typeAwareInConfig.length).toBeGreaterThan(13); // measured 15
    expect(
      typeAwareInConfig.filter(
        (name) =>
          !(PREFIX + name in RECOMMENDED) &&
          !DIVERGENT_WITHOUT_PROGRAM.has(name),
      ),
    ).toEqual([]);
  });

  it('discounts only rules that still exist, each with a reason', () => {
    // A stale name is an exemption held open for a rule that cannot claim it.
    expect(
      [...DIVERGENT_WITHOUT_PROGRAM.keys()].filter(
        (name) => !(name in plugin.rules),
      ),
    ).toEqual([]);
    for (const reason of DIVERGENT_WITHOUT_PROGRAM.values()) {
      expect(reason).toMatch(/#\d+/);
    }
  });

  /**
   * Every discount must still be EARNED, measured here rather than asserted in
   * prose. Putting the rule back must make some fixture red; if it does not, the
   * divergence has been fixed (or the fixture no longer reaches it) and the
   * entry is a hole held open for nothing.
   *
   * This is what a named, guard-local discount buys over a blanket set: the
   * blanket one could never be checked, because it could not say what it was
   * paying for.
   */
  const introducesCoreViolation = (rules: Record<string, unknown>) =>
    FIXTURES.some(({ filename, code }) => {
      const before = coreViolations(code, filename);
      const fixed = linter.verifyAndFix(code, config(rules, filename), {
        filename,
      }).output;
      return coreViolations(fixed, filename).some(
        (violation) => !before.includes(violation),
      );
    });

  /**
   * `it.each` throws on an empty table, and the discount set is legitimately
   * empty once every entry has been earned back by a fix. A loop keeps the
   * per-name assertion while tolerating that state; skipping the test instead
   * would leave the next entry added here unchecked.
   */
  it('discounts only rules that still diverge (earned, not stale)', () => {
    const stale = [...DIVERGENT_WITHOUT_PROGRAM.keys()].filter(
      (name) =>
        !introducesCoreViolation({
          ...RECOMMENDED,
          [PREFIX + name]: plugin.configs.recommended.rules[PREFIX + name],
        }),
    );
    expect(stale).toEqual([]);
  });

  /**
   * With the set empty the assertion above passes over nothing, so the probe it
   * relies on is pinned separately: a planted fixer that introduces a core
   * violation must read as divergent, and the unmodified config must not.
   * Without this pair an inert probe would certify every future entry as stale.
   */
  it('the earned-exemption probe detects a divergence (controls)', () => {
    linter.defineRule('control/strands-a-binding', {
      meta: { fixable: 'code', type: 'problem', schema: [] },
      create(context: Rule.RuleContext) {
        return {
          Program(node: never) {
            context.report({
              node,
              message: 'plant',
              fix: (fixer) =>
                fixer.insertTextAfter(node, '\nconst plantedOrphan = 1;\n'),
            });
          },
        };
      },
    } as never);

    expect(
      introducesCoreViolation({
        ...RECOMMENDED,
        'control/strands-a-binding': 'error',
      }),
    ).toBe(true);
    expect(introducesCoreViolation(RECOMMENDED)).toBe(false);
  });
});
