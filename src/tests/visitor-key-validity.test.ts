import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { rules } from '../index';
import {
  buildOptionPayloads,
  optionSchemaOf,
  payloadLabel,
  screenPayloads,
} from '../utils/syntheticRuleOptions';

/**
 * ESLint never validates the keys of the object a rule's `create()` returns.
 * `CallExpresion` (one 's') is a legal esquery identifier selector that simply
 * matches no node in any program, so the handler beneath it never runs — no
 * error, no warning, and no test failure unless a fixture happens to cover that
 * exact branch. The rule is silently and permanently inert for that node type.
 *
 * Every other gate here reads behaviour or metadata; this one inspects the
 * visitor surface itself. It caught `enforce-boolean-naming-prefixes`
 * registering `ClassProperty`, the typescript-eslint v3/v4 node name renamed to
 * `PropertyDefinition` in v5 — dead since the v5 upgrade, and chasing it
 * exposed two genuinely unchecked node types beneath it.
 *
 * A dead key cannot announce itself, so the floor is asserted in BOTH
 * directions: an unlisted dead key fails, and an ALLOWED entry that stops being
 * dead also fails. That way the exemption list cannot quietly rot into a
 * blanket amnesty.
 *
 * The same rot applies one level up, to the population itself. A rule that
 * gates on filename or file content — `functions/src/types/firestore/**`,
 * `*.dynamic.tsx`, `.md`, a configured glob — returns `{}` for any probe that
 * misses its gate, and an empty visitor object passes every key check
 * vacuously. A single fixed probe therefore validated nothing at all for 19 of
 * 194 rules while the suite stayed green (issue #1731). Visitor keys are
 * collected as a UNION over a probe surface built to reach those gates, and the
 * per-rule floor below — every rule yields at least one key — is what keeps the
 * surface honest: deleting a probe drops its rules to zero keys and fails.
 */

// esquery is resolved through ESLint's own dependency tree rather than declared
// as a direct dependency, so selectors are parsed by the exact matcher ESLint
// uses to evaluate them. A separately-versioned copy could accept a grammar the
// real matcher rejects, which would make this gate lie.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const esquery = require(require.resolve('esquery', {
  paths: [require.resolve('eslint')],
}));

/** Visitor keys that are events rather than node selectors. */
const CODE_PATH_EVENTS = new Set([
  'onCodePathStart',
  'onCodePathEnd',
  'onCodePathSegmentStart',
  'onCodePathSegmentEnd',
  'onCodePathSegmentLoop',
]);

const KNOWN_TYPES = new Set<string>(Object.values(AST_NODE_TYPES));
// Node names that real parsers still emit but TSESTree's enum omits.
for (const extra of [
  'Program',
  'JSXText',
  'ExperimentalRestProperty',
  'ExperimentalSpreadProperty',
]) {
  KNOWN_TYPES.add(extra);
}

type Probe = { filename: string; code: string; reaches: string };

/**
 * Probe sources stay valid TypeScript even when the filename is not: a source
 * that fails to parse never reaches `create()`, which would reintroduce the
 * silent hole this surface exists to close. Rules gate on the path, not on the
 * body, so a parseable body costs nothing.
 */
