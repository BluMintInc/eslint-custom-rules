import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';
import {
  harvestFixtureCorpus,
  defaultFilenameFor,
  defineCorpusParsers,
  parserKeyFor,
  parserOptionsFor,
  severityWithOptions,
  FixtureCase,
} from '../utils/fixtureCorpus';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, RuleShape>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

// The crash probe drives every harvested fixture of an optioned rule against
// every option object its schema permits: 72k lints, and the heaviest single
// rule measures 2.3s against a 5s default. The budget sits far enough above
// that for a loaded CI runner, and far enough below a hang to still fail.
jest.setTimeout(120_000);

const PREFIX = '@blumintinc/blumint/';
const RULES_DIR = path.join(__dirname, '../rules');

/**
 * `meta.schema` is a promise to consumers: every option it accepts must both do
 * something and be survivable. Two failures hide behind it, and neither the
 * RuleTester nor any sweep of real code can see them.
 *
 * An option declared in the schema but never read is silently ignored — ESLint
 * validates the config, reports nothing, and the consumer's setting has no
 * effect. There is no error anywhere; the rule just behaves as if unconfigured.
 *
 * An option read without guarding its shape crashes the rule. `{}` is legal
 * against nearly every schema here (properties are optional), so
 * `const { list } = context.options[0]; list.includes(x)` throws a TypeError for
 * anyone who writes `['error', {}]` — and an exception inside a rule aborts the
 * lint run for that file, taking all other rules with it.
 *
 * Both directions carry a planted-defect control. A guard that could not go red
 * guards nothing.
 */

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  instanceof?: string;
};

type RuleShape = {
  meta?: { schema?: JsonSchema | JsonSchema[] };
};

type AstNode = {
  type?: string;
  name?: string;
  value?: unknown;
  range?: [number, number];
  key?: AstNode;
  literal?: AstNode;
  [key: string]: unknown;
};

const PARSER_OPTIONS = {
  ecmaVersion: 2022 as const,
  sourceType: 'module' as const,
  ecmaFeatures: { jsx: true },
};

const parseOptions = { ...PARSER_OPTIONS, range: true, loc: true };

const parse = (text: string, jsx: boolean): AstNode =>
  tsParser.parse(text, {
    ...parseOptions,
    ecmaFeatures: { jsx },
  }) as AstNode;

/** Parses a rule/test source, retrying without JSX for `<T,>`-style generics. */
const parseSource = (text: string): AstNode | null => {
  try {
    return parse(text, true);
  } catch {
    try {
      return parse(text, false);
    } catch {
      return null;
    }
  }
};

const walk = (node: unknown, visit: (n: AstNode) => void): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  const candidate = node as AstNode;
  if (typeof candidate.type !== 'string') return;
  visit(candidate);
  for (const key of Object.keys(candidate)) {
    if (key === 'parent') continue;
    walk(candidate[key], visit);
  }
};

/** Every property name reachable anywhere in a schema. */
const schemaPropertyNames = (
  schema: JsonSchema | JsonSchema[] | undefined,
  acc = new Set<string>(),
): Set<string> => {
  if (!schema || typeof schema !== 'object') return acc;
  if (Array.isArray(schema)) {
    schema.forEach((entry) => schemaPropertyNames(entry, acc));
    return acc;
  }
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    acc.add(key);
    schemaPropertyNames(sub, acc);
  }
  if (schema.items) schemaPropertyNames(schema.items, acc);
  if (typeof schema.additionalProperties === 'object') {
    schemaPropertyNames(schema.additionalProperties, acc);
  }
  for (const branch of [schema.anyOf, schema.oneOf, schema.allOf]) {
    if (branch) schemaPropertyNames(branch, acc);
  }
  return acc;
};

/**
 * Ranges that merely DECLARE an option rather than read it: all of `meta` (the
 * schema lives there, and a mention in `messages` or `docs` is prose),
 * `defaultOptions`, and the `Options` type alias. The type alias matters most —
 * every optioned rule restates each option name there, so counting it as a read
 * would let a rule that parses its options and then ignores them pass.
 */
