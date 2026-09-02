import fs from 'fs';
import path from 'path';

// Using require to avoid test build-time ESM interop issues; the test runner
// only needs the plugin object shape (rules), not types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('..') as {
  rules: Record<string, { meta?: { docs?: { url?: string } } }>;
};

const DOCS_DIR = path.join(__dirname, '../../docs/rules');

/**
 * The only URL shape GitHub actually serves for a file in this repo. A
 * repo-relative path without the `/blob/<branch>/` segment 404s, which is what
 * every rule shipped before #1479 — `meta.docs.url` is the link the VS Code
 * ESLint extension renders on hover and the `json`/`html` formatters embed, so
 * a malformed template silently breaks the only in-editor path from a BluMint
 * lint error to its explanation.
 */
const expectedUrl = (name: string) =>
  `https://github.com/BluMintInc/eslint-custom-rules/blob/main/docs/rules/${name}.md`;

/**
 * Rules carrying no `meta.docs.url`, which happens when a rule is hand-authored
 * as a raw `TSESLint.RuleModule` literal instead of going through `createRule`
 * — the factory is what supplies the URL. Empty, and the exact-equality
 * assertion below keeps it that way: a new rule that skips `createRule` fails
 * here rather than silently shipping a rule with no link to its own docs.
 */
const RULES_WITHOUT_DOCS_URL: string[] = [];

const allRules = Object.keys(plugin.rules).sort();
const rulesWithUrl = allRules.filter(
  (name) => !!plugin.rules[name].meta?.docs?.url,
);
const rulesMissingUrl = allRules.filter(
  (name) => !plugin.rules[name].meta?.docs?.url,
);

describe('meta.docs.url resolves to a real docs page', () => {
  it('checks a meaningful number of rules', () => {
    expect(allRules.length).toBeGreaterThan(150); // measured 194
    expect(rulesWithUrl.length).toBeGreaterThan(150); // measured 194
  });

  it.each(rulesWithUrl)(
    '%s declares the blob/main docs URL that GitHub serves',
    (name) => {
      expect(plugin.rules[name].meta?.docs?.url).toBe(expectedUrl(name));
    },
  );

  it.each(rulesWithUrl)('%s has the docs page its URL points at', (name) => {
    expect(fs.existsSync(path.join(DOCS_DIR, `${name}.md`))).toBe(true);
  });

  it('has no rule missing a docs URL beyond the tracked migrations', () => {
    expect(rulesMissingUrl).toEqual(RULES_WITHOUT_DOCS_URL);
  });
});
