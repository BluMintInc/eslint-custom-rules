import fs from 'fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/utils';

// Using require to avoid test build-time ESM interop issues; the guard only
// needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: { schema?: unknown } }>;
};

/**
 * An option no test ever passes is a latent INERT option.
 *
 * `schema-option-safety` already guards options a rule declares but never
 * *reads*. The layer below that is an option which is read and still cannot
 * change any outcome — #1397 (`allowComplexBodies`), #1504 (`ignoreHocs`) and
 * #1505 (`guardFunctions`). All three shipped enabled as `'error'`, all three
 * were documented as working escape hatches, and none was exercised by a single
 * test case. That is not a coincidence: an option nobody wrote a test for is an
 * option nobody had to make work.
 *
 * #1505 is the sharpest example of why reading the source is not enough to catch
 * this. Its read was `void (options?.guardFunctions ?? DEFAULT_GUARD_FUNCTIONS);`
 * — a discard that satisfies the never-read guard completely while doing
 * nothing. Only exercising the option from a test can distinguish the two.
 *
 * So this asserts coverage, not correctness: every option name reachable in a
 * rule's `meta.schema` must appear in at least one `options:` payload in that
 * rule's test file. It cannot prove an exercised option is live, but it stops the
 * population of never-exercised ones from growing.
 *
 * The pre-existing gaps are baselined below. The baseline is checked BOTH ways —
 * an entry that is no longer unexercised (or no longer declared) fails and must
 * be deleted. Without that, a stale exemption silently absorbs the next real gap,
 * which is exactly how the docs-conformance guard hid 62 skipped pages (#1499).
 */

/**
 * The only options no test exercises, and both are here because they are
 * *provably inert* rather than merely untested — each is blocked on a product
 * decision (make it work, or delete it), so there is no behaviour to write a
 * test against.
 *
 * Shrink this; never extend it. An untested option belongs in a test, not here:
 * every one of the other 30 gaps this guard originally baselined turned out to
 * be a live code path, and all of them were closed by exercising the option.
 */
const BASELINE: Record<string, readonly string[]> = {
  // Its recognition check and the identifier check are mutually exclusive by
  // node type and both land on the same `continue`, so no dependency-array
  // element can reach it (#1507).
  'enforce-stable-hash-spread-props': ['allowedHashFunctions'],
  // Registering an HOC-wrapped component sets `returnsJsx: false`, so both the
  // configured and unconfigured paths skip (#1504).
  'no-unmemoized-memo-without-props': ['ignoreHocs'],
};

/**
 * Every property name reachable anywhere in a JSON schema, including nested
 * object options (`hashImport.source`), so a sub-key cannot hide.
 */
function schemaOptionNames(
  schema: unknown,
  acc = new Set<string>(),
): Set<string> {
  if (!schema || typeof schema !== 'object') return acc;
  if (Array.isArray(schema)) {
    schema.forEach((entry) => schemaOptionNames(entry, acc));
    return acc;
  }
  const node = schema as Record<string, unknown>;
  if (node.properties && typeof node.properties === 'object') {
    for (const [key, sub] of Object.entries(node.properties)) {
      acc.add(key);
      schemaOptionNames(sub, acc);
    }
  }
  for (const key of ['items', 'additionalProperties', 'patternProperties']) {
    if (node[key] && typeof node[key] === 'object')
      schemaOptionNames(node[key], acc);
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(node[key])) schemaOptionNames(node[key], acc);
  }
  return acc;
}

function walk(node: unknown, visit: (n: TSESTree.Node) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((entry) => walk(entry, visit));
    return;
  }
  const candidate = node as Record<string, unknown>;
  if (typeof candidate.type === 'string') visit(node as TSESTree.Node);
  for (const key of Object.keys(candidate)) {
    if (key === 'parent') continue;
    walk(candidate[key], visit);
  }
}

/** Property names appearing anywhere inside an `options:` payload. */
function optionNamesUsedInTests(source: string): Set<string> {
  const used = new Set<string>();
  walk(
    parse(source, { jsx: true, loc: true, range: true, comment: true }),
    (node) => {
      if (node.type !== 'Property') return;
      const key = node.key as TSESTree.Node & {
        name?: string;
        value?: unknown;
      };
      if ((key.name ?? key.value) !== 'options') return;
      walk(node.value, (inner) => {
        if (inner.type !== 'Property') return;
        const innerKey = inner.key as TSESTree.Node & {
          name?: string;
          value?: unknown;
        };
        const name = innerKey.name ?? innerKey.value;
        if (typeof name === 'string') used.add(name);
      });
    },
  );
  return used;
}

type RuleCoverage = {
  rule: string;
  declared: Set<string>;
  unexercised: string[];
};

const coverage: RuleCoverage[] = [];
let rulesWithOptions = 0;
let totalOptionNames = 0;

for (const [rule, definition] of Object.entries(plugin.rules)) {
  const declared = schemaOptionNames(definition?.meta?.schema);
  if (declared.size === 0) continue;
  rulesWithOptions += 1;
  totalOptionNames += declared.size;

  const testPath = path.join(__dirname, `${rule}.test.ts`);
  if (!fs.existsSync(testPath)) continue;

  const used = optionNamesUsedInTests(fs.readFileSync(testPath, 'utf8'));
  coverage.push({
    rule,
    declared,
    unexercised: [...declared].filter((name) => !used.has(name)).sort(),
  });
}

describe('rule option test coverage', () => {
  /**
   * A guard that measured nothing would pass silently, so pin the population it
   * actually walked. These are floors, not equalities — adding rules is fine.
   */
  it('measured the option population (guards against a vacuous pass)', () => {
    expect(rulesWithOptions).toBeGreaterThanOrEqual(50); // measured 71
    expect(totalOptionNames).toBeGreaterThanOrEqual(140); // measured 176
    expect(coverage.length).toBeGreaterThanOrEqual(50); // measured 71
  });

  it.each(coverage.map((entry) => [entry.rule, entry] as const))(
    '%s exercises every option it declares',
    (rule, entry) => {
      const baselined = new Set(BASELINE[rule] ?? []);
      const unguarded = entry.unexercised.filter(
        (name) => !baselined.has(name),
      );
      expect({ rule, unexercised: unguarded }).toEqual({
        rule,
        unexercised: [],
      });
    },
  );

  /**
   * Checked the other way round: a baseline entry that is now covered — or whose
   * option no longer exists — is stale and must be deleted, or it silently
   * absorbs the next real gap.
   */
  it('has no stale baseline entries', () => {
    const byRule = new Map(coverage.map((entry) => [entry.rule, entry]));
    const stale: string[] = [];

    for (const [rule, options] of Object.entries(BASELINE)) {
      const entry = byRule.get(rule);
      if (!entry) {
        stale.push(
          `${rule}: rule no longer declares options (or has no test file)`,
        );
        continue;
      }
      for (const option of options) {
        if (!entry.declared.has(option)) {
          stale.push(`${rule}.${option}: no longer declared in meta.schema`);
        } else if (!entry.unexercised.includes(option)) {
          stale.push(
            `${rule}.${option}: now exercised — remove it from BASELINE`,
          );
        }
      }
    }

    expect(stale).toEqual([]);
  });
});