const PROBES: Probe[] = [
  {
    filename: 'probe.tsx',
    code: 'const x = 1;\n',
    reaches: 'ungated rules; the baseline every rule must tolerate',
  },
  {
    filename: 'src/components/Foo.tsx',
    code: 'export const Foo = () => null;\n',
    reaches: 'frontend/component-path gates',
  },
  {
    filename: 'functions/src/index.ts',
    code: 'export const f = () => 1;\n',
    reaches: 'backend `functions/` gates',
  },
  {
    filename: 'functions/src/callable/fOnCall.f.ts',
    code: 'export const f = 1;\n',
    reaches: 'callable entry-point (`.f.ts`) gates',
  },
  {
    filename: 'functions/src/callable/scripts/migrateFoo.f.ts',
    code: 'export const f = 1;\n',
    reaches: 'the default migration-script glob',
  },
  {
    filename: 'functions/src/types/firestore/Foo/index.ts',
    code: 'export type Foo = { a: string };\n',
    reaches: 'Firestore type-definition directory gates',
  },
  {
    filename: 'src/types/Foo.ts',
    code: 'export type Foo = { a: string };\n',
    reaches: 'types-directory placement gates',
  },
  {
    filename: 'src/util/foo.test.ts',
    code: "it('x', () => {});\n",
    reaches: 'test-file gates',
  },
  {
    filename: 'package.json',
    code: '{"name":"x"}\n',
    reaches: 'manifest-file gates',
  },
  {
    filename: 'migrations/2026-01-01-foo.ts',
    code: 'export const up = () => 1;\n',
    reaches: 'migration-directory gates',
  },
  {
    filename: 'docs/example.md',
    code: 'const x = 1;\n',
    reaches: 'markdown gates, which key on the extension alone',
  },
  {
    filename: 'src/components/Foo.dynamic.tsx',
    code: 'const A = 1;\n',
    reaches: 'dynamic-import module gates',
  },
  {
    filename: 'src/validators/foo.ts',
    code: 'export const isFoo = () => true;\n',
    reaches: 'the default validator-path glob',
  },
  {
    filename: 'src/hooks/useFoo.ts',
    code: 'export const useFoo = () => 1;\n',
    reaches: 'hook-path gates',
  },
  {
    filename: 'src/config/foo.ts',
    code: 'export const A = 1;\n',
    reaches: 'configuration-module gates',
  },
];

/**
 * Rules whose visitor surface is unlocked by configuration rather than by file
 * shape. Options are supplied through the lint config so the rule's own default
 * merging runs; each value satisfies that rule's schema.
 *
 * Hand-written entries are for payloads richer than the synthesizer can invent
 * from a schema — they do not carry the options dimension on their own. A probe
 * surface driving every rule at bare `'error'` measures the DEFAULT
 * configuration only, and an option read at `create` time (a pattern list
 * compiled before any visitor exists) is then entered by nothing.
 */
const RULE_OPTIONS: Record<string, readonly unknown[]> = {
  // Reports nothing until a caller lists restricted properties, so the default
  // (empty list) makes every visitor unreachable.
  'no-restricted-properties-fix': [[{ object: 'foo', property: 'bar' }]],
};

/** An option configuration a rule is driven under, named for reporting. */
type OptionArm = { label: string; options: readonly unknown[] };

/**
 * Every configuration a rule is probed under: its default, its hand-written
 * entry above, and one arm per schema-valid payload synthesized from its own
 * `meta.schema`. Screened by ESLint's own validator, so an arm no consumer
 * could write can never manufacture a failure here.
 */
const optionArmsFor = (name: string, rule: unknown): OptionArm[] => {
  const arms: OptionArm[] = [{ label: 'default', options: [] }];
  const declared = RULE_OPTIONS[name];
  if (declared) arms.push({ label: 'declared', options: declared });
  if (!optionSchemaOf(rule).length) return arms;
  const { valid } = screenPayloads(rule, buildOptionPayloads(rule));
  for (const payload of valid) {
    arms.push({
      label: `${payload.source} ${payloadLabel(payload)}`,
      options: payload.options,
    });
  }
  return arms;
};

/** Non-vacuity accounting for the options dimension the arms above add. */
const optionSweep = {
  armsDriven: 0,
  rulesDrivenWithOptions: new Set<string>(),
};

/**
 * Dead keys that are correct as written. Each needs a verified reason, because
 * the staleness assertion below turns an unjustified entry into a failure the
 * moment it stops being dead.
 */
const ALLOWED: { rule: string; key: string; reason: string }[] = [
  {
    rule: 'no-unpinned-dependencies',
    key: 'JSONLiteral',
    reason:
      'Runs under jsonc-eslint-parser (see ruleTesterJson), which really does emit JSONLiteral. The node is real; it is TSESTree AST_NODE_TYPES that has no entry for it.',
  },
];

/**
 * Rules that expose no visitor key under any probe. Empty because every
 * registered rule is reachable by some probe above; an entry here is an
 * admission that a rule's gate is unreachable, so it needs a one-line verified
 * reason. Enforced both ways — a listed rule that starts producing keys fails,
 * so a stale exemption cannot absorb the next regression.
 */
