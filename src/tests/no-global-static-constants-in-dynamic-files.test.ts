import { ESLintUtils } from '@typescript-eslint/utils';
import rule, { RULE_NAME } from '../rules/no-global-static-constants-in-dynamic-files';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Regular TypeScript file with SCREAMING_SNAKE_CASE constants (not a dynamic file)
    {
      code: `export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;`,
      filename: 'config.ts',
    },
    // Dynamic file with non-exported SCREAMING_SNAKE_CASE constants
    {
      code: `const LOCAL_TIMEOUT = 5000;`,
      filename: 'helper.dynamic.ts',
    },
    // Dynamic file with exported constants that are not SCREAMING_SNAKE_CASE
    {
      code: `export const apiUrl = 'https://api.example.com';`,
      filename: 'config.dynamic.ts',
    },
    // Dynamic file with dynamic variables
    {
      code: `export const getApiUrl = () => \`https://api.example.com/\${Date.now()}\`;`,
      filename: 'settings.dynamic.ts',
    },
    // Dynamic file importing constants from other files
    {
      code: `import { API_URL } from './config';
export function fetchData() {
  return fetch(API_URL);
}`,
      filename: 'fetchData.dynamic.ts',
    },
    // Dynamic file with function declarations
    {
      code: `export function fetchData() {
  return fetch('https://api.example.com');
}`,
      filename: 'api.dynamic.ts',
    },
    // Dynamic file with class declarations
    {
      code: `export class ApiClient {
  private baseUrl = 'https://api.example.com';

  fetchData() {
    return fetch(this.baseUrl);
  }
}`,
      filename: 'client.dynamic.ts',
    },
  ],
  invalid: [
    // Dynamic file with exported SCREAMING_SNAKE_CASE constants
    {
      code: `export const API_URL = 'https://api.example.com';`,
      filename: 'data.dynamic.ts',
      errors: [{ messageId: 'noGlobalStaticConstantsInDynamicFiles' }],
    },
    // Dynamic file with multiple exported SCREAMING_SNAKE_CASE constants
    {
      code: `export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;`,
      filename: 'config.dynamic.ts',
      errors: [
        { messageId: 'noGlobalStaticConstantsInDynamicFiles' },
        { messageId: 'noGlobalStaticConstantsInDynamicFiles' },
      ],
    },
    // Dynamic file with mixed exported constants (only SCREAMING_SNAKE_CASE should be flagged)
    {
      code: `export const API_URL = 'https://api.example.com';
export const timeout = 5000;`,
      filename: 'mixed.dynamic.ts',
      errors: [{ messageId: 'noGlobalStaticConstantsInDynamicFiles' }],
    },
    // Dynamic TSX file with exported SCREAMING_SNAKE_CASE constants
    {
      code: `export const ERROR_MESSAGE = 'An error occurred';
export function ErrorComponent() {
  return <div>{ERROR_MESSAGE}</div>;
}`,
      filename: 'error.dynamic.tsx',
      errors: [{ messageId: 'noGlobalStaticConstantsInDynamicFiles' }],
    },
    // Dynamic file with multiple variable declarations in a single export
    {
      code: `export const API_URL = 'https://api.example.com', TIMEOUT = 5000;`,
      filename: 'multiple.dynamic.ts',
      errors: [
        { messageId: 'noGlobalStaticConstantsInDynamicFiles' },
        { messageId: 'noGlobalStaticConstantsInDynamicFiles' },
      ],
    },
  ],
});
