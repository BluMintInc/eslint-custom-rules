import { Linter } from 'eslint';
import { TSESLint } from '@typescript-eslint/utils';
import { rules } from '../index';
import {
  harvestFixtureCorpus,
  defineCorpusParsers,
  defaultFilenameFor,
  parserOptionsFor,
  parserKeyFor,
  severityWithOptions,
  FixtureCase,
} from '../utils/fixtureCorpus';

/**
 * Does every visitor key a rule registers actually FIRE?
 *
 * `visitor-key-validity` is the adjacent guard, and it validates only the node
 * TYPE identifiers inside a parsed selector. esquery parses `[callee.name="x"]`
 * as an `attribute` and `.callee` as a `field`, so a misspelled attribute path
 * or an impossible one is a perfectly legal selector that matches no node and
 * is classified valid. The handler beneath it never runs — no error, no
 * warning, no failing test — and the rule is silently inert for that shape.
 *
 * That is not hypothetical. `enforce-centralized-mock-firestore` shipped
 * `AwaitExpression > CallExpression[callee.type="ImportExpression"]`, which
 * cannot match: `await import(...)` puts an `ImportExpression` directly under
 * the `AwaitExpression`. Its node types are all real, so the adjacent guard
 * passed it (#1967).
 *
 * The oracle here is LIVENESS rather than a re-implementation of the selector
 * spec: wrap every handler a rule returns, lint that rule's OWN harvested
 * fixtures, and record which keys were invoked. It uses ESLint's real matcher,
 * so it cannot disagree with production about what a selector means.
 *
 * SCOPE, stated as a limit rather than as coverage. A key that never fires has
 * two possible causes and this instrument cannot separate them: the selector is
 * impossible, or the rule's own fixtures simply never contain the shape. So a
 * dead key is a FINDING TO TRIAGE, not a proven defect — every entry in the
 * baseline below was checked by hand against a source built to match it. The
 * corpus-wide variant of this question ("does the selector match anything in
 * any fixture?") was measured and REJECTED as an oracle: it nominated all 18 of
 * `enforce-exported-function-types`' qualified-name selectors, each of which
 * does match a hand-written source. Breadth of corpus is not evidence of
 * impossibility.
 *
 * What the gate is really for is the NEXT one. A newly-registered key that
 * matches nothing is absent from the baseline and fails here immediately.
 */

/** Visitor keys that are events rather than node selectors; they never match. */
const CODE_PATH_EVENTS = new Set([
  'onCodePathStart',
  'onCodePathEnd',
  'onCodePathSegmentStart',
  'onCodePathSegmentEnd',
  'onCodePathSegmentLoop',
]);

const REASONS = {
  /**
   * The selector is matchable — verified by hand against a source built for it
   * — but no fixture in the rule's own corpus contains the shape. A test-
   * coverage gap, not an inert selector.
   */
  noFixtureForShape:
    "matchable by hand, but the rule's own corpus carries no fixture of this shape",
} as const;

/**
 * Keys measured dead over their rule's own corpus, each with the reason it is
 * not a defect.
 *
 * Enforced BOTH ways by the assertions below: an unlisted dead key fails, and a
 * listed key that starts firing (or that its rule stops registering) fails as a
 * stale licence. That is what keeps this from decaying into a blanket amnesty
 * the way a one-directional allowlist does.
 *
 * `enforce-exported-function-types` accounts for 22 of the 38: it registers a
 * LADDER of selectors enumerating TSQualifiedName nesting depths one through
 * five, under both a `FunctionDeclaration` and an arrow `VariableDeclarator`
 * (18 rungs), plus 4 return-type rungs. Every one matches a source built for
 * it — `export function Foo(p: A.B) {}` drives the depth-1 rung, `A.B.C.D.E.F`
 * the depth-5, `export function Foo(): Bar {}` a return-type rung — but the
 * rule's fixtures never type an uppercase-named function with a qualified name.
 *
 * The remaining 16 are bare node types (`SwitchStatement`, `MethodDefinition`,
 * `AssignmentExpression`, `FunctionExpression`, `JSXFragment`), which are
 * matchable by construction: the rule returned the key, so the only question
 * was whether a fixture carries that node, and none does.
 */