const EXEMPT_ZERO_KEY: { rule: string; reason: string }[] = [];

/** Every identifier used as a node type anywhere in a parsed esquery selector. */
function typeIdentifiers(selector: unknown, acc = new Set<string>()) {
  if (!selector || typeof selector !== 'object') return acc;
  if (Array.isArray(selector)) {
    selector.forEach((entry) => typeIdentifiers(entry, acc));
    return acc;
  }
  const node = selector as Record<string, unknown>;
  if (node.type === 'identifier' && typeof node.value === 'string') {
    acc.add(node.value);
  }
  // Walking every value rather than a fixed child list keeps the check honest
  // as esquery's selector grammar grows; only `identifier` nodes are collected,
  // so literals and attribute values cannot be mistaken for node types.
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') typeIdentifiers(value, acc);
  }
  return acc;
}

function classifyKey(
  key: string,
): { ok: true } | { ok: false; reason: string } {
  const bare = key.replace(/:exit$/, '').trim();
  if (CODE_PATH_EVENTS.has(bare)) return { ok: true };
  let parsed: unknown;
  try {
    parsed = esquery.parse(bare);
  } catch (err) {
    return {
      ok: false,
      reason: `unparseable selector: ${(err as Error).message}`,
    };
  }
  const unknown = [...typeIdentifiers(parsed)].filter(
    (id) => !KNOWN_TYPES.has(id),
  );
  return unknown.length
    ? { ok: false, reason: `unknown node type(s): ${unknown.join(', ')}` }
    : { ok: true };
}

type CaptureEvent =
  | { kind: 'keys'; keys: string[] }
  | { kind: 'failure'; message: string };

type Capture = {
  /** Union of the visitor keys a rule exposed across the whole probe surface. */
  keys: Map<string, Set<string>>;
  /** Probes that produced no reading at all — coverage holes, not passes. */
  holes: string[];
};

/**
 * The visitor object is captured from a real lint run rather than by calling
 * `create()` with a hand-built stub: a stub that throws on an unexpected
 * accessor drops rules from the population silently, which would understate
 * coverage while still looking like a pass.
 *
 * Taking a rule map as a parameter lets the planted controls below travel the
 * exact same path as the real population, so a capture layer that stops
 * capturing cannot fake a clean sweep.
 */
function captureVisitorKeys(
  ruleMap: Record<string, TSESLint.AnyRuleModule>,
): Capture {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  const keys = new Map<string, Set<string>>();
  const holes: string[] = [];

  for (const [name, rule] of Object.entries(ruleMap)) {
    const union = new Set<string>();
    // An array sidesteps the reassignment the closure performs mid-lint, which
    // a single narrowed binding cannot express.
    const events: CaptureEvent[] = [];
    linter.defineRule(`probe/${name}`, {
      ...(rule as unknown as Linter.RuleModule),
      create(context: unknown) {
        try {
          const visitors = (
            rule as unknown as { create: (ctx: unknown) => unknown }
          ).create(context);
          if (visitors && typeof visitors === 'object') {
            events.push({
              kind: 'keys',
              keys: Object.keys(visitors as object),
            });
          } else {
            events.push({
              kind: 'failure',
              message: 'create() returned a non-object',
            });
          }
        } catch (err) {
          events.push({
            kind: 'failure',
            message: `create() threw: ${(err as Error).message}`,
          });
        }
        return {};
      },
    } as Linter.RuleModule);

    const arms = optionArmsFor(name, rule);
    for (const arm of arms) {
      if (arm.options.length) {
        optionSweep.armsDriven++;
        optionSweep.rulesDrivenWithOptions.add(name);
      }
      for (const probe of PROBES) {
        events.length = 0;
        let messages: Linter.LintMessage[] = [];
        let thrown: string | undefined;
        try {
          messages = linter.verify(
            probe.code,
            {
              parser: 'ts',
              parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                ecmaFeatures: { jsx: true },
              },
              rules: {
                [`probe/${name}`]: [
                  'error',
                  ...arm.options,
                ] as Linter.RuleLevelAndOptions,
              },
            },
            probe.filename,
          );
        } catch (err) {
          thrown = `lint threw: ${(err as Error).message}`;
        }

        const fatal = messages.find((message) => message.fatal);
        const observed = events.find((event) => event.kind === 'keys');
        if (observed && observed.kind === 'keys') {
          observed.keys.forEach((key) => union.add(key));
          continue;
        }
        const failure = events.find((event) => event.kind === 'failure');
        const reason = fatal
          ? `probe source failed to parse — ${fatal.message}`
          : failure && failure.kind === 'failure'
          ? failure.message
          : thrown ?? 'create() was never invoked';
        holes.push(`${name} @ ${probe.filename} [${arm.label}]: ${reason}`);
      }
    }
    keys.set(name, union);
  }
  return { keys, holes };
}

