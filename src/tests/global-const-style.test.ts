import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/global-const-style';

ruleTesterTs.run('global-const-style', rule, {
  valid: [
    // Valid global constants with UPPER_SNAKE_CASE and as const in TypeScript
    {
      code: 'const API_ENDPOINT = "https://api.example.com" as const;',
      filename: 'test.ts',
    },
    {
      code: 'const MAX_RETRIES = 3 as const;',
      filename: 'test.ts',
    },
    // Valid global constants with UPPER_SNAKE_CASE in JavaScript (no as const needed)
    {
      code: 'const API_ENDPOINT = "https://api.example.com";',
      filename: 'test.js',
    },
    {
      code: 'const MAX_RETRIES = 3;',
      filename: 'test.js',
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
    // forwardRef components should not be flagged
    {
      code: `
        import { forwardRef } from 'react';
        const EditableWrapperFileUnmemoized = forwardRef<HTMLElement, EditableWrapperFileProps>(
          EditableWrapperFileReflessUnmemoized,
        ) as typeof EditableWrapperFileReflessUnmemoized;
      `,
      parserOptions: {
        ecmaVersion: 2020,
      },
    },
    // forwardRef with memo should not be flagged
    {
      code: `
        import { forwardRef, memo } from 'react';
        const EditableWrapperFileUnmemoized = forwardRef<HTMLElement, EditableWrapperFileProps>(
          EditableWrapperFileReflessUnmemoized,
        ) as typeof EditableWrapperFileReflessUnmemoized;
        export const EditableWrapperFile = memo(
          EditableWrapperFileUnmemoized,
          withDeepCompareOf('link', 'file'),
        ) as typeof EditableWrapperFileReflessUnmemoized;
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
    // Class instances should be ignored
    {
      code: `
        class FirebaseAdmin {}
        const firebaseAdminInstance = new FirebaseAdmin();
        const { adminApp, db, realtimeDb, storage, bucket, auth, messaging } = firebaseAdminInstance;
      `,
    },
    // Regular expressions should not get as const
    {
      code: 'const NEAR_GLIDER_REGEX = /(?:^|\\s)(left-[1-6]|right-[1-6])(?:\\s|$)/;',
      filename: 'test.ts',
    },
    {
      code: 'const EMAIL_REGEX = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;',
      filename: 'test.ts',
    },
    // Nested assertions that include as const should be accepted
    {
      code: 'const COLORS = ({ primary: "#000" } as const) as ThemeA;',
      filename: 'test.ts',
    },
    // MemberExpression on dynamic values should be ignored (Issue #1130)
    {
      code: `
        import { ExponentialBackoff } from './ExponentialBackoff';
        const CONFIG_429 = {
          initialDelay: 1000,
          maxDelay: 60000,
          factor: 2,
        } as const;
        export const withExponentialBackoff429 = new ExponentialBackoff(
          CONFIG_429,
        ).withExponentialBackoff;
      `,
      filename: 'test.ts',
    },
    {
      code: 'export const helper = new Service().helper;',
      filename: 'test.ts',
    },
    {
      code: 'export const data = fetchData().result;',
      filename: 'test.ts',
    },
    {
      code: 'export const value = (a + b).property;',
      filename: 'test.ts',
    },
    {
      code: 'export const deep = new Class().prop.nested.method;',
      filename: 'test.ts',
    },
    {
      code: 'export const result = new Service()?.method;',
      filename: 'test.ts',
    },
  ],
  invalid: [
    // Missing UPPER_SNAKE_CASE and as const in TypeScript
    {
      code: 'const apiEndpoint = "https://api.example.com" as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'apiEndpoint',
            suggestedName: 'API_ENDPOINT',
          },
        },
      ],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Missing as const in TypeScript
    {
      code: 'const API_ENDPOINT = "https://api.example.com";',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'API_ENDPOINT',
            valueKind: 'a literal value',
          },
        },
      ],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Missing both in TypeScript
    {
      code: 'const apiEndpoint = "https://api.example.com";',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'apiEndpoint',
            valueKind: 'a literal value',
          },
        },
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'apiEndpoint',
            suggestedName: 'API_ENDPOINT',
          },
        },
      ],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    // Missing UPPER_SNAKE_CASE in JavaScript (no as const error)
    {
      code: 'const apiEndpoint = "https://api.example.com";',
      filename: 'test.js',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'apiEndpoint',
            suggestedName: 'API_ENDPOINT',
          },
        },
      ],
      output: 'const API_ENDPOINT = "https://api.example.com";',
    },
    // Array literal missing as const in TypeScript
    {
      code: 'const SHADOWS = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'SHADOWS',
            valueKind: 'an array literal',
          },
        },
      ],
      output:
        'const SHADOWS = ["none", "0px 0px 1px rgba(0,0,0,0.2)"] as const;',
    },
    // Object literal missing as const in TypeScript
    {
      code: 'const COLORS = { primary: "#000", secondary: "#fff" };',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'COLORS',
            valueKind: 'an object literal',
          },
        },
      ],
      output: 'const COLORS = { primary: "#000", secondary: "#fff" } as const;',
    },
    // Nested assertions still report the literal kind
    {
      code: 'const COLORS = ({ primary: "#000" } as ThemeA) as ThemeB;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'COLORS',
            valueKind: 'an object literal',
          },
        },
      ],
      output:
        'const COLORS = ({ primary: "#000" } as ThemeA) as ThemeB as const;',
    },
    // Object with Record type annotation missing UPPER_SNAKE_CASE (no as const error)
    {
      code: 'const displayableNotificationModes: Record<NotificationMode, string> = { sms: "SMS", email: "Email", push: "Push" };',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'displayableNotificationModes',
            suggestedName: 'DISPLAYABLE_NOTIFICATION_MODES',
          },
        },
      ],
      output:
        'const DISPLAYABLE_NOTIFICATION_MODES: Record<NotificationMode, string> = { sms: "SMS", email: "Email", push: "Push" };',
    },
    // Object with explicit type annotation should not get as const error
    {
      code: 'const colors: { primary: string; secondary: string } = { primary: "#000", secondary: "#fff" };',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'colors',
            suggestedName: 'COLORS',
          },
        },
      ],
      output:
        'const COLORS: { primary: string; secondary: string } = { primary: "#000", secondary: "#fff" };',
    },
    // Array with explicit type annotation should not get as const error
    {
      code: 'const shadows: string[] = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'shadows',
            suggestedName: 'SHADOWS',
          },
        },
      ],
      output:
        'const SHADOWS: string[] = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
    },
    // Array literal in JavaScript (no as const error)
    {
      code: 'const shadows = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
      filename: 'test.js',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'shadows',
            suggestedName: 'SHADOWS',
          },
        },
      ],
      output: 'const SHADOWS = ["none", "0px 0px 1px rgba(0,0,0,0.2)"];',
    },
    // Object literal in JavaScript
    {
      code: 'const colors = { primary: "#000", secondary: "#fff" };',
      filename: 'test.js',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'colors',
            suggestedName: 'COLORS',
          },
        },
      ],
      output: 'const COLORS = { primary: "#000", secondary: "#fff" };',
    },
  ],
});
