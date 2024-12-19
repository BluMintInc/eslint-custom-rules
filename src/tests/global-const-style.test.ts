import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/global-const-style';

ruleTesterTs.run('global-const-style', rule, {
  valid: [
    // Valid global constants with UPPER_SNAKE_CASE and as const
    {
      code: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    {
      code: 'const MAX_RETRIES = 3 as const;',
    },
    // Constants inside functions should not be flagged
    {
      code: `
        function test() {
          const apiEndpoint = "https://api.example.com";
          const maxRetries = 3;
        }
      `,
    },
    // Constants inside React function components should not be flagged
    {
      code: `
        import { FC } from 'react';
        const MyComponent: FC = () => {
          const startingFormValues = {
            agreedTermsOfUse: get('agreedTermsOfUse'),
            agreedPrivacyPolicy: get('agreedPrivacyPolicy'),
          };
          return <div>{startingFormValues.agreedTermsOfUse}</div>;
        };
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 2020,
      },
    },
    // Constants inside arrow functions should not be flagged
    {
      code: `
        const handler = () => {
          const defaultConfig = { timeout: 1000 };
          return defaultConfig;
        };
      `,
      parserOptions: {
        ecmaVersion: 2020,
      },
    },


    // Dynamic values should be ignored
    {
      code: 'const API_VERSION = getVersion();',
    },
    // Destructured declarations should be ignored
    {
      code: 'const { apiUrl, maxRetries } = config;',
    },
    // Computed values should be ignored
    {
      code: 'const TIMEOUT_MS = 1000 * 60;',
    },
  ],
  invalid: [
    // Missing UPPER_SNAKE_CASE
    {
      code: 'const apiEndpoint = "https://api.example.com" as const;',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Missing as const
    {
      code: 'const API_ENDPOINT = "https://api.example.com";',
      errors: [{ messageId: 'asConst' }],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Missing both
    {
      code: 'const apiEndpoint = "https://api.example.com";',
      errors: [{ messageId: 'upperSnakeCase' }, { messageId: 'asConst' }],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Array literal missing as const
    {
      code: 'const SHADOWS = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
      errors: [{ messageId: 'asConst' }],
      output: 'const SHADOWS = ["none", "0px 0px 1px rgba(0,0,0,0.2)"] as const;',
    },
    // Object literal missing as const
    {
      code: 'const COLORS = { primary: "#000", secondary: "#fff" };',
      errors: [{ messageId: 'asConst' }],
      output: 'const COLORS = { primary: "#000", secondary: "#fff" } as const;',
    },
    // Array with type annotation missing as const
    {
      code: 'const SHADOWS: Shadows = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
      errors: [{ messageId: 'asConst' }],
      output: 'const SHADOWS: Shadows = ["none", "0px 0px 1px rgba(0,0,0,0.2)"] as const;',
    },
    // Object with type annotation missing as const
    {
      code: 'const COLORS: Colors = { primary: "#000", secondary: "#fff" };',
      errors: [{ messageId: 'asConst' }],
      output: 'const COLORS: Colors = { primary: "#000", secondary: "#fff" } as const;',
    },
  ],
});
