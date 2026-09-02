/**
 * `configs.recommended` is not its flat `rules` map. It also carries an
 * `overrides` array, and a rule reachable only through one is still enabled in
 * recommended — just for the file set that block's globs name.
 *
 * Every guard that composes the recommended config over the harvested corpus
 * read the flat map alone. A rule configured only by an override was therefore
 * invisible to all of them, both on its own fixtures and, more importantly, as
 * a SIBLING while another rule's fixtures were linted. #1734 fixed the same
 * blind read in `recommended-severity-consistency`; the model stayed flat
 * everywhere else, and one guard recorded the artifact as an intention
 * ("`enforce-date-ttime` is deliberately absent from it"), which is what stops
 * anyone re-checking it.
 *
 * This pins the resolver's two halves: an override contributes its rules on the
 * paths its glob names, and on no others. Resolving per FILENAME is the whole
 * point — merging an override everywhere would enable a rule on paths no
 * consumer runs it on, which is a different configuration than the one being
 * modelled.
 */
import {
  overrideRulesFor,
  PLUGIN_PREFIX,
  composedRulesFor,
} from '../utils/composedFixConfig';
import type { FixtureCase } from '../utils/fixtureCorpus';

/* eslint-disable @typescript-eslint/no-var-requires */
const plugin = require('../index') as {
  rules: Record<string, unknown>;
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
/* eslint-enable @typescript-eslint/no-var-requires */

const NONE = new Set<string>();

/** Plugin rules the flat map never enables, reachable only via an override. */
const overrideOnly = new Map<string, readonly string[]>();
for (const override of plugin.configs.recommended.overrides || []) {
  for (const id of Object.keys(override.rules || {})) {
    if (!id.startsWith(PLUGIN_PREFIX)) continue;
    const name = id.slice(PLUGIN_PREFIX.length);
    if (!plugin.rules[name]) continue;
    if (id in plugin.configs.recommended.rules) continue;
    overrideOnly.set(name, override.files || []);
  }
}

describe('recommended severity resolves through overrides, not the flat map', () => {
  /**
   * Non-vacuity. Every arm below is about a rule the flat map does not carry,
   * so an empty population would let all of them pass while asserting nothing.
   */
  it('finds at least one rule reachable only through an override', () => {
    expect(overrideOnly.size).toBeGreaterThanOrEqual(1); // measured 1
    expect([...overrideOnly.keys()]).toContain('enforce-date-ttime');
  });

  it('enables an override-only rule on a path its glob names', () => {
    for (const [name, globs] of overrideOnly) {
      expect(globs.length).toBeGreaterThan(0);
      // A concrete path under the glob's root, not the glob itself.
      const matching = globs[0].replace('**/*.{ts,tsx}', 'a/b/c.ts');
      expect(Object.keys(overrideRulesFor(matching, NONE))).toContain(
        `${PLUGIN_PREFIX}${name}`,
      );
    }
  });

  it('leaves it disabled on a path no glob names', () => {
    for (const name of overrideOnly.keys()) {
      for (const outside of ['file.ts', 'react.tsx', 'lib/other/thing.ts']) {
        expect(Object.keys(overrideRulesFor(outside, NONE))).not.toContain(
          `${PLUGIN_PREFIX}${name}`,
        );
      }
    }
  });

  it('honours a guard’s own exclusion set', () => {
    for (const [name, globs] of overrideOnly) {
      const matching = globs[0].replace('**/*.{ts,tsx}', 'a/b/c.ts');
      expect(
        Object.keys(overrideRulesFor(matching, new Set([name]))),
      ).not.toContain(`${PLUGIN_PREFIX}${name}`);
    }
  });

  /**
   * The composed set is what the guards actually hand the linter, so the
   * resolver being right is worth nothing unless the composition carries it.
   */
  it('carries the override into the composed set for a matching fixture', () => {
    const testCase = {
      code: 'const a = 1;\n',
      tester: 'ruleTesterTs',
      language: 'ts',
      bucket: 'valid',
      origin: 'synthetic',
      options: undefined,
    } as unknown as FixtureCase;
    for (const [name, globs] of overrideOnly) {
      const matching = globs[0].replace('**/*.{ts,tsx}', 'a/b/c.ts');
      const composed = composedRulesFor(
        {},
        NONE,
        'no-hungarian',
        testCase,
        matching,
      );
      expect(Object.keys(composed)).toContain(`${PLUGIN_PREFIX}${name}`);
      const elsewhere = composedRulesFor(
        {},
        NONE,
        'no-hungarian',
        testCase,
        'file.ts',
      );
      expect(Object.keys(elsewhere)).not.toContain(`${PLUGIN_PREFIX}${name}`);
    }
  });
});