const allowKey = (rule: string, key: string) => JSON.stringify([rule, key]);

function invalidKeys(keys: Map<string, Set<string>>) {
  return [...keys].flatMap(([rule, ruleKeys]) =>
    [...ruleKeys].flatMap((key) => {
      const verdict = classifyKey(key);
      return verdict.ok ? [] : [{ rule, key, reason: verdict.reason }];
    }),
  );
}

/** Rules for which the probe surface validated nothing at all. */
function rulesWithoutKeys(keys: Map<string, Set<string>>, exempt: Set<string>) {
  return [...keys]
    .filter(([rule, ruleKeys]) => ruleKeys.size === 0 && !exempt.has(rule))
    .map(([rule]) => rule);
}

/**
 * An exemption is stale when its rule produces keys after all, and equally when
 * the rule no longer exists — both leave a licence to skip lying around.
 */
function staleExemptions(
  keys: Map<string, Set<string>>,
  exempt: readonly { rule: string }[],
) {
  return exempt
    .filter(({ rule }) => (keys.get(rule)?.size ?? 0) > 0 || !keys.has(rule))
    .map(({ rule }) => rule);
}

const corpus = captureVisitorKeys(
  rules as unknown as Record<string, TSESLint.AnyRuleModule>,
);

/**
 * Snapshotted the moment the real population is captured, because the planted
 * controls below travel the same function and would otherwise fold their own
 * (schema-less) counts into the accounting for this one.
 */
const optionSweepTotals = {
  armsDriven: optionSweep.armsDriven,
  rulesDrivenWithOptions: new Set(optionSweep.rulesDrivenWithOptions),
};

const optionedRuleNames = Object.keys(rules).filter(
  (name) => optionSchemaOf((rules as Record<string, unknown>)[name]).length > 0,
);

/** Floors sit just under the values measured at 1.20.198. */
const OPTIONED_RULE_FLOOR = 68; // measured 71
const OPTION_ARM_FLOOR = 390; // measured 407

const findings = invalidKeys(corpus.keys);
const allowed = new Set(ALLOWED.map((a) => allowKey(a.rule, a.key)));
const exemptZeroKey = new Set(EXEMPT_ZERO_KEY.map((e) => e.rule));

/** A key that matches nothing, planted to prove the classifier still fires. */
const PLANTED_TYPO_RULE = {
  meta: { type: 'problem', schema: [], messages: {} },
  create: () => ({
    NotARealNode: () => undefined,
    CallExpression: () => undefined,
  }),
} as unknown as TSESLint.AnyRuleModule;

/** A rule no probe can unlock, planted to prove the per-rule floor still fires. */
const PLANTED_SILENT_RULE = {
  meta: { type: 'problem', schema: [], messages: {} },
  create: () => ({}),
} as unknown as TSESLint.AnyRuleModule;

