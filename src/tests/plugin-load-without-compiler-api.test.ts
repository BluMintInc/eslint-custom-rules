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

    expect(names.length).toBeGreaterThan(0);

    const unusable = names.filter(
      (name) => typeof plugin.rules[name]?.create !== 'function',
    );
    expect(unusable).toEqual([]);
  });

  it('still exposes the recommended config', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const plugin = require('..') as PluginShape;
    expect(
      Object.keys(plugin.configs.recommended.rules).length,
    ).toBeGreaterThan(0);
  });
});
