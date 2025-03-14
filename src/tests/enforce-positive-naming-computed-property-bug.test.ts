import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

// This test specifically tests the fix for the bug where the rule would crash
// when encountering computed properties in TypeScript interfaces
ruleTesterTs.run('enforce-positive-naming-computed-property-bug', enforcePositiveNaming, {
  valid: [
    // Test with a computed property
    {
      code: `
        export type TestProps = {
          ['computed-property']: boolean;
        };
      `,
      filename: 'test.tsx',
    },
    // Test with a mix of regular and computed properties
    {
      code: `
        export type PulsateProps = {
          children: ReactNode;
          pulsate: boolean;
          ['computed-property']: boolean;
          spacing?: number;
        };
      `,
      filename: 'test.tsx',
    },
    // Test with a string literal property
    {
      code: `
        export type TestProps = {
          'string-literal-property': boolean;
        };
      `,
      filename: 'test.tsx',
    },
    // Test with a numeric property
    {
      code: `
        export type TestProps = {
          0: boolean;
        };
      `,
      filename: 'test.tsx',
    },
  ],
  invalid: [],
});
