import rule, { RULE_NAME } from '../rules/no-static-constants-in-dynamic-files';
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
