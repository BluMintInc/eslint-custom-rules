import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { AST_NODE_TYPES, TSESLint } from '@typescript-eslint/utils';
import { rules } from '../index';

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

const captured = new Map<string, string[]>();
const unassessed = new Map<string, string>();

/**
 * The visitor object is captured from a real lint run rather than by calling
 * `create()` with a hand-built stub: a stub that throws on an unexpected
 * accessor drops rules from the population silently, which would understate
 * coverage while still looking like a pass.
 */
function captureRule(name: string, rule: TSESLint.AnyRuleModule) {
  const linter = new Linter();
  linter.defineParser('ts', tsParser as unknown as Linter.ParserModule);
  linter.defineRule(`probe/${name}`, {
    ...(rule as unknown as Linter.RuleModule),
    create(context: unknown) {
      let visitors: unknown;
      try {
        visitors = (rule as { create: (ctx: unknown) => unknown }).create(
          context,
        );
      } catch (err) {
        unassessed.set(name, `create() threw: ${(err as Error).message}`);
        return {};
      }
      if (visitors && typeof visitors === 'object') {
        captured.set(name, Object.keys(visitors as object));
      } else {
        unassessed.set(name, 'create() returned a non-object');
      }
      return {};
    },
  } as Linter.RuleModule);

  try {
    linter.verify(
      'const x = 1;\n',
      {
        parser: 'ts',
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: { [`probe/${name}`]: 'error' },
      },
      'probe.tsx',
    );
  } catch (err) {
    if (!unassessed.has(name) && !captured.has(name)) {
      unassessed.set(name, `lint threw: ${(err as Error).message}`);
    }
  }
}

for (const [name, rule] of Object.entries(rules)) {
  captureRule(name, rule as unknown as TSESLint.AnyRuleModule);
}

const findings = [...captured].flatMap(([rule, keys]) =>
  keys.flatMap((key) => {
    const verdict = classifyKey(key);
    return verdict.ok ? [] : [{ rule, key, reason: verdict.reason }];
  }),
);

const allowKey = (rule: string, key: string) => JSON.stringify([rule, key]);
const allowed = new Set(ALLOWED.map((a) => allowKey(a.rule, a.key)));

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

  it('captures a visitor object for every registered rule', () => {
    // A rule whose visitor was never captured is a hole in coverage, not a pass.
    expect([...unassessed]).toEqual([]);
    expect(captured.size).toBe(Object.keys(rules).length);
  });

  it('checks a non-trivial number of visitor keys', () => {
    const totalKeys = [...captured.values()].reduce(
      (sum, keys) => sum + keys.length,
      0,
    );
    expect(totalKeys).toBeGreaterThan(400);
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
