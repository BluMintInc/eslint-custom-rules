import fs from 'fs';
import path from 'path';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (configs + rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  configs: {
    recommended: { rules: Record<string, unknown> };
  };
  rules: Record<
    string,
    { meta?: { docs?: { recommended?: unknown } } }
  >;
};

const PREFIX = '@blumintinc/blumint/';

type EnabledRule = { name: string; severity: 'error' | 'warn' };

/**
 * Every BluMint rule the recommended config ENABLES (at 'error' or 'warn') must
 * declare the same severity in its `meta.docs.recommended`. Downstream CI and
 * agent lint hooks gate only on errors, so a rule shipped at 'error' whose meta
 * claims 'warn' (or the reverse) misrepresents whether the rule actually gates —
 * the exact drift issue #1282 fixed. This guard keeps the enforced severity and
 * the documented severity from silently diverging again.
 *
 * Scope is intentionally the enabled ('error'/'warn') entries: rules the config
 * sets to 'off', and rules absent from the recommended config entirely, are not
 * asserted here — a disabled or unshipped rule's declared severity does not
 * affect what gates downstream.
 */
const enabledRules: EnabledRule[] = Object.entries(
  plugin.configs.recommended.rules,
)
  .filter(([key]) => key.startsWith(PREFIX))
  .map(([key, value]) => {
    const name = key.slice(PREFIX.length);
    const severity = Array.isArray(value) ? value[0] : value;
    return { name, severity };
  })
  .filter(
    (entry): entry is EnabledRule =>
      entry.severity === 'error' || entry.severity === 'warn',
  );

describe('recommended config ↔ meta.docs.recommended consistency', () => {
  it('has at least one enabled rule to check', () => {
    expect(enabledRules.length).toBeGreaterThan(0);
  });

  it.each(enabledRules)(
    'recommended config enables $name at "$severity"; its meta.docs.recommended must match',
    ({ name, severity }) => {
      const rule = plugin.rules[name];
      expect(rule).toBeDefined();
      expect(rule.meta?.docs?.recommended).toBe(severity);
    },
  );
});

const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * The severity a docs page shows for its own rule, from every JSON/JSONC config
 * example on the page. Both shapes appear: a bare `"rule": "error"` and an
 * optioned `"rule": ["error", {...}]`.
 */
const documentedSeverities = (name: string): string[] => {
  const docPath = path.join(DOCS_DIR, `${name}.md`);
  if (!fs.existsSync(docPath)) return [];
  const text = fs.readFileSync(docPath, 'utf8');
  const pattern = new RegExp(
    `"${PREFIX.replace(/\//g, '\\/')}${name}"\\s*:\\s*(?:\\[\\s*)?"(error|warn|off)"`,
    'g',
  );
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))];
};

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
  const documented = enabledRules
    .map((entry) => ({ ...entry, shown: documentedSeverities(entry.name) }))
    .filter((entry) => entry.shown.length > 0);

  it('finds documented config examples to check', () => {
    expect(documented.length).toBeGreaterThan(10);
  });

  it.each(documented)(
    'docs/rules/$name.md must document "$severity", the severity it ships',
    ({ severity, shown }) => {
      expect(shown).toEqual([severity]);
    },
  );
});
