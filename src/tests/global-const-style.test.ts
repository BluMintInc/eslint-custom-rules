import { ruleTesterTs } from '../utils/ruleTester';
import rule from '../rules/global-const-style';

ruleTesterTs.run('global-const-style', rule, {
  valid: [
    // Issue #1257: exported Next.js reserved `config` export must NOT be
    // renamed to UPPER_SNAKE_CASE — Next.js only recognizes the literal
    // export name `config`, so renaming silently breaks the framework.
    {
      code: `export const config = { api: { bodyParser: { sizeLimit: '16kb' } } } as const;`,
      filename: 'pages/api/contact.ts',
    },
    // Issue #1257: edge-runtime config export is likewise exempt from rename.
    {
      code: `export const config = { runtime: 'experimental-edge' } as const;`,
      filename: 'pages/api/time/now.ts',
    },
    // Issue #1257: the exemption covers other Next.js reserved export names,
    // not just `config`, so the allowlist is consulted by name.
    {
      code: `export const getServerSideProps = { revalidate: 60 } as const;`,
      filename: 'pages/index.ts',
    },
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
    // Issue #1186: null/undefined/boolean literals must NOT be flagged for
    // `as const`. `null as const` is invalid TS (TS1355) — the autofix would
    // produce uncompilable code — and `true`/`false`/undefined already carry
    // their literal type, so the assertion is redundant.
    {
      code: 'const DEFAULT_FALLBACK = null;',
      filename: 'test.ts',
    },
    {
      code: 'const DEFAULT_UNDEFINED = undefined;',
      filename: 'test.ts',
    },
    {
      code: 'const DEFAULT_SHOW_ICONS = true;',
      filename: 'test.ts',
    },
    {
      code: 'const DEFAULT_IS_ENABLED = false;',
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
    // Issue #1313: Jest mock handles created via `as jest.Mock*` casts are
    // mutable test doubles, not immutable config. camelCase `mockedX` is the
    // established idiom, so they are exempt from the UPPER_SNAKE_CASE rename.
    {
      code: 'const mockedFetch = fetchData as jest.MockedFunction<typeof fetchData>;',
      filename: 'test.ts',
    },
    {
      code: 'const mockedThing = something as jest.Mock;',
      filename: 'test.ts',
    },
    {
      code: 'const mockedThing = something as jest.Mock<Promise<void>, []>;',
      filename: 'test.ts',
    },
    {
      code: 'const mockedService = service as jest.Mocked<SomeService>;',
      filename: 'test.ts',
    },
    {
      code: 'const mockedClass = SomeClass as jest.MockedClass<typeof SomeClass>;',
      filename: 'test.ts',
    },
    // Jest mock handle followed by downstream mutation via `.mockImplementation`
    // — the canonical usage the exemption exists to allow.
    {
      code: [
        'const mockedFetch = fetchData as jest.MockedFunction<typeof fetchData>;',
        'mockedFetch.mockImplementation(() => Promise.resolve());',
      ].join('\n'),
      filename: 'test.ts',
    },
  ],
  invalid: [
    // Issue #1257: the reserved-export exemption only suppresses the unsafe
    // rename — the `as const` fix is still applied because it never touches
    // the export name and is safe for Next.js.
    {
      code: `export const config = { runtime: 'experimental-edge' };`,
      filename: 'pages/api/time/now.ts',
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'config',
            valueKind: 'an object literal',
          },
        },
      ],
      output: `export const config = { runtime: 'experimental-edge' } as const;`,
    },
    // Issue #1257: a NON-exported `config` is a local, safe to rename, so it
    // is still flagged and autofixed to UPPER_SNAKE_CASE.
    {
      code: 'const config = { timeout: 1000 } as const;',
      filename: 'pages/api/example.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'config',
            suggestedName: 'CONFIG',
          },
        },
      ],
      output: 'const CONFIG = { timeout: 1000 } as const;',
    },
    // Issue #1257: an exported name that is NOT a Next.js reserved export is
    // still flagged and autofixed — the exemption is scoped to the allowlist.
    {
      code: 'export const appConfig = { timeout: 1000 } as const;',
      filename: 'pages/api/example.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'appConfig',
            suggestedName: 'APP_CONFIG',
          },
        },
      ],
      output: 'export const APP_CONFIG = { timeout: 1000 } as const;',
    },
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
    // Issue #1313: the rename must rewrite the declaration AND every reference.
    // The previous fixer renamed only the declaration id, orphaning this use
    // site (a runtime ReferenceError / TS "Cannot find name").
    {
      code: [
        'const fooBar = 42;',
        'export const setup = () => {',
        '  return fooBar + 1;',
        '};',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42;',
        'export const setup = () => {',
        '  return FOO_BAR + 1;',
        '};',
      ].join('\n'),
    },
    // Issue #1313: multiple (2+) references are all rewritten in a single pass.
    {
      code: [
        'const fooBar = 42;',
        'export const useFoo = () => fooBar + 1;',
        'export const useBar = () => fooBar * 2;',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42;',
        'export const useFoo = () => FOO_BAR + 1;',
        'export const useBar = () => FOO_BAR * 2;',
      ].join('\n'),
    },
    // Issue #1313: a member-access reference renames only the object identifier,
    // leaving the property untouched.
    {
      code: [
        'const configObj = { timeout: 1000 } as const;',
        'export const getTimeout = () => configObj.timeout;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const CONFIG_OBJ = { timeout: 1000 } as const;',
        'export const getTimeout = () => CONFIG_OBJ.timeout;',
      ].join('\n'),
    },
    // Issue #1313: references nested inside inner functions are rewritten too.
    {
      code: [
        'const fooBar = 42;',
        'export const outer = () => {',
        '  const inner = () => fooBar + 1;',
        '  return inner();',
        '};',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42;',
        'export const outer = () => {',
        '  const inner = () => FOO_BAR + 1;',
        '  return inner();',
        '};',
      ].join('\n'),
    },
    // Issue #1313: a comment mentioning the old name is left verbatim — only
    // real identifier references are rewritten, never comment text.
    {
      code: [
        'const fooBar = 42;',
        '// references fooBar below',
        'export const setup = () => fooBar + 1;',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42;',
        '// references fooBar below',
        'export const setup = () => FOO_BAR + 1;',
      ].join('\n'),
    },
    // Issue #1313 safety guard: renaming would be captured by a nested binding
    // of the target name, changing which binding the reference resolves to. The
    // violation is still reported, but the fix is suppressed (output: null).
    {
      code: [
        'const fooBar = 42;',
        'export const setup = () => {',
        '  const FOO_BAR = 99;',
        '  return fooBar;',
        '};',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1313 safety guard: the target name already binds a sibling in the
    // declaration scope, so the rename would be a redeclaration. Report-only.
    {
      code: ['const FOO_BAR = 1 as const;', 'const fooBar = 2 as const;'].join(
        '\n',
      ),
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1313 safety guard: an exported symbol with in-file use sites is a
    // cross-file contract whose importers a single-file fixer cannot reach.
    // Report-only rather than emit a partial, contract-breaking rename.
    {
      code: [
        'export const fooBar = 42;',
        'export const setup = () => fooBar + 1;',
      ].join('\n'),
      filename: 'test.js',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
  ],
});