const DEAD_KEYS: Record<string, Record<string, string>> = {
  'prefer-block-comments-for-declarations': {
    MethodDefinition: REASONS.noFixtureForShape,
  },
  'no-unused-props': {
    JSXFragment: REASONS.noFixtureForShape,
  },
  'enforce-storage-context': {
    SwitchStatement: REASONS.noFixtureForShape,
    'SwitchStatement:exit': REASONS.noFixtureForShape,
    ForStatement: REASONS.noFixtureForShape,
    'ForStatement:exit': REASONS.noFixtureForShape,
    ForInStatement: REASONS.noFixtureForShape,
    'ForInStatement:exit': REASONS.noFixtureForShape,
    ForOfStatement: REASONS.noFixtureForShape,
    'ForOfStatement:exit': REASONS.noFixtureForShape,
  },
  'enforce-exported-function-types': {
    'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > TSTypeAnnotation > TSTypeReference':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > TSTypeAnnotation > TSTypeReference':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > Identifier':
      REASONS.noFixtureForShape,
    'FunctionDeclaration[id.name=/^[A-Z]/] > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
    'VariableDeclarator[id.name=/^[A-Z]/] > ArrowFunctionExpression > Identifier[typeAnnotation] > TSTypeAnnotation > TSTypeReference > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName > TSQualifiedName':
      REASONS.noFixtureForShape,
  },
  'enforce-stable-hash-spread-props': {
    'FunctionExpression:exit': REASONS.noFixtureForShape,
  },
  'prefer-global-router-state-key': {
    AssignmentExpression: REASONS.noFixtureForShape,
  },
  'enforce-querykey-ts': {
    AssignmentExpression: REASONS.noFixtureForShape,
  },
  'no-res-error-status-in-onrequest': {
    FunctionExpression: REASONS.noFixtureForShape,
  },
  'no-console-error': {
    FunctionExpression: REASONS.noFixtureForShape,
    'FunctionExpression:exit': REASONS.noFixtureForShape,
  },
};

const corpus = harvestFixtureCorpus();

type Liveness = {
  declared: Set<string>;
  fired: Set<string>;
  casesLinted: number;
  /** Fixtures this harness could not drive at all; a hole, not a pass. */
  skipped: number;
};

/**
 * Counts handler invocations per visitor key while linting a rule's fixtures.
 *
 * The visitor is captured from a real lint rather than by calling `create()`
 * with a stub context: a stub that throws on an unexpected accessor would drop
 * rules from the population silently, understating coverage while still looking
 * like a pass. Taking the rule map as a parameter lets the planted controls
 * travel this exact path, so a capture layer that stops capturing turns the
 * suite red instead of green.
 */
function measureLiveness(
  ruleMap: Record<string, TSESLint.AnyRuleModule>,
  casesFor: (name: string) => FixtureCase[],
): Map<string, Liveness> {
  const out = new Map<string, Liveness>();

  for (const [name, rule] of Object.entries(ruleMap)) {
    const declared = new Set<string>();
    const fired = new Set<string>();
    let casesLinted = 0;
    let skipped = 0;

    const linter = new Linter();
    defineCorpusParsers(linter);
    const ruleId = `probe/${name}`;

    linter.defineRule(ruleId, {
      ...(rule as unknown as Linter.RuleModule),
      create(context: unknown) {
        const visitors = (
          rule as unknown as { create: (ctx: unknown) => unknown }
        ).create(context) as Record<string, unknown>;
        if (!visitors || typeof visitors !== 'object') return {};
        const wrapped: Record<string, unknown> = {};
        for (const [key, handler] of Object.entries(visitors)) {
          declared.add(key);
          if (typeof handler !== 'function') {
            wrapped[key] = handler;
            continue;
          }
          wrapped[key] = (...args: unknown[]) => {
            fired.add(key);
            return (handler as (...a: unknown[]) => unknown)(...args);
          };
        }
        return wrapped;
      },
    } as Linter.RuleModule);

    for (const testCase of casesFor(name)) {
      try {
        linter.verify(
          testCase.code,
          {
            parser: parserKeyFor(testCase),
            parserOptions: parserOptionsFor(testCase) as Linter.ParserOptions,
            rules: {
              [ruleId]: severityWithOptions(
                testCase,
              ) as Linter.RuleLevelAndOptions,
            },
          },
          defaultFilenameFor(testCase),
        );
        casesLinted++;
      } catch {
        skipped++;
      }
    }
    out.set(name, { declared, fired, casesLinted, skipped });
  }
  return out;
}

type DeadKey = { rule: string; key: string };

const deadKeysIn = (liveness: Map<string, Liveness>): DeadKey[] =>
  [...liveness].flatMap(([rule, l]) =>
    [...l.declared]
      .filter((key) => !l.fired.has(key) && !CODE_PATH_EVENTS.has(key))
      .map((key) => ({ rule, key })),
  );

/**
 * A licence is stale when its key fires after all, and equally when the rule no
 * longer registers the key at all — both leave a permission to skip lying
 * around with nothing behind it.
 */
const staleEntriesIn = (
  liveness: Map<string, Liveness>,
  baseline: Record<string, Record<string, string>>,
): string[] =>
  Object.entries(baseline).flatMap(([rule, keys]) => {
    const l = liveness.get(rule);
    if (!l) return [`${rule}: rule is not registered`];
    return Object.keys(keys).flatMap((key) => {
      if (!l.declared.has(key)) {
        return [`${rule}: no longer registers ${JSON.stringify(key)}`];
      }
      if (l.fired.has(key)) {
        return [`${rule}: ${JSON.stringify(key)} now fires`];
      }
      return [];
    });
  });