const DECLARATION_TYPES = new Set([
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
]);

const declarationRanges = (ast: AstNode): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  walk(ast, (node) => {
    if (node.type && DECLARATION_TYPES.has(node.type) && node.range) {
      ranges.push(node.range);
      return;
    }
    if (node.type !== 'Property') return;
    const keyName = node.key?.name;
    if (keyName !== 'meta' && keyName !== 'defaultOptions') return;
    const value = node.value as AstNode | undefined;
    if (value?.range) ranges.push(value.range);
  });
  return ranges;
};

/** Identifier, string-literal and literal-type occurrences of `name`. */
const referenceRanges = (
  ast: AstNode,
  name: string,
): Array<[number, number]> => {
  const hits: Array<[number, number]> = [];
  walk(ast, (node) => {
    const matches =
      (node.type === 'Identifier' && node.name === name) ||
      (node.type === 'Literal' && node.value === name) ||
      (node.type === 'TSLiteralType' && node.literal?.value === name);
    if (matches && node.range) hits.push(node.range);
  });
  return hits;
};

const isInside = (
  range: [number, number],
  ranges: Array<[number, number]>,
): boolean =>
  ranges.some(([start, end]) => range[0] >= start && range[1] <= end);

/** Option names the rule source never reads outside meta/defaultOptions. */
const unreadOptions = (source: string, names: Set<string>): string[] => {
  const ast = parseSource(source);
  if (!ast) return [];
  const declared = declarationRanges(ast);
  return [...names].filter(
    (name) =>
      referenceRanges(ast, name).filter((r) => !isInside(r, declared))
        .length === 0,
  );
};

const rulesWithOptions = Object.entries(plugin.rules)
  .map(([name, rule]) => ({
    name,
    names: schemaPropertyNames(rule.meta?.schema),
  }))
  .filter(({ names }) => names.size > 0);

describe('schema options are read', () => {
  it('flags a planted dead option and clears a live one (control)', () => {
    const source = (readsIt: boolean) => `
      export const rule = createRule({
        name: 'r',
        meta: {
          type: 'suggestion',
          docs: { description: 'mentions plantedOption in prose' },
          schema: [{ type: 'object', properties: { plantedOption: { type: 'array' } } }],
          messages: { m: 'set plantedOption to allow this' },
        },
        defaultOptions: [{ plantedOption: [] }],
        create(context) {
          ${
            readsIt
              ? 'const [{ plantedOption }] = context.options; return { Identifier() { void plantedOption; } };'
              : 'return { Identifier() {} };'
          }
        },
      });
    `;
    const names = new Set(['plantedOption']);
    expect(unreadOptions(source(false), names)).toEqual(['plantedOption']);
    expect(unreadOptions(source(true), names)).toEqual([]);
  });

  it('covers every rule declaring schema properties', () => {
    expect(rulesWithOptions.length).toBeGreaterThan(50);
  });

  it.each(rulesWithOptions.map(({ name, names }) => [name, names] as const))(
    '%s reads every option it declares',
    (name, names) => {
      const source = path.join(RULES_DIR, `${name}.ts`);
      expect(fs.existsSync(source)).toBe(true);
      const parsed = parseSource(fs.readFileSync(source, 'utf8'));
      expect(parsed).not.toBeNull();
      expect(unreadOptions(fs.readFileSync(source, 'utf8'), names)).toEqual([]);
    },
  );
});