describe('visitor key validity', () => {
  // Without this the suite passes whenever the classifier is broken, since a
  // classifier that accepts everything reports no dead keys at all.
  it('rejects planted typos and accepts a real selector', () => {
    expect(classifyKey('CallExpresion').ok).toBe(false);
    expect(classifyKey('MemberExpresion:exit').ok).toBe(false);
    expect(classifyKey('CallExpression > Identifier.callee').ok).toBe(true);
    expect(classifyKey('Program:exit').ok).toBe(true);
    expect(classifyKey('onCodePathStart').ok).toBe(true);
  });

  // The controls run the planted rules through the real capture path, so a
  // capture layer that silently stops reading visitors — the defect this guard
  // exists to prevent — turns the suite red instead of green.
  it('catches a planted dead key and a planted empty visitor', () => {
    const control = captureVisitorKeys({
      'planted-typo': PLANTED_TYPO_RULE,
      'planted-silent': PLANTED_SILENT_RULE,
    });

    expect(control.holes).toEqual([]);
    expect(control.keys.get('planted-typo')?.size).toBe(2);
    expect(invalidKeys(control.keys).map((f) => `${f.rule}: ${f.key}`)).toEqual(
      ['planted-typo: NotARealNode'],
    );
    expect(rulesWithoutKeys(control.keys, new Set())).toEqual([
      'planted-silent',
    ]);
    expect(rulesWithoutKeys(control.keys, new Set(['planted-silent']))).toEqual(
      [],
    );

    // Two-way exemption enforcement: a licence granted to a rule that produces
    // keys is stale, and so is one naming a rule that is not registered.
    expect(staleExemptions(control.keys, [{ rule: 'planted-typo' }])).toEqual([
      'planted-typo',
    ]);
    expect(staleExemptions(control.keys, [{ rule: 'planted-silent' }])).toEqual(
      [],
    );
    expect(staleExemptions(control.keys, [{ rule: 'planted-absent' }])).toEqual(
      ['planted-absent'],
    );
  });

  it('captures a visitor object for every registered rule and probe', () => {
    // A probe that never reached `create()` validated nothing, so it is a hole
    // in coverage rather than a pass.
    expect(corpus.holes).toEqual([]);
    expect(corpus.keys.size).toBe(Object.keys(rules).length);
  });

  it('drives every optioned rule under a schema-valid non-default payload', () => {
    /**
     * A probe surface that configures every rule at bare `'error'` measures the
     * DEFAULT configuration and nothing else, so an option consumed at `create`
     * time — a pattern list compiled before any visitor object exists — is
     * entered by no probe in it. Named rather than floored: a rule that drops
     * out of the option sweep must say which one it is.
     */
    const undriven = optionedRuleNames.filter(
      (name) => !optionSweepTotals.rulesDrivenWithOptions.has(name),
    );
    expect(undriven).toEqual([]);
    expect(optionedRuleNames.length).toBeGreaterThanOrEqual(
      OPTIONED_RULE_FLOOR,
    );
    expect(optionSweepTotals.armsDriven).toBeGreaterThanOrEqual(
      OPTION_ARM_FLOOR,
    );
  });

  it('validates at least one visitor key for every rule', () => {
    // The real gate. An empty visitor object satisfies every key check
    // vacuously, so a rule whose gates no probe reaches must fail loudly
    // instead of inflating the population.
    expect(rulesWithoutKeys(corpus.keys, exemptZeroKey)).toEqual([]);
  });

  it('holds no stale zero-key exemption', () => {
    expect(staleExemptions(corpus.keys, EXEMPT_ZERO_KEY)).toEqual([]);
  });

  it('checks a non-trivial number of visitor keys', () => {
    const totalKeys = [...corpus.keys.values()].reduce(
      (sum, keys) => sum + keys.size,
      0,
    );
    // Scaled to the population rather than fixed, so growth cannot outrun it
    // and shrinkage cannot hide beneath it. The per-rule floor above is the
    // real gate; this only catches a systemic collapse — a capture path that
    // truncates visitor objects to a single key would pass every per-rule
    // check while validating almost nothing.
    expect(totalKeys).toBeGreaterThanOrEqual(corpus.keys.size * 2);
  });

  it('registers no visitor key that matches nothing', () => {
    const unlisted = findings.filter(
      (f) => !allowed.has(allowKey(f.rule, f.key)),
    );
    expect(
      unlisted.map((f) => `${f.rule}: ${JSON.stringify(f.key)} — ${f.reason}`),
    ).toEqual([]);
  });

  it('holds no stale entry in the allowed list', () => {
    const live = new Set(findings.map((f) => allowKey(f.rule, f.key)));
    const stale = ALLOWED.filter((a) => !live.has(allowKey(a.rule, a.key))).map(
      (a) => `${a.rule}: ${JSON.stringify(a.key)}`,
    );
    expect(stale).toEqual([]);
  });
});
