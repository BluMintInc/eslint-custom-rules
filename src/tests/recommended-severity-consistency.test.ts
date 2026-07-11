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
