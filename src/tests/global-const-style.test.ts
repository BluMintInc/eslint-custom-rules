import { Linter, Rule } from 'eslint';
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
    // Issue #1700: withholding the rename FIX for every exported declaration
    // must not absorb the reserved-export exemption, which suppresses the
    // REPORT. A reserved export stays silent rather than carrying a permanent,
    // unfixable violation.
    {
      code: `export const middleware = { matcher: ['/'] } as const;`,
      filename: 'middleware.ts',
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
    // Issue #1605: the names the converter produces must themselves be
    // accepted, otherwise `--fix` feeds the rule its own output pass after pass
    // and the identifier grows without bound.
    {
      code: 'const HTTP_SERVER = { port: 8080 } as const;',
      filename: 'test.ts',
    },
    {
      code: 'const PARSE_HTML_STRING = "<p></p>" as const;',
      filename: 'test.ts',
    },
    {
      code: 'const A_URL = "https://example.com" as const;',
      filename: 'test.ts',
    },
    {
      code: 'const C_O_N_T = 1 as const;',
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

    // Issue #1681: the component exemption classifies the initializer through
    // any type wrapper, and a function expression counts as a function value
    // exactly like an arrow. The shapes below were renamed to SCREAMING_SNAKE,
    // which also blinds every component-keyed sibling rule
    // (semantic-function-prefixes, no-render-function-components,
    // react-memoize-literals) — a SCREAMING_SNAKE binding no longer reads as a
    // component to them.
    {
      code: 'const Row = function (props) { return <div/>; };',
      filename: 'Row.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const M = memo(() => <div/>) satisfies unknown;',
      filename: 'M.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const M2 = memo(() => <div/>)!;',
      filename: 'M2.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    // Issue #1681: a single capital letter already satisfies the
    // UPPER_SNAKE_CASE regex, so `M`/`M2` above cannot fire whatever the rule
    // does. These multi-character names are the ones that actually regressed
    // and are what pins the exemption.
    {
      code: 'const MemoizedRow = memo(() => <div/>) satisfies unknown;',
      filename: 'MemoizedRow.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const MemoizedCell = memo(() => <div/>)!;',
      filename: 'MemoizedCell.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const ForwardedRow = forwardRef((props, ref) => <div ref={ref}/>) satisfies unknown;',
      filename: 'ForwardedRow.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    // Issue #1681: a namespace-imported factory (`React.memo`) is the same
    // component construction as the bare call.
    {
      code: 'const MemoizedList = React.memo(function Foo() { return <div/>; }) satisfies ComponentType;',
      filename: 'MemoizedList.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const MemoizedGrid = React.memo(function Foo() { return <div/>; })!;',
      filename: 'MemoizedGrid.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    // Issue #1681: controls — these shapes are exempt with or without the
    // wrapper-aware classification, and must stay that way.
    {
      code: 'const A = () => <div/>;',
      filename: 'A.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const B = memo(() => <div/>);',
      filename: 'B.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    {
      code: 'const C = memo(() => <div/>) as FC;',
      filename: 'C.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    // Issue #1681: an assertion-wrapped bare arrow is a function value too, so
    // the wrapper no longer defeats the arrow exemption.
    {
      code: 'const MemoizedItem = (() => <div/>) as FC;',
      filename: 'MemoizedItem.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
    },
    // Issue #1681: hooks take the same path as components — every function
    // value is exempt regardless of its name — so the function-expression
    // spelling of a hook mirrors the arrow spelling.
    {
      code: 'const useThing = function () { return useState(0); };',
      filename: 'useThing.ts',
    },
    {
      code: 'const useThing = () => useState(0);',
      filename: 'useThing.ts',
    },
    // Issue #1681: a plain module-level helper written as a function
    // expression is a function value, not module configuration, on the same
    // terms as its arrow equivalent.
    {
      code: 'const toSlug = function (value) { return value.trim(); };',
      filename: 'toSlug.ts',
    },
    {
      code: 'const toSlug = function toSlugImpl(value) { return value.trim(); };',
      filename: 'toSlug.ts',
    },
    // Issue #1681: the exemption for a jest mock handle is likewise keyed on
    // the `as jest.Mock*` cast wherever it sits in the wrapper chain.
    {
      code: 'const mockedFetch = (fetchThing as jest.Mock)!;',
      filename: 'test.ts',
    },
    {
      code: 'const mockedSend = (sendThing as jest.MockedFunction<typeof sendThing>) satisfies unknown;',
      filename: 'test.ts',
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
    // Issue #1375: an initializer already carrying a non-`const` assertion is
    // type-pinned by the author, and a `const` assertion may only be applied to
    // a literal — appending one after an `as`-expression is TS1355, so the rule
    // must not report at all rather than emit uncompilable code.
    {
      code: 'const CONFIG = { a: 1 } as Foo;',
      filename: 'test.ts',
    },
    {
      code: 'const CONFIG = { a: 1 } as unknown as Foo;',
      filename: 'test.ts',
    },
    {
      code: 'const CONFIG = <Foo>{ a: 1 };',
      filename: 'test.ts',
    },
    {
      code: 'const CONFIG = [1, 2] as unknown as Foo[];',
      filename: 'test.ts',
    },
    {
      code: 'const COLORS = ({ primary: "#000" } as ThemeA) as ThemeB;',
      filename: 'test.ts',
    },
    // Issue #1375: a string/number literal under a cast is the same shape.
    {
      code: 'const API_URL = "https://api.example.com" as Brand;',
      filename: 'test.ts',
    },
    {
      code: 'const MAX_RETRIES = 5 as unknown as Count;',
      filename: 'test.ts',
    },
    // Issue #1375: the exact agora shape — the two-rule chain strips the
    // annotation, leaving a bare double cast that must stay unreported.
    {
      code: `
        const PHONE_PROVIDER = {
          providerId: 'phone',
        } as unknown as UserProviderInfo;
      `,
      filename: 'test.ts',
    },
    // Issue #1375: the documented workaround must remain byte-stable — the
    // `as const` sits on the literal where it is legal, then widens.
    {
      code: `
        const PHONE_PROVIDER = {
          providerId: 'phone',
        } as const as unknown as UserProviderInfo;
      `,
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
    // Issue #1418: the reported shape — a re-export aliasing an imported
    // function. UPPER_SNAKE_CASE is never right for a callable, and renaming a
    // re-export breaks every importer (TS2724) since the fixer is single-file.
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        export const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: a default-imported binding aliases the same way.
    {
      code: `
        import toKvStamp from './stampedKvValue';
        export const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: aliasing a locally declared function.
    {
      code: `
        function toKvStamp(source: number) {
          return source * 1000;
        }
        export const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: aliasing a local arrow function, whose own declaration is
    // already exempt — the alias must not be treated more strictly than it.
    {
      code: `
        const toKvStamp = (source: number) => source * 1000;
        export const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: aliasing a class is the same shape as aliasing a function.
    {
      code: `
        class StampedKvValue {}
        export const stampedKvValue = StampedKvValue;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: the exemption is blanket — it does not attempt to resolve
    // what the identifier points at, so aliasing a config constant is exempt
    // too. Aliasing is definitionally not declaring a configuration value, and
    // "prefer false negatives over false positives" settles the trade-off.
    {
      code: [
        'const MAX_RETRIES = 3 as const;',
        'const alias = MAX_RETRIES;',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #1418: a non-exported alias is exempt as well — the value is still
    // not a configuration constant, whatever its visibility.
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: a type-pinned alias unwraps to the same bare identifier, so
    // `as Foo` / `as const` / `<Foo>` / a double cast are all exempt.
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        export const toUsernameSlugStamp = toKvStamp as StampFn;
      `,
      filename: 'test.ts',
    },
    {
      code: [
        'const MAX_RETRIES = 3 as const;',
        'const retryLimit = MAX_RETRIES as const;',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        export const toUsernameSlugStamp = <StampFn>toKvStamp;
      `,
      filename: 'test.ts',
    },
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        export const toUsernameSlugStamp = toKvStamp as unknown as StampFn;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: an alias declared with an explicit type annotation.
    {
      code: `
        import { toKvStamp } from './stampedKvValue';
        export const toUsernameSlugStamp: StampFn = toKvStamp;
      `,
      filename: 'test.ts',
    },
    // Issue #1418: the exemption is not TypeScript-specific.
    {
      code: `
        const toKvStamp = (source) => source * 1000;
        export const toUsernameSlugStamp = toKvStamp;
      `,
      filename: 'test.js',
    },
    // Issue #1418: an alias already spelled UPPER_SNAKE_CASE is untouched too —
    // no `as const` is demanded of it, since a const assertion may only be
    // applied to a literal (TS1355).
    {
      code: [
        'const MAX_RETRIES = 3 as const;',
        'const RETRY_LIMIT = MAX_RETRIES;',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #1418 regression guard: `new X()` initializers stay exempt as
    // dynamic values — the alias exemption does not disturb that path.
    {
      code: `
        class Service {}
        const someService = new Service();
      `,
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
    // still flagged — the reserved-export exemption is scoped to the allowlist
    // and suppresses only the report, never the detection.
    // Issue #1700: the rename fix is withheld for any exported declaration,
    // because its importers live in files this fixer cannot reach.
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
      output: null,
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
    // Issue #1313: a shorthand property `{ fooBar }` desugars to
    // `{ fooBar: fooBar }`. A bare rewrite of the value would also rename the
    // KEY (`{ FOO_BAR }`), silently changing the object's shape. The fix must
    // expand the shorthand to `oldKey: NEW_NAME`, renaming only the value.
    {
      code: [
        'const fooBar = 42 as const;',
        'export const OBJ = { fooBar } as const;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42 as const;',
        'export const OBJ = { fooBar: FOO_BAR } as const;',
      ].join('\n'),
    },
    // Issue #1313: an explicit (non-shorthand) property value is a plain
    // reference — only the value is rewritten, the key stays put.
    {
      code: [
        'const fooBar = 42 as const;',
        'export const OBJ = { timeout: fooBar } as const;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: [
        'const FOO_BAR = 42 as const;',
        'export const OBJ = { timeout: FOO_BAR } as const;',
      ].join('\n'),
    },
    // Issue #1313 safety guard: a re-export specifier `export { fooBar }` binds
    // the public export name to this identifier. Renaming it would change the
    // exported name (a cross-file contract) even though the declaration itself
    // is not an inline `export const`. Report-only.
    {
      code: ['const fooBar = 42 as const;', 'export { fooBar };'].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1375 regression guard: the assertion carve-out must not swallow a
    // BARE literal initializer — the rule's whole purpose. Parentheses are not
    // AST nodes, so this is still a plain ObjectExpression.
    {
      code: 'const CONFIG = ({ a: 1 });',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CONFIG', valueKind: 'an object literal' },
        },
      ],
      output: 'const CONFIG = ({ a: 1 } as const);',
    },
    // Issue #1375 regression guard: bare string and array literals still fire.
    {
      code: 'const API_URL = "https://api.example.com";',
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: 'const API_URL = "https://api.example.com" as const;',
    },
    {
      code: 'const RETRIES = [1, 2, 3];',
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: 'const RETRIES = [1, 2, 3] as const;',
    },
    // Issue #1375: a cast initializer is exempt from `asConst`, but the naming
    // half of the rule is independent and must still fire and autofix.
    {
      code: 'const phoneProvider = { a: 1 } as unknown as Foo;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'phoneProvider', suggestedName: 'PHONE_PROVIDER' },
        },
      ],
      output: 'const PHONE_PROVIDER = { a: 1 } as unknown as Foo;',
    },
    // Issue #1418 control: the rule's core case — a literal configuration
    // value — must keep firing, so a clean scan is trustworthy.
    // Issue #1700: both reports still land; only the export-renaming half of
    // the fix is withheld, so `as const` is applied on its own.
    {
      code: 'export const maxRetries = 3;',
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'maxRetries', suggestedName: 'MAX_RETRIES' },
        },
      ],
      output: 'export const maxRetries = 3 as const;',
    },
    // Issue #1418: `undefined`/`NaN`/`Infinity` parse as identifiers but denote
    // primitive values, not a binding being aliased, so the naming check still
    // applies to them exactly as it does to the literals they stand in for.
    {
      code: 'const someDefault = undefined;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'someDefault', suggestedName: 'SOME_DEFAULT' },
        },
      ],
      output: 'const SOME_DEFAULT = undefined;',
    },
    {
      code: 'const notANumber = NaN;',
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: 'const NOT_A_NUMBER = NaN;',
    },
    {
      code: 'const maxValue = Infinity;',
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: 'const MAX_VALUE = Infinity;',
    },
    // Issue #1418: the exemption covers a BARE identifier only. A member
    // expression reads a property off something rather than aliasing a binding,
    // so it keeps the behavior `isDynamicValue` already gives it.
    {
      code: 'const themeColor = Theme.color;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'themeColor', suggestedName: 'THEME_COLOR' },
        },
      ],
      output: 'const THEME_COLOR = Theme.color;',
    },
    // Issue #1418: the exemption is per declarator — an aliasing declarator in
    // a multi-declarator statement must not silence its literal siblings.
    {
      code: 'const toUsernameSlugStamp = toKvStamp, maxRetries = 3;',
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'maxRetries', suggestedName: 'MAX_RETRIES' },
        },
      ],
      output:
        'const toUsernameSlugStamp = toKvStamp, MAX_RETRIES = 3 as const;',
    },
    // Issue #1418 regression guards: literal, object and array initializers are
    // untouched by the alias exemption and still report both halves of the rule.
    {
      code: 'const apiEndpoint = "https://api.example.com";',
      filename: 'guard.ts',
      errors: [{ messageId: 'asConst' }, { messageId: 'upperSnakeCase' }],
      output: 'const API_ENDPOINT = "https://api.example.com" as const;',
    },
    {
      code: 'const themeColors = { primary: "#000" };',
      filename: 'guard.ts',
      errors: [{ messageId: 'asConst' }, { messageId: 'upperSnakeCase' }],
      output: 'const THEME_COLORS = { primary: "#000" } as const;',
    },
    {
      code: 'const retryDelays = [1, 2, 3];',
      filename: 'guard.ts',
      errors: [{ messageId: 'asConst' }, { messageId: 'upperSnakeCase' }],
      output: 'const RETRY_DELAYS = [1, 2, 3] as const;',
    },
    // Issue #1605: an acronym run is one word, so it is separated from its
    // neighbours rather than exploded letter by letter (`H_T_T_P_SERVER`).
    {
      code: 'const HTTPServer = { port: 8080 } as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'HTTPServer', suggestedName: 'HTTP_SERVER' },
        },
      ],
      output: 'const HTTP_SERVER = { port: 8080 } as const;',
    },
    // Issue #1605: an acronym in the middle of a name keeps its neighbours on
    // both sides.
    {
      code: 'const parseHTMLString = "<p></p>" as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'parseHTMLString',
            suggestedName: 'PARSE_HTML_STRING',
          },
        },
      ],
      output: 'const PARSE_HTML_STRING = "<p></p>" as const;',
    },
    // Issue #1605: a single leading letter is its own word, and the trailing
    // acronym stays whole.
    {
      code: 'const aURL = "https://example.com" as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'aURL', suggestedName: 'A_URL' },
        },
      ],
      output: 'const A_URL = "https://example.com" as const;',
    },
    // Issue #1605: a trailing acronym gets exactly one separator.
    {
      code: 'const fooBAR = 42 as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'fooBAR', suggestedName: 'FOO_BAR' },
        },
      ],
      output: 'const FOO_BAR = 42 as const;',
    },
    // Issue #1605: an acronym adjacent to another word on both sides.
    {
      code: 'const XMLHttpRequestTimeout = 30 as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'XMLHttpRequestTimeout',
            suggestedName: 'XML_HTTP_REQUEST_TIMEOUT',
          },
        },
      ],
      output: 'const XML_HTTP_REQUEST_TIMEOUT = 30 as const;',
    },
    // Issue #1605: a two-letter trailing acronym (`USER_I_D` was the old
    // spelling).
    {
      code: 'const userID = 1 as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'userID', suggestedName: 'USER_ID' },
        },
      ],
      output: 'const USER_ID = 1 as const;',
    },
    // Issue #1605 idempotence guard: a name that already carries separators is
    // a fixed point of the converter. The previous converter re-split every
    // capital, so it doubled the underscores it had itself inserted
    // (`c_O_N_T` -> `C__O__N__T`) and every further `--fix` pass doubled them
    // again, corrupting the source it was fixing.
    {
      code: 'const c_O_N_T = 1 as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'c_O_N_T', suggestedName: 'C_O_N_T' },
        },
      ],
      output: 'const C_O_N_T = 1 as const;',
    },
    // Issue #1605 growth guard: when a sibling rule lowercases the first letter
    // of an already-converted name, the rename adds one boundary and stops.
    // The previous converter re-split every capital it had inserted before
    // (`H_T_T_P__S_E_R_V_E_R`), which is how repeated `--fix` passes diverged.
    {
      code: 'const hTTP_SERVER = { port: 8080 } as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'hTTP_SERVER', suggestedName: 'H_TTP_SERVER' },
        },
      ],
      output: 'const H_TTP_SERVER = { port: 8080 } as const;',
    },
    // Issue #1605: a digit boundary still separates, and the result is stable.
    {
      code: 'const http2Server = { port: 8080 } as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'http2Server', suggestedName: 'HTTP2_SERVER' },
        },
      ],
      output: 'const HTTP2_SERVER = { port: 8080 } as const;',
    },
    // Issue #1605: a leading underscore is still dropped, so the rename lands
    // on a name `isUpperSnakeCase` accepts instead of one the rule would keep
    // re-reporting forever.
    {
      code: 'const _privateThing = 1 as const;',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_privateThing', suggestedName: 'PRIVATE_THING' },
        },
      ],
      output: 'const PRIVATE_THING = 1 as const;',
    },
    // Issue #1681 over-exemption guards: looking through `satisfies`/`!` must
    // expose the wrapped value to the rule's regular checks, never exempt a
    // declaration for being wrapped. A data constant keeps exactly the reports
    // it carries without the wrapper.
    {
      code: 'const config = { a: 1 } satisfies Config;',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'config', suggestedName: 'CONFIG' },
        },
      ],
      output: 'const CONFIG = { a: 1 } satisfies Config;',
    },
    {
      code: 'const value = getValue()!;',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'value', suggestedName: 'VALUE' },
        },
      ],
      output: 'const VALUE = getValue()!;',
    },
    {
      code: 'const maxRetries = 3!;',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'maxRetries', suggestedName: 'MAX_RETRIES' },
        },
      ],
      output: 'const MAX_RETRIES = 3!;',
    },
    {
      code: 'const retryDelays = [1, 2, 3] satisfies number[];',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'retryDelays', suggestedName: 'RETRY_DELAYS' },
        },
      ],
      output: 'const RETRY_DELAYS = [1, 2, 3] satisfies number[];',
    },
    // Issue #1681: the component carve-out stays keyed on the factory name, so
    // an unrelated call wrapped the same way is still a constant declaration.
    {
      code: 'const themeTokens = buildTokens() satisfies Tokens;',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'themeTokens', suggestedName: 'THEME_TOKENS' },
        },
      ],
      output: 'const THEME_TOKENS = buildTokens() satisfies Tokens;',
    },
    // Issue #1681: a plain camelCase data constant is untouched by the wrapper
    // handling and keeps firing both reports.
    {
      code: 'const someConfig = { a: 1 };',
      filename: 'settings.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'someConfig', valueKind: 'an object literal' },
        },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'someConfig', suggestedName: 'SOME_CONFIG' },
        },
      ],
      output: 'const SOME_CONFIG = { a: 1 } as const;',
    },
    // invalid: a bare exported const is reported but NOT renamed — its importers
    // live in other files a single-file fixer cannot reach.
    {
      code: 'export const retryConfig = { attempts: 3 };',
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'retryConfig', suggestedName: 'RETRY_CONFIG' },
        },
      ],
      output: 'export const retryConfig = { attempts: 3 } as const;',
    },
    // invalid: the non-exported twin still renames — proves the guard is scoped to
    // exports and is not a blanket amnesty.
    {
      code: 'const retryConfig = { attempts: 3 };',
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'retryConfig', suggestedName: 'RETRY_CONFIG' },
        },
      ],
      output: 'const RETRY_CONFIG = { attempts: 3 } as const;',
    },
    // Issue #1700: the withheld rename is a fix-level decision, so a violation
    // an exported declaration can never have autofixed is still reported —
    // detection must not weaken alongside the fix.
    {
      code: 'export const _disabled = true;',
      filename: 'functions/src/handler.f.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_disabled', suggestedName: 'DISABLED' },
        },
      ],
      output: null,
    },
    // Issue #1700: the reserved-export exemption is still gated on the
    // declaration being exported, so a local `getStaticProps` remains a plain
    // constant that is both reported and renamed.
    {
      code: 'const getStaticProps = { revalidate: 60 } as const;',
      filename: 'pages/index.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'getStaticProps', suggestedName: 'GET_STATIC_PROPS' },
        },
      ],
      output: 'const GET_STATIC_PROPS = { revalidate: 60 } as const;',
    },
  ],
});

