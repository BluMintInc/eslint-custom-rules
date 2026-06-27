import { resolve } from 'node:path';
import {
  loadRuleNames,
  parseRuleNamesFromIndexSource,
} from './load-rule-names';

const REPO_ROOT = resolve(__dirname, '..');

describe('parseRuleNamesFromIndexSource', () => {
  it('extracts kebab keys from the top-level rules map only', () => {
    const source = [
      'module.exports = {',
      '  configs: {',
      '    recommended: {',
      '      rules: {',
      "        '@blumintinc/blumint/should-be-ignored': 'error',",
      '      },',
      '    },',
      '  },',
      '  rules: {',
      "    'zeta-rule': zetaRule,",
      "    'alpha-rule':",
      '      alphaRule,',
      "    'alpha-rule': alphaRule,",
      '  },',
      '};',
    ].join('\n');
    expect(parseRuleNamesFromIndexSource(source)).toEqual([
      'alpha-rule',
      'zeta-rule',
    ]);
  });

  it('returns an empty array when there is no rules map', () => {
    expect(parseRuleNamesFromIndexSource('const x = 1;')).toEqual([]);
  });
});

describe('loadRuleNames (integration against the real src/index.ts)', () => {
  const names = loadRuleNames(REPO_ROOT);

  it('returns the full registered rule set', () => {
    expect(names.length).toBeGreaterThanOrEqual(160);
  });

  it('includes known OFF-in-agora rules', () => {
    expect(names).toContain('extract-global-constants');
    expect(names).toContain('consistent-callback-naming');
  });

  it('excludes the unregistered orphan rule file', () => {
    expect(names).not.toContain('no-inline-component-prop');
  });

  it('is sorted and de-duplicated', () => {
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
  });
});
