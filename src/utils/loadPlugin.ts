import path from 'node:path';
import type { Linter } from 'eslint';
import type { TSESLint } from '@typescript-eslint/utils';

/** A shipped severity, bare or carrying the options its author declared. */
export type RecommendedSeverity = Linter.RuleEntry;

/**
 * A glob-scoped block of `configs.recommended`. A rule reachable only through an
 * override is still enabled in recommended, so a consumer reading the flat
 * `rules` map alone is reading a configuration nobody ships.
 */
export type RecommendedOverride = {
  files?: readonly string[];
  rules?: Record<string, RecommendedSeverity>;
};

/**
 * The barrel's shape. `src/index.ts` assigns `module.exports` and exports no
 * TypeScript type, so this structural type is the one every consumer reads.
 */
export type PluginModule = {
  meta: { name: string; version: string };
  parseOptions: { ecmaVersion: number };
  configs: {
    recommended: {
      plugins: string[];
      rules: Record<string, RecommendedSeverity>;
      overrides: RecommendedOverride[];
    };
  };
  rules: Record<string, TSESLint.RuleModule<string, readonly unknown[]>>;
};

/**
 * The barrel, by a path jest cannot see.
 *
 * jest builds its relatedness graph by regex over source text, so a LITERAL
 * specifier records an edge and a computed path records none. The barrel
 * imports every rule, which made every whole-corpus guard related to every rule:
 * one rule change selected 61 suites, seventeen of them 8 to 22 minutes each.
 * The module, its identity in the caller's registry and its load semantics are
 * unchanged — only the edge goes. `src/tests/plugin-edge-isolation.test.ts`
 * names any literal specifier that reappears under `src/`.
 *
 * `tsc` emits this file to `lib/utils/`, so the same relative path reaches
 * `lib/index.js` in the published package.
 */
const BARREL_PATH = path.join(__dirname, '..', 'index');

/**
 * Loads the plugin.
 *
 * `require` runs per call rather than at module scope, so a suite that mocks or
 * resets the module registry gets the fresh load a literal `require` gave it.
 */
export function loadPlugin(): PluginModule {
  return require(BARREL_PATH);
}