const liveness = measureLiveness(
  rules as unknown as Record<string, TSESLint.AnyRuleModule>,
  (name) => corpus.byRule.get(name) || [],
);
const deadKeys = deadKeysIn(liveness);

/** A key that cannot match, planted to prove the measurement still detects one. */
const PLANTED_DEAD_RULE = {
  meta: { type: 'problem', schema: [], messages: {} },
  create: () => ({
    // Every node type here is real, so `visitor-key-validity` accepts it; the
    // ATTRIBUTE is what makes it unmatchable. This is the exact shape of #1967
    // and the reason this guard exists alongside that one.
    'CallExpression[callee.type="NotAThingThatExists"]': () => undefined,
    CallExpression: () => undefined,
  }),
} as unknown as TSESLint.AnyRuleModule;

/** A rule whose every key fires, planted as the negative control. */
const PLANTED_LIVE_RULE = {
  meta: { type: 'problem', schema: [], messages: {} },
  create: () => ({ CallExpression: () => undefined }),
} as unknown as TSESLint.AnyRuleModule;

const CONTROL_CASE: FixtureCase = {
  code: 'doSomething(1);\n',
  tester: 'ruleTesterTs',
  language: 'ts',
  origin: 'planted',
  bucket: 'valid',
};

const control = measureLiveness(
  { 'planted-dead': PLANTED_DEAD_RULE, 'planted-live': PLANTED_LIVE_RULE },
  () => [CONTROL_CASE],
);

describe('visitor key liveness', () => {
  /**
   * Without this the suite passes whenever the measurement breaks: a wrapper
   * that never records an invocation reports every key dead, and one that
   * records unconditionally reports every key live. Both planted rules travel
   * the real capture path, so either failure mode turns this red.
   */
  it('detects a planted unmatchable key and clears a planted live one', () => {
    expect(control.get('planted-dead')?.casesLinted).toBe(1);
    expect(control.get('planted-live')?.casesLinted).toBe(1);

    // The negative control: a key that DOES match must not be nominated.
    expect(deadKeysIn(control).map((d) => `${d.rule}: ${d.key}`)).toEqual([
      'planted-dead: CallExpression[callee.type="NotAThingThatExists"]',
    ]);

    // Two-way licence enforcement, on the same planted measurement.
    expect(
      staleEntriesIn(control, { 'planted-live': { CallExpression: 'x' } }),
    ).toEqual(['planted-live: "CallExpression" now fires']);
    expect(
      staleEntriesIn(control, { 'planted-dead': { NeverRegistered: 'x' } }),
    ).toEqual(['planted-dead: no longer registers "NeverRegistered"']);
    expect(staleEntriesIn(control, { 'planted-absent': { X: 'x' } })).toEqual([
      'planted-absent: rule is not registered',
    ]);
  });

  /**
   * Non-vacuity. A corpus that silently emptied, or a capture path that stopped
   * reading visitors, would make every assertion below pass while measuring
   * nothing at all.
   */
  it('measures a non-trivial surface', () => {
    expect(liveness.size).toBe(Object.keys(rules).length);
    expect(corpus.failures).toEqual([]);

    const totalDeclared = [...liveness.values()].reduce(
      (sum, l) => sum + l.declared.size,
      0,
    );
    const totalLinted = [...liveness.values()].reduce(
      (sum, l) => sum + l.casesLinted,
      0,
    );
    const totalFired = [...liveness.values()].reduce(
      (sum, l) => sum + l.fired.size,
      0,
    );

    // Scaled to the population rather than fixed, so growth cannot outrun these
    // and shrinkage cannot hide beneath them.
    expect(totalDeclared).toBeGreaterThanOrEqual(liveness.size * 2);
    expect(totalLinted).toBeGreaterThanOrEqual(10000);
    // The floor that matters: most declared keys must be OBSERVED firing, not
    // merely counted. A capture path that records nothing fails here first.
    expect(totalFired).toBeGreaterThanOrEqual(totalDeclared * 0.8);

    // Every rule must contribute a reading, or its keys were never checked.
    const unprobed = [...liveness]
      .filter(([, l]) => l.casesLinted === 0)
      .map(([rule]) => rule);
    expect(unprobed).toEqual([]);
  });

  it('registers no visitor key that never fires', () => {
    const unlisted = deadKeys.filter(
      ({ rule, key }) => !DEAD_KEYS[rule]?.[key],
    );
    expect(
      unlisted.map(({ rule, key }) => `${rule}: ${JSON.stringify(key)}`),
    ).toEqual([]);
  });

  it('holds no stale entry in the baseline', () => {
    expect(staleEntriesIn(liveness, DEAD_KEYS)).toEqual([]);
  });
});
