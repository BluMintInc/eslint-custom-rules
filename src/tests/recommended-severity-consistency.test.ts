import fs from 'fs';
import path from 'path';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (configs + rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  configs: {
    recommended: {
      rules: Record<string, unknown>;
      overrides?: { files?: string[]; rules?: Record<string, unknown> }[];
    };
  };
  rules: Record<string, { meta?: { docs?: { recommended?: unknown } } }>;
};

const PREFIX = '@blumintinc/blumint/';

type Severity = 'error' | 'warn' | 'off';

type ConfiguredRule = {
  name: string;
  /** Every distinct severity the recommended config assigns, sorted. */
  severities: Severity[];
  /** The distinct enabling ('error'/'warn') severities, sorted. */
  enabledSeverities: Severity[];
  /** Where each severity comes from, for failure messages. */
  sources: string[];
};

const severityOf = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

const isSeverity = (value: unknown): value is Severity =>
  value === 'error' || value === 'warn' || value === 'off';

/**
 * A rule can be configured in two places: the base `rules` map, which applies
 * everywhere, and an `overrides[]` block, which applies only to files matching
 * that block's `files` globs. Both are part of what the recommended config
 * ships, so both count as configuring the rule — a rule reachable ONLY through
 * an override (`enforce-date-ttime`) is still enabled in recommended, just for
 * a narrower file set. Reading `rules` alone left that rule entirely outside
 * this guard, which is the drift the guard exists to prevent (#1734).
 *
 * Severities are collected as a SET rather than resolved to one winner. A rule
 * given different enabling severities in different places has no single answer
 * `meta.docs.recommended` could match, so the set is asserted to be a singleton
 * instead of silently preferring the base entry or the last override.
 */
