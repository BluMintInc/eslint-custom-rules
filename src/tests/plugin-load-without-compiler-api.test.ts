/**
 * Guards the packaging failure from issue #1354: the plugin barrel imports every
 * rule eagerly, so a single rule dereferencing a `typescript` enum at module
 * scope takes down the entire plugin — not just that rule — when the installed
 * compiler does not expose the enum at its package root.
 *
 * That is not hypothetical. `@typescript-eslint/typescript-estree@5.x` marks
 * `typescript` as an optional peer with no version range, so npm resolves it to
 * the latest release on a clean consumer install. TypeScript 7 exports only a
 * version stub from its package root (the compiler API moved to `./unstable/*`
 * subpaths), which made `require('@blumintinc/eslint-plugin-blumint')` throw for
 * every consumer. The repo pins a TypeScript 5 devDependency, so the rest of the
 * suite cannot observe this — hence a dedicated stub.
 */
jest.mock('typescript', () => ({ version: '7.0.2' }));

import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadRuleNames } = require('../../scripts/load-rule-names');

/**
 * The canonical rule set, parsed from `src/index.ts` without building — the same
 * source commitlint, the validate-commit-scopes CI gate and the release-manifest
 * generator read. Comparing against it closes the gap a cardinality floor leaves:
 * `> 0` is satisfied by a barrel that exposes ONE rule, so a partial load —
 * exactly the shape #1354 produced downstream of the throwing import — would read
 * as a healthy plugin. Equality cannot be satisfied by a degraded load.
 */
const EXPECTED_RULE_NAMES: string[] = loadRuleNames(
  path.resolve(__dirname, '../..'),
);

type PluginShape = {
  rules: Record<string, { create?: unknown }>;
  configs: { recommended: { rules: Record<string, unknown> } };
};

describe('plugin loads against a compiler without a root-exported API', () => {
  it('imports the barrel without throwing', () => {
    expect(() => require('..')).not.toThrow();
  });

  it('still exposes every rule as a usable rule module', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const plugin = require('..') as PluginShape;
    const names = Object.keys(plugin.rules);

    expect(EXPECTED_RULE_NAMES.length).toBeGreaterThan(150); // measured 194
    expect([...names].sort()).toEqual([...EXPECTED_RULE_NAMES].sort());

    const unusable = names.filter(
      (name) => typeof plugin.rules[name]?.create !== 'function',
    );
    expect(unusable).toEqual([]);
  });

  it('still exposes the recommended config', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const plugin = require('..') as PluginShape;
    const configured = Object.keys(plugin.configs.recommended.rules);

    // Some rules ship deliberately absent from `recommended`, so this cannot be
    // an equality against the rule set — but every entry this plugin owns must
    // still name a rule the degraded load actually exposed. Entries owned by
    // other plugins (`@typescript-eslint/*`) are passed through untouched.
    expect(configured.length).toBeGreaterThan(150); // measured 190
    const PREFIX = '@blumintinc/blumint/';
    const dangling = configured
      .filter((id) => id.startsWith(PREFIX))
      .filter((id) => !plugin.rules[id.slice(PREFIX.length)]);
    expect(dangling).toEqual([]);
  });
});