/** Minimal and populated sample values for a property schema. */
const samplesFor = (schema: JsonSchema | undefined): [unknown, unknown] => {
  if (!schema || typeof schema !== 'object') return [undefined, undefined];
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return [schema.enum[0], schema.enum[schema.enum.length - 1]];
  }
  // A union must be sampled from its branches. Sampling the wrapper yields
  // `undefined`, which is not a legal config value and fakes a crash.
  for (const branch of [schema.anyOf, schema.oneOf, schema.allOf]) {
    if (!branch?.length) continue;
    const legal = branch
      .flatMap((entry) => samplesFor(entry))
      .filter((v) => v !== undefined);
    if (legal.length) return [legal[0], legal[legal.length - 1]];
  }
  if (schema.instanceof === 'RegExp') return [/a/, /b/g];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'string':
      return ['', 'x'];
    case 'number':
    case 'integer':
      return [0, 1];
    case 'boolean':
      return [false, true];
    case 'array': {
      const [, item] = samplesFor(schema.items ?? { type: 'string' });
      return [[], item === undefined ? [] : [item]];
    }
    case 'object': {
      const populated: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        populated[key] = samplesFor(sub)[1];
      }
      return [{}, populated];
    }
    default:
      return [undefined, undefined];
  }
};

/** Schema-valid option arrays worth trying, sparsest first. */
const optionCandidates = (
  schema: JsonSchema | JsonSchema[] | undefined,
): Array<{ label: string; options: unknown[] }> => {
  const first = Array.isArray(schema) ? schema[0] : schema;
  if (!first || typeof first !== 'object') return [];
  const out: Array<{ label: string; options: unknown[] }> = [];
  const push = (label: string, value: unknown) =>
    out.push({ label, options: [value] });

  const type = Array.isArray(first.type) ? first.type[0] : first.type;
  if (type === 'object' || first.properties) {
    push('{}', {});
    const props = Object.entries(first.properties ?? {});
    const minimal: Record<string, unknown> = {};
    const populated: Record<string, unknown> = {};
    for (const [key, sub] of props) {
      const [min, max] = samplesFor(sub);
      if (min !== undefined) minimal[key] = min;
      if (max !== undefined) populated[key] = max;
      if (min !== undefined) push(`{${key}: minimal}`, { [key]: min });
      if (max !== undefined) push(`{${key}: populated}`, { [key]: max });
    }
    if (props.length > 1) {
      push('all-minimal', minimal);
      push('all-populated', populated);
    }
  } else {
    for (const value of samplesFor(first)) {
      if (value !== undefined) push(JSON.stringify(value), value);
    }
  }
  return out;
};

/**
 * A rule's own fixtures are the one corpus guaranteed to trigger it, which is
 * what keeps the crash probe from passing vacuously on code the rule ignores.
 *
 * They are taken from `harvestFixtureCorpus`, which loads each suite with `run`
 * shadowed and captures the real case objects. Text-scraping the suite source
 * for its string literals — the method this replaces — silently loses three
 * things at once, and each loss reads as a clean sweep: a case assembled by
 * interpolation is invisible entirely, a case that does survive arrives
 * stripped of the `filename` and `options` it was written for, and a snippet
 * cap decides which of the survivors are probed at all. Measured against the
 * scrape it replaces: 10,624 cases and 71 of 71 optioned rules reporting, up
 * from 565 capped snippets under two hard-coded paths.
 */
const corpus = harvestFixtureCorpus();

const fixturesFor = (ruleName: string): readonly FixtureCase[] =>
  corpus.byRule.get(ruleName) || [];

const linter = new Linter();
defineCorpusParsers(linter);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

/**
 * A case is linted under the parser its own tester declared and the filename
 * its own code implies. Handing a JSON fixture to `@typescript-eslint/parser`,
 * or JSX to a `.ts` path, is a FATAL parse — and since a crash probe only asks
 * whether the rule threw, a fatal parse is indistinguishable from a rule that
 * survived every option it was handed.
 */
const configFor = (
  ruleId: string,
  options: unknown[],
  testCase: FixtureCase,
) => ({
  parser: parserKeyFor(testCase),
  parserOptions: parserOptionsFor(testCase),
  rules: { [ruleId]: ['error', ...options] as unknown as Linter.RuleLevel },
});

const throwsWith = (
  ruleId: string,
  options: unknown[],
  testCase: FixtureCase,
): string | null => {
  try {
    linter.verify(
      testCase.code,
      configFor(ruleId, options, testCase) as never,
      {
        filename: defaultFilenameFor(testCase),
      },
    );
    return null;
  } catch (error) {
    return String((error as Error).message).split('\n')[0];
  }
};