const collectConfiguredRules = (): ConfiguredRule[] => {
  const collected = new Map<
    string,
    { severities: Set<Severity>; sources: string[] }
  >();

  const record = (key: string, value: unknown, source: string) => {
    if (!key.startsWith(PREFIX)) return;
    const severity = severityOf(value);
    if (!isSeverity(severity)) return;
    const name = key.slice(PREFIX.length);
    const entry = collected.get(name) ?? {
      severities: new Set<Severity>(),
      sources: [],
    };
    entry.severities.add(severity);
    entry.sources.push(`${source} → "${severity}"`);
    collected.set(name, entry);
  };

  for (const [key, value] of Object.entries(plugin.configs.recommended.rules)) {
    record(key, value, 'configs.recommended.rules');
  }
  for (const override of plugin.configs.recommended.overrides ?? []) {
    const files = (override.files ?? []).join(', ');
    for (const [key, value] of Object.entries(override.rules ?? {})) {
      record(key, value, `configs.recommended.overrides[${files}]`);
    }
  }

  return [...collected.entries()]
    .map(([name, entry]) => {
      const severities = [...entry.severities].sort();
      return {
        name,
        severities,
        enabledSeverities: severities.filter((value) => value !== 'off'),
        sources: entry.sources,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

const configuredRules = collectConfiguredRules();
const configuredNames = new Set(configuredRules.map((rule) => rule.name));

/**
 * The rules the recommended config ENABLES somewhere. A rule absent from the
 * config entirely is out of scope here — an unshipped rule's declared severity
 * gates nothing downstream — but a rule the config ships 'off' is NOT: it is
 * configured, and its meta is asserted by `disabledRules` below.
 */
const enabledRules = configuredRules.filter(
  (rule) => rule.enabledSeverities.length > 0,
);

/**
 * The rules the recommended config ships 'off' everywhere. Comparing their meta
 * against the config was the one severity pairing nothing checked, which is how
 * `prefer-fragment-component` came to ship 'off' while declaring 'error'
 * (#1736). A rule disabled in the config does not gate, so meta claiming it
 * does is exactly the misrepresentation this file exists to prevent — and it
 * also hides that the disablement was never given a documented reason.
 */
const disabledRules = configuredRules.filter(
  (rule) => rule.enabledSeverities.length === 0,
);

/** The severity to assert against, for rules with an unambiguous one. */
const shippedSeverity = (rule: ConfiguredRule): Severity =>
  rule.enabledSeverities[0];

/**
 * The `meta.docs.recommended` value that represents a shipped severity.
 * `RuleMetaDataDocs` types the field `false | 'error' | 'strict' | 'warn'` and
 * has no `'off'` member, so `false` is the meta spelling of a config 'off' —
 * not a value a rule may omit or leave at 'error'.
 */
const expectedMeta = (severity: Severity): Severity | false =>
  severity === 'off' ? false : severity;

/**
 * Every BluMint rule the recommended config ENABLES (at 'error' or 'warn') must
 * declare the same severity in its `meta.docs.recommended`. Downstream CI and
 * agent lint hooks gate only on errors, so a rule shipped at 'error' whose meta
 * claims 'warn' (or the reverse) misrepresents whether the rule actually gates —
 * the exact drift issue #1282 fixed. This guard keeps the enforced severity and
 * the documented severity from silently diverging again.
 */
describe('recommended config ↔ meta.docs.recommended consistency', () => {
  it('has at least one enabled rule to check', () => {
    expect(enabledRules.length).toBeGreaterThan(0);
  });

  it.each(enabledRules)(
    'recommended config enables $name; its meta.docs.recommended must match',
    (rule) => {
      // A rule enabled at two different severities cannot be represented by the
      // single value in meta, so surface the conflict rather than picking one.
      expect({
        name: rule.name,
        enabledSeverities: rule.enabledSeverities,
        sources: rule.sources,
      }).toMatchObject({ enabledSeverities: [expect.any(String)] });
      const implementation = plugin.rules[rule.name];
      expect(implementation).toBeDefined();
      expect(implementation.meta?.docs?.recommended).toBe(
        expectedMeta(shippedSeverity(rule)),
      );
    },
  );
});

/**
 * The mirror of the block above, for the rules the config ships 'off'. Written
 * as one assertion over a collected list rather than `it.each`, because the set
 * is legitimately empty once every disabled rule graduates — and `it.each` on an
 * empty table fails, which would turn a fully-graduated rule set into a red
 * suite. The mismatch objects name the offending rules in the diff.
 */
describe('recommended config ↔ meta.docs.recommended for disabled rules', () => {
  it('accounts for every configured rule as either enabled or disabled', () => {
    // The partition is what makes the two blocks exhaustive: a configured rule
    // that fell into neither would have its meta compared by nothing, which is
    // the shape of the drift this file guards.
    expect(enabledRules.length + disabledRules.length).toBe(
      configuredRules.length,
    );
    expect(configuredRules.length).toBeGreaterThan(0);
  });

  it('every rule the config disables declares false in meta.docs.recommended', () => {
    const mismatched = disabledRules.map((rule) => ({
      name: rule.name,
      declared: plugin.rules[rule.name]?.meta?.docs?.recommended,
      sources: rule.sources,
    }));
    expect(
      mismatched.filter((entry) => entry.declared !== expectedMeta('off')),
    ).toEqual([]);
  });

  it('every rule the config disables has an implementation to check', () => {
    expect(
      disabledRules
        .filter((rule) => plugin.rules[rule.name] === undefined)
        .map((rule) => rule.name),
    ).toEqual([]);
  });

  // The 'off' pairing has one live instance, so the mapping is exercised
  // directly as well: a comparator that stopped distinguishing the values would
  // otherwise read as a clean run rather than a lost check.
  describe('meta representation of a shipped severity', () => {
    it.each([
      ['off', false],
      ['error', 'error'],
      ['warn', 'warn'],
    ] as [Severity, Severity | false][])(
      'a rule shipped %s must declare %s',
      (severity, expected) => {
        expect(expectedMeta(severity)).toBe(expected);
      },
    );

    it('does not accept the config spelling of off as a meta value', () => {
      expect(expectedMeta('off')).not.toBe('off');
    });
  });
});

const DOCS_DIR = path.join(__dirname, '../../docs/rules');

const readDocs = (name: string): string | undefined => {
  const docPath = path.join(DOCS_DIR, `${name}.md`);
  return fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : undefined;
};

/**
 * The severity stated by the auto-generated header notice that
 * `eslint-doc-generator` writes at the top of every rule page. The notice is
 * derived from the shipped config (a rule set to 'off' reads "_disabled_" even
 * though its meta says 'error'), and it is the one severity statement present
 * on essentially every page — which makes it the only docs signal that can
 * cover the whole rule set rather than the minority of pages that also carry a
 * hand-written config example.
 *
 * Because the notice is generated, a mismatch means the docs were not
 * regenerated after a severity change: stale text telling consumers a rule
 * gates when it does not.
 */
const noticeSeverity = (text: string): Severity | undefined => {
  const match = text.match(
    /This rule (?:is (enabled|_disabled_)|(_warns_)) in the .{0,4}`recommended` config\./,
  );
  if (!match) return undefined;
  if (match[2]) return 'warn';
  return match[1] === 'enabled' ? 'error' : 'off';
};

/**
 * The severity a docs page shows for its own rule, from every JSON/JS config
 * example on the page. Three shapes appear: a bare `"rule": "error"`, an
 * optioned `"rule": ["error", {...}]`, and the single-quoted JS spelling of
 * either.
 *
 * Inline `/* eslint rule: [...] *\/` comments are deliberately not matched:
 * those demonstrate a per-file override in example code, not a claim about the
 * recommended config.
 */
const exampleSeverities = (name: string, text: string): Severity[] => {
  const pattern = new RegExp(
    `['"\`]${PREFIX.replace(
      /\//g,
      '\\/',
    )}${name}['"\`]\\s*:\\s*(?:\\[\\s*)?['"\`](error|warn|off)['"\`]`,
    'g',
  );
  return [
    ...new Set([...text.matchAll(pattern)].map((match) => match[1])),
  ].sort() as Severity[];
};

/**
 * Rules whose docs page carries no recommended-config notice, each with the
 * reason it cannot. Kept as a named map rather than a count so the accounting
 * below can fail in BOTH directions: an unaccounted rule fails, and so does an
 * entry here that no longer needs the exemption. A bare "at least N pages"
 * floor is what let `enforce-date-ttime` sit uncovered (#1734).
 */
const NOTICE_EXEMPT: Record<string, string> = {};

/**
 * The docs page is a THIRD place a severity is written, and the one consumers
 * copy from. #1282 bumped six rules to 'error' in the config and in
 * `meta.docs.recommended` — the two locations the assertions above compare —
 * while every one of their docs pages kept showing `"warn"`, so following the
 * documentation produced a rule that never gates. Nothing read those config
 * examples, so the drift survived the fix that was supposed to end it (#1459).
 *
 * Only a page's own rule id is asserted. Docs that reference a sibling rule to
 * contrast behaviour are describing that rule, not configuring this one.
 */
describe('recommended config ↔ documented config severity', () => {
  const pages = configuredRules.map((rule) => {
    const text = readDocs(rule.name);
    return {
      rule,
      name: rule.name,
      text,
      notice: text === undefined ? undefined : noticeSeverity(text),
      examples: text === undefined ? [] : exampleSeverities(rule.name, text),
    };
  });

  describe('coverage accounting', () => {
    it('every configured rule is either checked or a named exemption', () => {
      const unaccounted = pages
        .filter((page) => page.notice === undefined)
        .filter((page) => !(page.name in NOTICE_EXEMPT))
        .map((page) => page.name);
      expect(unaccounted).toEqual([]);
    });

    it('every exemption is still needed and still names a configured rule', () => {
      const stale = Object.keys(NOTICE_EXEMPT).filter((name) => {
        if (!configuredNames.has(name)) return true;
        const page = pages.find((entry) => entry.name === name);
        return page?.notice !== undefined;
      });
      expect(stale).toEqual([]);
    });

    it('every exemption states a reason', () => {
      const reasonless = Object.entries(NOTICE_EXEMPT)
        .filter(([, reason]) => reason.trim().length === 0)
        .map(([name]) => name);
      expect(reasonless).toEqual([]);
    });

    it('accounts for every configured rule exactly once', () => {
      const checked = pages.filter((page) => page.notice !== undefined).length;
      expect(checked + Object.keys(NOTICE_EXEMPT).length).toBe(
        configuredRules.length,
      );
      expect(configuredRules.length).toBeGreaterThan(0);
    });
  });

  describe('header notice severity parsing', () => {
    // The 'warn' phrasing has no live instance (no rule ships at 'warn'), so
    // the parser is exercised against all three notices directly. Without this,
    // a parser that silently stopped recognising a phrasing would read as a
    // clean run rather than a lost check.
    it.each([
      ['💼 This rule is enabled in the ✅ `recommended` config.', 'error'],
      ['⚠️ This rule _warns_ in the ✅ `recommended` config.', 'warn'],
      ['🚫 This rule is _disabled_ in the ✅ `recommended` config.', 'off'],
    ])('reads %s as %s', (text, expected) => {
      expect(noticeSeverity(text)).toBe(expected);
    });

    it('reads a page with no notice as undefined', () => {
      expect(noticeSeverity('# A rule page with no config notice\n')).toBe(
        undefined,
      );
    });
  });

  it.each(pages.filter((page) => page.notice !== undefined))(
    'docs/rules/$name.md header notice must state the severity it ships',
    (page) => {
      const expected = page.rule.enabledSeverities.length
        ? shippedSeverity(page.rule)
        : 'off';
      expect(page.notice).toBe(expected);
    },
  );

  const withExamples = pages.filter(
    (page) =>
      page.examples.length > 0 && page.rule.enabledSeverities.length > 0,
  );

  it('finds documented config examples to check', () => {
    // Anti-vacuity floor for the example extractor only; whole-rule-set
    // coverage is guaranteed by the notice accounting above, not by this count.
    expect(withExamples.length).toBeGreaterThanOrEqual(35);
  });

  it.each(withExamples)(
    'docs/rules/$name.md config example must document the severity it ships',
    (page) => {
      expect(page.examples).toEqual([shippedSeverity(page.rule)]);
    },
  );
});

/**
 * A config example under a mistyped plugin prefix is invisible to the extractor
 * above AND uncopyable by consumers (ESLint reports the rule as not found), so
 * a typo silently removes a page from this guard's reach — the same blind-spot
 * shape as the missed `overrides` block.
 */

/**
 * `@blumint/` reaching a docs page as a MODULE SPECIFIER is not the hazard: a
 * documented example that imports `@blumint/utils/uuidv4Base62` is naming a
 * package, and some rules only engage when their helper's import is present, so
 * the example needs it to demonstrate anything. Specifiers are stripped before
 * the scan rather than the pattern being loosened, which keeps a rule key under
 * the wrong prefix an offender wherever it appears.
 */
function referencesNonCanonicalPrefix(source: string): boolean {
  const withoutSpecifiers = source.replace(
    /\b(?:from|import|require)\s*\(?\s*(['"])[^'"]*\1/g,
    '',
  );
  return /@blumint\/[a-z0-9-]+/.test(withoutSpecifiers);
}
describe('docs config examples use the canonical plugin prefix', () => {
  it('no docs page references a rule under a non-canonical @blumint/ prefix', () => {
    const offenders = fs
      .readdirSync(DOCS_DIR)
      .filter((file) => file.endsWith('.md'))
      .filter((file) =>
        referencesNonCanonicalPrefix(
          fs.readFileSync(path.join(DOCS_DIR, file), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('reads a config example but not an import specifier (control)', () => {
    expect(
      referencesNonCanonicalPrefix(
        `{ "rules": { "@blumint/no-foo": "error" } }`,
      ),
    ).toBe(true);
    expect(
      referencesNonCanonicalPrefix(
        `import { uuidv4Base62 } from '@blumint/utils/uuidv4Base62';`,
      ),
    ).toBe(false);
    // A specifier is exempt because of where it sits, not because of its shape:
    // the same package path quoted as a rule key is still an offender.
    expect(
      referencesNonCanonicalPrefix(`'@blumint/utils/uuidv4Base62': 'error',`),
    ).toBe(true);
    expect(
      referencesNonCanonicalPrefix(`const x = require('@blumint/utils');`),
    ).toBe(false);
  });
});

/**
 * The reverse leak: a rule absent from the recommended config must not have a
 * page claiming the config enables it. `eslint-doc-generator` omits the notice
 * for such rules, so a lingering notice means stale generated text.
 */
describe('rules absent from the recommended config', () => {
  const absent = Object.keys(plugin.rules).filter(
    (name) => !configuredNames.has(name),
  );

  it('has absent rules to check', () => {
    expect(absent.length).toBeGreaterThan(0);
  });

  it.each(absent)('docs/rules/%s.md claims no recommended severity', (name) => {
    const text = readDocs(name);
    expect(text).toBeDefined();
    expect(noticeSeverity(text as string)).toBe(undefined);
  });
});
