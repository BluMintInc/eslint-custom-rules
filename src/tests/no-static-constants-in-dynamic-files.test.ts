import { Linter, Rule } from 'eslint';
import rule, { RULE_NAME } from '../rules/no-static-constants-in-dynamic-files';
import globalConstStyle from '../rules/global-const-style';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(RULE_NAME, rule, {
  valid: [
    // Non-dynamic file: exported SCREAMING_SNAKE_CASE constants are allowed
    {
      code: `export const API_URL = 'https://api.example.com';`,
      filename: 'config.ts',
    },
    // Non-exported constant inside a .dynamic file is allowed
    {
      code: `const LOCAL_TIMEOUT = 5000; export function useTimeout() { return LOCAL_TIMEOUT; }`,
      filename: 'helper.dynamic.ts',
    },
    // Exported constant that is not SCREAMING_SNAKE_CASE
    {
      code: `export const apiUrl = 'https://api.example.com';`,
      filename: 'config.dynamic.ts',
    },
    // Exported dynamic value (not a static constant)
    {
      code: `export const getApiUrl = () => \`https://api.example.com/\${Date.now()}\`;`,
      filename: 'settings.dynamic.ts',
    },
    // Using imported constants from another file
    {
      code: `import { API_URL, TIMEOUT } from './config'; export async function fetchData() { return fetch(API_URL, { timeout: TIMEOUT }); }`,
      filename: 'fetchData.dynamic.ts',
    },
    // Re-exporting from another module is allowed
    {
      code: `export { API_URL } from './config';`,
      filename: 'forward.dynamic.ts',
    },
    // JSX usage in .dynamic.tsx without static exports
    {
      code: `import React from 'react'; import { API_URL } from './config'; export function Page() { return <div>{API_URL}</div>; }`,
      filename: 'page.dynamic.tsx',
    },
    // Exported let should not be flagged (rule targets export const)
    {
      code: `export let API_URL = 'https://api.example.com';`,
      filename: 'mutable.dynamic.ts',
    },
    // Exporting types should be ignored
    {
      code: `export type API_URL = string; export interface TIMEOUT { value: number; }`,
      filename: 'types.dynamic.ts',
    },
    // Rest element with non-SCREAMING name is allowed
    {
      code: `const config = ['https://api.example.com']; export const [...apiUrls] = config;`,
      filename: 'rest-valid.dynamic.ts',
    },
    // Destructuring export with non-SCREAMING names is allowed
    {
      code: `const config = { apiUrl: 'x', timeout: 5000 }; export const { apiUrl, timeout } = config;`,
      filename: 'destructure-lower.dynamic.ts',
    },
  ],
  invalid: [
    // Single exported static constant in .dynamic.ts
    {
      code: `export const API_URL = 'https://api.example.com';`,
      filename: 'data.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Multiple exported static constants in separate declarations
    {
      code: `export const API_URL = 'https://api.example.com'; export const TIMEOUT = 5000;`,
      filename: 'config.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Multiple constants in a single declaration
    {
      code: `export const API_URL = 'https://api.example.com', TIMEOUT = 5000;`,
      filename: 'bundle.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Exported static constant inside .dynamic.tsx
    {
      code: `export const API_URL = 'https://api.example.com'; export const TIMEOUT = 5000;`,
      filename: 'view.dynamic.tsx',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Object destructuring export with SCREAMING_SNAKE_CASE
    {
      code: `const config = { API_URL: 'https://api.example.com', TIMEOUT: 5000 }; export const { API_URL, TIMEOUT } = config;`,
      filename: 'object-destructure.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Nested object destructuring
    {
      code: `const data = { config: { API_URL: 'https://api.example.com' } }; export const { config: { API_URL } } = data;`,
      filename: 'nested-object.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Assignment pattern in destructuring
    {
      code: `const config = { API_URL: undefined }; export const { API_URL = 'fallback' } = config;`,
      filename: 'assignment-pattern.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Array destructuring export
    {
      code: `const config = ['https://api.example.com', 5000]; export const [API_URL, TIMEOUT] = config;`,
      filename: 'array-destructure.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Rest element with SCREAMING_SNAKE_CASE name
    {
      code: `const config = { API_URL: 'x', TIMEOUT: 5000 }; export const { API_URL, ...REST_CONSTANTS } = config;`,
      filename: 'rest-element.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Array destructuring with a hole
    {
      code: `const config = ['https://api.example.com', 5000, 8000]; export const [API_URL, , TIMEOUT] = config;`,
      filename: 'array-hole.dynamic.ts',
      errors: [
        { messageId: 'noStaticConstantInDynamicFile' },
        { messageId: 'noStaticConstantInDynamicFile' },
      ],
    },
    // Array rest element with SCREAMING_SNAKE_CASE
    {
      code: `const urls = ['a', 'b']; export const [...API_URLS] = urls;`,
      filename: 'array-rest.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Nested object pattern inside array pattern
    {
      code: `const configs = [{ API_URL: 'https://api.example.com' }]; export const [{ API_URL }] = configs;`,
      filename: 'array-object.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Nested array pattern inside object pattern
    {
      code: `const configs = { list: [{ API_URL: 'https://api.example.com' }] }; export const { list: [{ API_URL }] } = configs;`,
      filename: 'nested-array-object.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Exported constant with type annotation
    {
      code: `export const API_URL: string = 'https://api.example.com';`,
      filename: 'typed.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Exported constant using const assertion
    {
      code: `export const API_URL = { base: 'https://api.example.com' } as const;`,
      filename: 'const-assertion.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
    // Exported constant initialized from function call (still static name)
    {
      code: `export const API_URL = buildUrl();`,
      filename: 'call-expression.dynamic.ts',
      errors: [{ messageId: 'noStaticConstantInDynamicFile' }],
    },
  ],
});

// Both rules ship in the recommended config and global-const-style is fixable,
// so the pair has to compose. This rule keys on a SCREAMING_SNAKE export name,
// which is exactly what the renamer's fix used to produce — #1599 asked whether
// the resulting report is a false positive (it is not: the constant was
// misplaced before the rename too, and the rename only made it legible).
// global-const-style withholds the rename for every exported declaration
// (#1700), so `--fix` can no longer manufacture the report at all; a
// SCREAMING_SNAKE export in a `.dynamic` file now only ever comes from an
// author. These tests pin both halves — the renamer leaves the export name
// alone, and this rule's own remedy ("move the constant to a non-dynamic module
// and import it") is a fixed point — so neither rule's fixer nor its filter can
// drift the pair into a state that cannot be resolved by hand.
describe('no-static-constants-in-dynamic-files with global-const-style --fix', () => {
  const TARGET_ID = '@blumintinc/blumint/no-static-constants-in-dynamic-files';
  const RENAMER_ID = '@blumintinc/blumint/global-const-style';
  const DYNAMIC_FILE = 'config.dynamic.ts';

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(TARGET_ID, rule as unknown as Rule.RuleModule);
    linter.defineRule(
      RENAMER_ID,
      globalConstStyle as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  const bothRules = { [TARGET_ID]: 'error', [RENAMER_ID]: 'error' } as const;

  it('keys on the SCREAMING name, which the renamer no longer produces', () => {
    const linter = makeLinter();
    const countOn = (code: string) =>
      linter.verify(code, configFor({ [TARGET_ID]: 'error' }), DYNAMIC_FILE)
        .length;

    expect(countOn(`export const apiUrl = 'https://api.example.com';`)).toBe(0);
    expect(countOn(`export const API_URL = 'https://api.example.com';`)).toBe(
      1,
    );
    // The `as const` half of the renamer's fix is not what trips this rule.
    expect(
      countOn(`export const apiUrl = 'https://api.example.com' as const;`),
    ).toBe(0);

    const fixed = linter.verifyAndFix(
      `export const apiUrl = 'https://api.example.com';`,
      configFor({ [RENAMER_ID]: 'error' }),
      DYNAMIC_FILE,
    );
    // The renamer withholds the rename for an exported declaration (#1700), so
    // the export name survives `--fix` and this rule stays silent on the
    // output. Pinning the `as const` half keeps the case from passing
    // vacuously whenever the renamer stops firing altogether.
    expect(fixed.output).toBe(
      `export const apiUrl = 'https://api.example.com' as const;`,
    );
    expect(
      linter.verify(
        fixed.output,
        configFor({ [TARGET_ID]: 'error' }),
        DYNAMIC_FILE,
      ),
    ).toHaveLength(0);
    // The rename violation is still REPORTED on that output — withholding the
    // fix must not weaken detection, or an author would never learn the name
    // needs changing.
    expect(
      linter
        .verify(
          fixed.output,
          configFor({ [RENAMER_ID]: 'error' }),
          DYNAMIC_FILE,
        )
        .map((message) => message.messageId),
    ).toEqual(['upperSnakeCase']);
  });

  it('converges once the constant moves to a non-dynamic module', () => {
    const linter = makeLinter();
    const remedy = [
      `import { API_URL } from './config';`,
      ``,
      `export const useApiUrl = () => API_URL;`,
      ``,
    ].join('\n');

    expect(
      linter.verify(remedy, configFor(bothRules), DYNAMIC_FILE),
    ).toHaveLength(0);
    // Idempotent under both rules: the remedy is a fixed point, not merely a
    // shape the renamer happens to leave alone this pass.
    const refixed = linter.verifyAndFix(
      remedy,
      configFor(bothRules),
      DYNAMIC_FILE,
    );
    expect(refixed.output).toBe(remedy);
    expect(refixed.messages).toHaveLength(0);
  });

  it('converges when the constant is re-exported instead', () => {
    const linter = makeLinter();
    // A re-export keeps the public name unchanged, so it costs no call-site
    // churn at all — neither rule visits an ExportNamedDeclaration with a source.
    for (const remedy of [
      `export { apiUrl } from './config';\n`,
      `export { API_URL } from './config';\n`,
    ]) {
      const refixed = linter.verifyAndFix(
        remedy,
        configFor(bothRules),
        DYNAMIC_FILE,
      );
      expect(refixed.output).toBe(remedy);
      expect(refixed.messages).toHaveLength(0);
    }
  });

  it('leaves the constant alone in a non-dynamic file', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      `export const apiUrl = 'https://api.example.com';`,
      configFor(bothRules),
      'config.ts',
    );
    // Only the `as const` half lands, in this file as in a `.dynamic` one, so
    // the constant keeps the name its importers use. This rule contributes
    // nothing here — the residual message is the renamer's report-only
    // violation, which an author resolves with a project-wide rename.
    expect(fixed.output).toBe(
      `export const apiUrl = 'https://api.example.com' as const;`,
    );
    expect(fixed.messages.map((message) => message.ruleId)).toEqual([
      RENAMER_ID,
    ]);
  });
});