describe('rules survive every schema-valid option object', () => {
  it('catches a planted unguarded-option crash (control)', () => {
    const controlId = '__control__/crashes-on-empty-options';
    linter.defineRule(controlId, {
      meta: {
        type: 'suggestion',
        schema: [{ type: 'object', properties: { list: { type: 'array' } } }],
        messages: { m: 'x' },
      },
      create(context) {
        const [{ list }] = context.options as [{ list: string[] }];
        return {
          Identifier(node: { name: string }) {
            if (list.includes(node.name))
              context.report({ node, messageId: 'm' } as never);
          },
        };
      },
    } as never);

    const controlCase: FixtureCase = {
      code: 'const a = 1;',
      filename: '/repo/src/x.ts',
      tester: 'ruleTesterTs',
      language: 'ts',
      origin: 'rule-options-safety.test.ts',
      bucket: 'valid',
    };
    expect(throwsWith(controlId, [], controlCase)).not.toBeNull();
    expect(throwsWith(controlId, [{ list: [] }], controlCase)).toBeNull();
  });

  /**
   * The crash probe only exercises option-reading code the fixture actually
   * reaches. A corpus the rules stay silent on would keep every assertion below
   * green while driving nothing, so hold floors on how much of the corpus is
   * considered and on how many rules it genuinely triggers.
   *
   * Each fixture is driven under its OWN declared options, which is what the
   * text scrape could not do: an option read only on the report path never runs
   * for a rule whose author gated the report behind a setting.
   */
  it('drives a corpus the rules actually report on (non-vacuity)', () => {
    let cases = 0;
    const triggered = rulesWithOptions.filter(({ name }) => {
      const ruleId = PREFIX + name;
      const fixtures = fixturesFor(name);
      cases += fixtures.length;
      return fixtures.some((testCase) => {
        try {
          return linter
            .verify(
              testCase.code,
              configFor(
                ruleId,
                (testCase.options as unknown[]) || [],
                testCase,
              ) as never,
              { filename: defaultFilenameFor(testCase) },
            )
            .some((m) => m.ruleId === ruleId && !m.fatal);
        } catch {
          return false;
        }
      });
    });

    // Measured: 10,624 cases, 71 of 71 optioned rules reporting. The scrape this
    // replaces reached 565 capped snippets and 50-odd rules.
    expect(cases).toBeGreaterThanOrEqual(10000);
    expect(triggered.length).toBeGreaterThanOrEqual(68);
  });

  it.each(
    rulesWithOptions
      .map(({ name }) => ({
        name,
        candidates: optionCandidates(plugin.rules[name].meta?.schema),
        fixtures: fixturesFor(name),
      }))
      .filter(
        ({ candidates, fixtures }) =>
          candidates.length > 0 && fixtures.length > 0,
      )
      .map((entry) => [entry.name, entry] as const),
  )('%s accepts any option object its schema permits', (_name, entry) => {
    const ruleId = PREFIX + entry.name;
    const failures: string[] = [];

    for (const testCase of entry.fixtures) {
      // A rule that already throws unconfigured (e.g. one needing type
      // information) is not an options-shaped defect; only the delta counts.
      if (throwsWith(ruleId, [], testCase) !== null) continue;
      /**
       * The fixture's own options are probed alongside the schema-derived ones.
       * A schema sample is a shape the schema permits; the declared options are
       * the shape the rule's author actually wrote, and the two coincide only by
       * accident.
       */
      const declared = severityWithOptions(testCase);
      const candidates = Array.isArray(declared)
        ? [
            { label: 'declared', options: declared.slice(1) },
            ...entry.candidates,
          ]
        : entry.candidates;
      for (const candidate of candidates) {
        const message = throwsWith(ruleId, candidate.options, testCase);
        if (message) {
          failures.push(
            `${testCase.origin} options ${candidate.label}: ${message}`,
          );
        }
      }
    }

    expect([...new Set(failures)]).toEqual([]);
  });
});
