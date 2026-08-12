import fs from 'fs';
import path from 'path';
import { Linter } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, RuleShape>;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsParser = require('@typescript-eslint/parser');

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

const MAX_SNIPPETS = 8;
const FILENAMES = [
  '/repo/src/components/Widget.tsx',
  '/repo/functions/src/util/helper.ts',
];

/** Byte ranges of the `invalid:` arrays declared in a RuleTester suite. */
const invalidArrayRanges = (ast: AstNode): Array<[number, number]> => {
  const ranges: Array<[number, number]> = [];
  walk(ast, (node) => {
    if (node.type !== 'Property' || !node.key) return;
    const key = (node.key.name ?? node.key.value) as unknown;
    if (key !== 'invalid') return;
    const value = node.value as AstNode | undefined;
    if (value?.type !== 'ArrayExpression' || !value.range) return;
    ranges.push(value.range);
  });
  return ranges;
};

/**
 * A rule's own test file is the one corpus guaranteed to trigger it, which is
 * what keeps this from passing vacuously on code the rule ignores.
 *
 * The ordering is load-bearing. Taking literals in AST order yields the
 * `valid:` array, which precedes `invalid:` in every suite — i.e. precisely the
 * code the rule stays SILENT on. An option read on the report or fix path never
 * runs there, so the crash probe below would drive it over code that returns
 * before reaching the option at all. Measured at v1.20.145: AST order drew 417
 * of 477 snippets from `valid:` and left 39 of 60 optioned rules reporting
 * nothing whatsoever. Taking `invalid:` first inverts that.
 */
const harvestSnippets = (ruleName: string): string[] => {
  const testFile = path.join(__dirname, `${ruleName}.test.ts`);
  if (!fs.existsSync(testFile)) return [];
  const ast = parseSource(fs.readFileSync(testFile, 'utf8'));
  if (!ast) return [];
  const ranges = invalidArrayRanges(ast);
  const reporting: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown, range?: [number, number]) => {
    if (
      typeof value !== 'string' ||
      value.length < 25 ||
      !/[;{(=<]/.test(value)
    )
      return;
    if (seen.has(value)) return;
    seen.add(value);
    const fromInvalid =
      !!range && ranges.some(([lo, hi]) => range[0] >= lo && range[1] <= hi);
    (fromInvalid ? reporting : rest).push(value);
  };
  walk(ast, (node) => {
    if (node.type === 'Literal') push(node.value, node.range);
    if (
      node.type === 'TemplateLiteral' &&
      (node.expressions as unknown[])?.length === 0
    ) {
      push(
        (node.quasis as Array<{ value: { cooked: string } }>)
          .map((q) => q.value.cooked)
          .join(''),
        node.range,
      );
    }
  });
  return [...reporting, ...rest].slice(0, MAX_SNIPPETS);
};

const linter = new Linter();
linter.defineParser('@typescript-eslint/parser', tsParser);
for (const [name, rule] of Object.entries(plugin.rules)) {
  linter.defineRule(PREFIX + name, rule as never);
}

const configFor = (ruleId: string, options: unknown[]) => ({
  parser: '@typescript-eslint/parser',
  parserOptions: PARSER_OPTIONS,
  rules: { [ruleId]: ['error', ...options] as unknown as Linter.RuleLevel },
});

const throwsWith = (
  ruleId: string,
  options: unknown[],
  code: string,
  filename: string,
): string | null => {
  try {
    linter.verify(code, configFor(ruleId, options) as never, { filename });
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

    expect(
      throwsWith(controlId, [], 'const a = 1;', '/repo/src/x.ts'),
    ).not.toBeNull();
    expect(
      throwsWith(controlId, [{ list: [] }], 'const a = 1;', '/repo/src/x.ts'),
    ).toBeNull();
  });

  /**
   * The crash probe only exercises option-reading code that the snippet
   * actually reaches. A corpus the rules stay silent on would keep every
   * assertion below green while driving nothing, so hold a floor on how many
   * rules the corpus genuinely triggers.
   */
  it('drives a corpus the rules actually report on (non-vacuity)', () => {
    const triggered = rulesWithOptions.filter(({ name }) => {
      const ruleId = PREFIX + name;
      return harvestSnippets(name).some((code) =>
        FILENAMES.some((filename) => {
          try {
            return linter
              .verify(code, configFor(ruleId, []) as never, { filename })
              .some((m) => m.ruleId === ruleId && !m.fatal);
          } catch {
            return false;
          }
        }),
      );
    });

    // AST order (valid-first) triggered 21 of 60; invalid-first triggers 50+.
    expect(triggered.length).toBeGreaterThan(45);
  });

  it.each(
    rulesWithOptions
      .map(({ name }) => ({
        name,
        candidates: optionCandidates(plugin.rules[name].meta?.schema),
        snippets: harvestSnippets(name),
      }))
      .filter(
        ({ candidates, snippets }) =>
          candidates.length > 0 && snippets.length > 0,
      )
      .map((entry) => [entry.name, entry] as const),
  )('%s accepts any option object its schema permits', (_name, entry) => {
    const ruleId = PREFIX + entry.name;
    const failures: string[] = [];

    for (const code of entry.snippets) {
      for (const filename of FILENAMES) {
        // A rule that already throws unconfigured (e.g. one needing type
        // information) is not an options-shaped defect; only the delta counts.
        if (throwsWith(ruleId, [], code, filename) !== null) continue;
        for (const candidate of entry.candidates) {
          const message = throwsWith(ruleId, candidate.options, code, filename);
          if (message) failures.push(`options ${candidate.label}: ${message}`);
        }
      }
    }

    expect([...new Set(failures)]).toEqual([]);
  });
});
