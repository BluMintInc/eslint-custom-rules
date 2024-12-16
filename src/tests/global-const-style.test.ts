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
      errors: [
        { messageId: 'upperSnakeCase' },
        { messageId: 'asConst' },
      ],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
  ],
});