// Issue #1605: RuleTester applies a single fix pass, so it cannot see what
// `--fix` actually does — ESLint re-lints its own output up to ten times per
// file. These cases drive the real multi-pass loop and assert it converges.
describe('global-const-style --fix convergence (Issue #1605)', () => {
  const RULE_ID = 'global-const-style';
  // Stands in for any sibling rule that demands the opposite casing of the same
  // identifier (`enforce-react-type-naming` lowercases React-typed consts).
  // Whether the pair settles on one spelling is a separate design question; what
  // this file owns is that neither rule may grow the identifier.
  const LOWERCASE_FIRST_LETTER = 'lowercase-first-letter';

  const lowercaseFirstLetter: Rule.RuleModule = {
    meta: {
      type: 'suggestion',
      fixable: 'code',
      schema: [],
      messages: { lowercase: 'Start "{{name}}" with a lowercase letter.' },
    },
    create(context) {
      return {
        VariableDeclaration(node) {
          if (node.parent?.type !== 'Program') {
            return;
          }
          for (const declaration of node.declarations) {
            const id = declaration.id;
            if (id.type !== 'Identifier' || !/^[A-Z]/.test(id.name)) {
              continue;
            }
            context.report({
              node: id,
              messageId: 'lowercase',
              data: { name: id.name },
              fix: (fixer) =>
                fixer.replaceTextRange(
                  [id.range[0], id.range[0] + 1],
                  id.name[0].toLowerCase(),
                ),
            });
          }
        },
      };
    },
  };

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(RULE_ID, rule as unknown as Rule.RuleModule);
    linter.defineRule(LOWERCASE_FIRST_LETTER, lowercaseFirstLetter);
    return linter;
  };

  const fixWith = (code: string, rules: Linter.RulesRecord) =>
    createLinter().verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules,
      },
      'constants.ts',
    ).output;

  it('renames an acronym constant once and then leaves it alone', () => {
    const fixed = fixWith('const HTTPServer = { port: 8080 } as const;', {
      [RULE_ID]: 'error',
    });

    expect(fixed).toBe('const HTTP_SERVER = { port: 8080 } as const;');
    expect(fixWith(fixed, { [RULE_ID]: 'error' })).toBe(fixed);
  });

  it('keeps the identifier bounded when a sibling rule reverses the rename', () => {
    const rules: Linter.RulesRecord = {
      [RULE_ID]: 'error',
      [LOWERCASE_FIRST_LETTER]: 'error',
    };
    const code = 'const Content = 1 as const;';

    const fixed = fixWith(code, rules);

    // The two rules disagree about casing, so `--fix` may flip the first letter
    // between runs; what it must never do is accumulate separators. Doubling
    // underscores (`C__O__N__T…`) was the signature of the divergence.
    expect(fixed).not.toMatch(/__/);
    expect(fixed.length).toBeLessThanOrEqual(code.length + 1);
    expect(fixWith(fixed, rules)).toBe(fixed);
  });
});
