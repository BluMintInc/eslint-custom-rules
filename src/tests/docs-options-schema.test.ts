import fs from 'fs';
import path from 'path';
import { ESLint } from 'eslint';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: { schema?: unknown } }>;
  configs: {
    recommended: {
      rules: Record<string, unknown>;
      overrides?: readonly {
        files?: readonly string[];
        rules?: Record<string, unknown>;
      }[];
    };
  };
};

const PREFIX = '@blumintinc/blumint/';
const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * ESLint validates rule options when it builds the config, not per file, so a
 * documented example whose options the schema rejects does not produce a lint
 * error — it aborts the consumer's entire run with "Configuration for rule ...
 * is invalid". Nothing asserted that documented options were even valid, and
 * `docs-examples-conformance.test.ts` exercises options only where a block
 * carries an explicit `// eslint-options:` hint.
 *
 * The mirror failure is an option a rule declares but no doc mentions: the
 * escape hatch is undiscoverable, so a consumer meeting a false positive
 * disables the rule instead of configuring it, and in agora a disabled rule
 * never auto-clears once it is override-scoped or optioned.
 *
 * A documented example also carries a severity, which is the third place
 * severity lives. `recommended-severity-consistency.test.ts` pins the config
 * against `meta.docs.recommended` and requires the doc to mention the shipped
 * severity, but the auto-generated header satisfies that mention while the
 * example below it says something else — so an example could hand a consumer
 * `'warn'` for a rule that ships `'error'`, silently un-gating it (#1472).
 *
 * Two traps make a naive version of this guard vacuous (#1470):
 *
 * 1. `Linter#verify` does NOT validate rule options. Given an inline config
 *    object it accepts `['error', 'not-an-object']` against a schema declaring
 *    `type: 'object'` with `additionalProperties: false`. Only the config-array
 *    layer behind the `ESLint` class validates, so the guard must go through
 *    `ESLint`, and the controls below prove it still catches a bad payload.
 * 2. Config examples appear in four forms, and reading only the ones with a
 *    `rules:` key finds 14 of the 34 rules that document a payload — most docs
 *    show the entry bare, as `'<id>': ['error', {...}]`. The inline directive
 *    form additionally needs its unquoted rule id (which contains `/` and `@`)
 *    quoted before it parses, and a bare entry needs bracket matching that
 *    honours strings and comments. A form that silently fails to parse asserts
 *    nothing — the hole #1466 closed for documented code blocks — so unparsed
 *    sites fail this suite by name (#1471).
 */

type ConfigSite = {
  form: 'rules-block' | 'inline-directive' | 'options-hint' | 'bare-entry';
  entry: unknown;
};

type UnparsedSite = {
  form: ConfigSite['form'];
  snippet: string;
};

function fences(md: string): string[] {
  const out: string[] = [];
  const re = /```[a-zA-Z0-9]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) out.push(m[1]);
  return out;
}

/** JSON first, then object-literal syntax: docs use both. */
function parseLoose(text: string): { ok: true; value: any } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    /* fall through */
  }
  try {
    // eslint-disable-next-line no-new-func
    return { ok: true, value: new Function(`return (${text})`)() };
  } catch {
    return { ok: false };
  }
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/@-]/g, '\\$&');

/**
 * The `[...]` entry starting at `from`, honouring strings and comments so a
 * bracket inside either does not close the payload early. Returns null when the
 * brackets never balance.
 */
function balancedEntry(body: string, from: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < body.length; i++) {
    const ch = body[i];
    const next = body[i + 1];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      i = body.indexOf('\n', i);
      if (i === -1) return null;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = body.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 1;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return body.slice(from, i + 1);
    }
  }
  return null;
}

/** Every place a doc states this rule's own option payload. */
export function configSites(
  md: string,
  ruleName: string,
): { sites: ConfigSite[]; unparsed: UnparsedSite[] } {
  const sites: ConfigSite[] = [];
  const unparsed: UnparsedSite[] = [];
  const selfId = `${PREFIX}${ruleName}`;

  for (const body of fences(md)) {
    if (/["']?rules["']?\s*:/.test(body) && body.includes(selfId)) {
      const text = body.trim();
      const candidates = [
        text,
        text.replace(/^module\.exports\s*=\s*/, '').replace(/;\s*$/, ''),
        // Docs often show a bare `"rules": { ... }` fragment, not a whole config.
        `{${text.replace(/,\s*$/, '')}}`,
      ];
      const parsed = candidates
        .map(parseLoose)
        .find((r): r is { ok: true; value: any } => r.ok);
      if (parsed) {
        const collect = (cfg: any) => {
          if (!cfg || typeof cfg !== 'object') return;
          if (cfg.rules && cfg.rules[selfId] !== undefined) {
            sites.push({ form: 'rules-block', entry: cfg.rules[selfId] });
          }
          if (Array.isArray(cfg.overrides)) cfg.overrides.forEach(collect);
        };
        collect(parsed.value);
      } else {
        unparsed.push({ form: 'rules-block', snippet: text.slice(0, 120) });
      }
    }

    const directive = /\/\*\s*eslint\s+([\s\S]*?)\*\//g;
    let m: RegExpExecArray | null;
    while ((m = directive.exec(body))) {
      const inline = m[1].trim();
      if (!inline.includes(selfId)) continue;
      const after = inline
        .slice(inline.indexOf(selfId) + selfId.length)
        .replace(/^\s*:/, '')
        .replace(/,\s*$/, '');
      const parsed = parseLoose(`{${JSON.stringify(selfId)}:${after}}`);
      if (!parsed.ok) {
        unparsed.push({
          form: 'inline-directive',
          snippet: inline.slice(0, 120),
        });
        continue;
      }
      if (parsed.value[selfId] !== undefined) {
        sites.push({ form: 'inline-directive', entry: parsed.value[selfId] });
      }
    }

    const hint = /^\s*\/\/\s*eslint-options:\s*(\{.*\})\s*$/im.exec(body);
    if (hint) {
      const parsed = parseLoose(hint[1]);
      if (parsed.ok) {
        sites.push({ form: 'options-hint', entry: ['error', parsed.value] });
      } else {
        unparsed.push({ form: 'options-hint', snippet: hint[1].slice(0, 120) });
      }
    }

    // Most docs show the rule entry on its own — `'<id>': ['error', {...}]` —
    // with no enclosing `rules:` key, so gating on that key skips the majority
    // of documented payloads without failing anything.
    const entryStart = new RegExp(
      `["']?${escapeRegExp(selfId)}["']?\\s*:\\s*(?=\\[)`,
      'g',
    );
    let entryMatch: RegExpExecArray | null;
    while ((entryMatch = entryStart.exec(body))) {
      const from = entryMatch.index + entryMatch[0].length;
      const slice = balancedEntry(body, from);
      const parsed = slice ? parseLoose(slice) : { ok: false as const };
      if (!parsed.ok) {
        unparsed.push({
          form: 'bare-entry',
          snippet: (slice ?? body.slice(from, from + 120)).slice(0, 120),
        });
        continue;
      }
      // A wrapped entry is already recorded by the rules-block reader; keep one
      // site per distinct payload so counts stay honest.
      const encoded = JSON.stringify(parsed.value);
      if (!sites.some((s) => JSON.stringify(s.entry) === encoded)) {
        sites.push({ form: 'bare-entry', entry: parsed.value });
      }
    }
  }
  return { sites, unparsed };
}

/** Option names a rule's schema declares, or null when not enumerable. */
export function schemaOptionNames(schema: unknown): Set<string> | null {
  if (!schema) return new Set();
  const entries = Array.isArray(schema) ? schema : [schema];
  const names = new Set<string>();
  let enumerable = entries.length === 0;
  const walk = (s: any) => {
    if (!s || typeof s !== 'object') return;
    if (s.properties) {
      enumerable = true;
      Object.keys(s.properties).forEach((k) => names.add(k));
    }
    (['oneOf', 'anyOf', 'allOf'] as const).forEach((k) => {
      if (Array.isArray(s[k])) s[k].forEach(walk);
    });
    if (s.items) walk(s.items);
  };
  entries.forEach(walk);
  return enumerable ? names : null;
}

/**
 * Options are frequently documented only as JSON keys inside a config fence, so
 * a backticks-only scan reports rules that document every option perfectly.
 */
export function mentions(md: string, name: string): boolean {
  return new RegExp(`(^|[^\\w$])${name}([^\\w$]|$)`).test(md);
}

const CONFIG_ERROR =
  /Configuration for rule|should NOT have|should be|Value .* should/;

/** The severity a documented entry configures, or null if it states none. */
export function severityOf(entry: unknown): string | null {
  const severity = Array.isArray(entry) ? entry[0] : entry;
  return severity === 'error' || severity === 'warn' || severity === 'off'
    ? severity
    : null;
}

/**
 * The severity the recommended config actually ships, restricted to rules it
 * enables. A rule set to 'off' or absent from the config gates nothing, so its
 * documented severity is not asserted — the same scope
 * `recommended-severity-consistency.test.ts` uses.
 *
 * That scope is BOTH the base `rules` map and every `overrides[]` block: a rule
 * reachable only through an override — `enforce-date-ttime`, for `src/**` — is
 * still enabled in recommended, just for a narrower file set. Reading `rules`
 * alone is exactly the drift #1734 fixed in the guard this claims parity with,
 * and the claim outlived the parity. That guard separately asserts no rule is
 * enabled at two different severities, so the first enabling entry is the only
 * one there is.
 */
export function shippedSeverity(ruleName: string): string | null {
  const id = `${PREFIX}${ruleName}`;
  const configured = [
    plugin.configs.recommended.rules[id],
    ...(plugin.configs.recommended.overrides || []).map(
      (override) => override.rules?.[id],
    ),
  ];
  for (const entry of configured) {
    const severity = severityOf(entry);
    if (severity === 'error' || severity === 'warn') return severity;
  }
  return null;
}

/**
 * Validate a payload the way a consumer's ESLint startup does. Resolves to null
 * when accepted, or the validation message when rejected. A rule that throws
 * while linting is re-thrown rather than counted as an invalid option, so a
 * crash cannot masquerade as a docs defect.
 */
export async function validationErrorFor(
  ruleName: string,
  entry: unknown,
): Promise<string | null> {
  const eslint = new ESLint({
    useEslintrc: false,
    plugins: { '@blumintinc/blumint': plugin as never },
    baseConfig: {
      plugins: ['@blumintinc/blumint'],
      parserOptions: { ecmaVersion: 2021, sourceType: 'module' },
      rules: { [`${PREFIX}${ruleName}`]: entry as never },
    },
  });
  try {
    await eslint.lintText('const a = 1;\n', {
      filePath: path.join(__dirname, 'docs-option-probe.ts'),
    });
    return null;
  } catch (err) {
    const message = String((err as Error).message);
    if (!CONFIG_ERROR.test(message)) throw err;
    return message.split('\n').slice(0, 4).join(' ').trim();
  }
}

const registeredRules = Object.keys(plugin.rules).sort();

const hasDoc = (name: string) =>
  fs.existsSync(path.join(DOCS_DIR, `${name}.md`));

const ruleNames = registeredRules.filter(hasDoc);

const docFor = (name: string) =>
  fs.readFileSync(path.join(DOCS_DIR, `${name}.md`), 'utf8');

/**
 * Every docs guard enumerates rules by filtering to those that already have a
 * doc file, so a rule registered without `docs/rules/<rule>.md` drops out of
 * all of them at once — examples unlinted, options unvalidated, shipped
 * severity unchecked — and nothing fails (#1471). Assert the filter discards
 * nothing, so the exemption cannot be taken silently.
 */
describe('every rule is reachable by the docs guards', () => {
  it('gives every registered rule a docs page', () => {
    expect(registeredRules.filter((name) => !hasDoc(name))).toEqual([]);
  });

  it('leaves no docs page without a registered rule', () => {
    const documented = fs
      .readdirSync(DOCS_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''));
    expect(documented.filter((name) => !plugin.rules[name])).toEqual([]);
  });

  it('checks every registered rule, not a subset', () => {
    expect(ruleNames).toEqual(registeredRules);
  });
});

describe('documented rule options', () => {
  it('finds rule docs to check', () => {
    expect(ruleNames.length).toBeGreaterThan(150); // measured 194
  });

  it('can enumerate the option names of every optioned rule', () => {
    // A schema whose property names cannot be read would skip the
    // "documents every option it declares" assertion below without failing.
    const opaque = registeredRules.filter((name) => {
      const schema = plugin.rules[name].meta?.schema;
      const takesOptions =
        !!schema && (Array.isArray(schema) ? schema.length > 0 : true);
      return takesOptions && schemaOptionNames(schema) === null;
    });
    expect(opaque).toEqual([]);
  });

  it('reads config examples in every form the docs use', () => {
    const forms = new Set<string>();
    for (const name of ruleNames) {
      configSites(docFor(name), name).sites.forEach((s) => forms.add(s.form));
    }
    // Losing a form silently shrinks coverage instead of failing, so pin every
    // one: the bare-entry form alone carries most of the documented payloads,
    // and gating on a `rules:` key once hid 20 of the 34 configured rules.
    expect([...forms].sort()).toEqual([
      'bare-entry',
      'inline-directive',
      'options-hint',
      'rules-block',
    ]);
  });

  describe.each(ruleNames)('%s', (ruleName) => {
    it('documents option payloads its schema accepts', async () => {
      const { sites } = configSites(docFor(ruleName), ruleName);
      for (const site of sites) {
        const error = await validationErrorFor(ruleName, site.entry);
        expect(
          error && `${site.form}: ${JSON.stringify(site.entry)} -> ${error}`,
        ).toBeNull();
      }
    });

    it('leaves no config example unreadable', () => {
      expect(configSites(docFor(ruleName), ruleName).unparsed).toEqual([]);
    });

    it('documents the severity the rule ships', () => {
      const shipped = shippedSeverity(ruleName);
      if (!shipped) return;
      const documented = configSites(docFor(ruleName), ruleName)
        .sites.map((site) => severityOf(site.entry))
        .filter((severity): severity is string => severity !== null);
      expect(documented.filter((severity) => severity !== shipped)).toEqual([]);
    });

    it('documents every option it declares', () => {
      const names = schemaOptionNames(plugin.rules[ruleName].meta?.schema);
      if (!names || names.size === 0) return;
      const md = docFor(ruleName);
      expect([...names].filter((name) => !mentions(md, name))).toEqual([]);
    });
  });
});

describe('the guard catches what it claims to (controls)', () => {
  // Any rule with an object schema and additionalProperties:false works here;
  // this one is stable and enabled in the recommended config.
  const CONTROL_RULE = 'enforce-boolean-naming-prefixes';

  it('rejects an option the schema does not declare', async () => {
    expect(
      await validationErrorFor(CONTROL_RULE, [
        'error',
        { definitelyNotAnOption: true },
      ]),
    ).not.toBeNull();
  });

  it('rejects a wrongly-typed payload', async () => {
    expect(
      await validationErrorFor(CONTROL_RULE, ['error', 'not-an-object']),
    ).not.toBeNull();
  });

  it('accepts a payload the schema does declare', async () => {
    expect(
      await validationErrorFor(CONTROL_RULE, [
        'error',
        { enforceForPropertySignatures: true },
      ]),
    ).toBeNull();
  });

  it('reports an option name absent from the doc', () => {
    expect(mentions(docFor(CONTROL_RULE), 'zzzOptionNoDocMentions')).toBe(
      false,
    );
    expect(mentions(docFor(CONTROL_RULE), 'enforceForPropertySignatures')).toBe(
      true,
    );
  });

  it('reports a schema whose option names cannot be enumerated', () => {
    // An options schema carrying no `properties` anywhere: the guard must call
    // this unreadable rather than treat it as a rule with zero options.
    expect(
      schemaOptionNames([{ type: 'array', items: { type: 'string' } }]),
    ).toBeNull();
    expect(schemaOptionNames([])).toEqual(new Set());
    expect(
      schemaOptionNames([{ type: 'object', properties: { allowed: {} } }]),
    ).toEqual(new Set(['allowed']));
  });

  it('reads an inline directive whose rule id is unquoted', () => {
    const md = [
      '```ts',
      `/* eslint ${PREFIX}some-rule: ["error", { "allowed": true }] */`,
      'const a = 1;',
      '```',
    ].join('\n');
    const { sites, unparsed } = configSites(md, 'some-rule');
    expect(unparsed).toEqual([]);
    expect(sites).toEqual([
      { form: 'inline-directive', entry: ['error', { allowed: true }] },
    ]);
  });

  it('flags a config example it cannot parse', () => {
    const md = [
      '```json',
      '{',
      `  "rules": { "${PREFIX}some-rule": ["error", { not valid json ] }`,
      '```',
    ].join('\n');
    const { sites, unparsed } = configSites(md, 'some-rule');
    expect(sites).toEqual([]);
    expect(unparsed.length).toBeGreaterThan(0);
  });

  it('reads the severity out of either entry shape', () => {
    expect(severityOf(['warn', { a: 1 }])).toBe('warn');
    expect(severityOf('error')).toBe('error');
    // An options-only payload states no severity and must not be compared.
    expect(severityOf([{ a: 1 }])).toBeNull();
    expect(severityOf(undefined)).toBeNull();
  });

  it('scopes the severity check to rules the config enables', () => {
    expect(shippedSeverity(CONTROL_RULE)).toBe('error');
    expect(shippedSeverity('not-a-registered-rule')).toBeNull();
  });

  it('reads a bare rule entry that omits the rules wrapper', () => {
    const md = [
      '```js',
      `'${PREFIX}some-rule': ['error', {`,
      '  // a comment, a trailing comma, and a nested array',
      "  names: ['a', 'b'],",
      '}]',
      '```',
    ].join('\n');
    const { sites, unparsed } = configSites(md, 'some-rule');
    expect(unparsed).toEqual([]);
    expect(sites).toEqual([
      { form: 'bare-entry', entry: ['error', { names: ['a', 'b'] }] },
    ]);
  });

  it('records a wrapped entry once, not twice', () => {
    const md = [
      '```json',
      '{',
      '  "rules": {',
      `    "${PREFIX}some-rule": ["error", { "names": ["a"] }]`,
      '  }',
      '}',
      '```',
    ].join('\n');
    expect(configSites(md, 'some-rule').sites).toEqual([
      { form: 'rules-block', entry: ['error', { names: ['a'] }] },
    ]);
  });
});
