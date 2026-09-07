import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
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
    // Issue #2013: a binding that is written through carries no `as const`
    // demand at all — the assertion types the value `readonly`, so the only
    // edit the message asks for is one that stops the file compiling. Spelled
    // UPPER_SNAKE_CASE already, these leave the rule with nothing to say.
    {
      code: 'const ITEMS = [];\nITEMS.push(1);\n',
      filename: 'test.ts',
    },
    {
      code: 'const CONFIG = { a: 1 };\nCONFIG.a = 2;\n',
      filename: 'test.ts',
    },
    {
      code: 'const ITEMS = [];\ndelete ITEMS[0];\n',
      filename: 'test.ts',
    },
    // Issue #2013: the write may sit in any scope the binding reaches, so a
    // mutation from inside a callback counts exactly like a top-level one.
    {
      code: [
        'const ITEMS = [];',
        'export const collect = (value) => {',
        '  ITEMS.push(value);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2324: a mutation performed through an ALIAS writes the very value
    // the assertion would freeze. The alias denotes the binding rather than
    // copying it, so `as const` turns compiling code into TS2339 here exactly
    // as a direct `ITEMS.push(3)` does (measured under `tsc --strict`).
    {
      code: 'const ITEMS = [1, 2];\nconst OTHER = ITEMS;\nOTHER.push(3);\n',
      filename: 'test.ts',
    },
    // Issue #2324 negative control: the direct mutation the alias case above
    // routes one hop away from. Both must leave the rule silent, or the
    // carve-out is keyed on the spelling of the receiver rather than the value.
    {
      code: 'const ITEMS = [1, 2];\nITEMS.push(3);\n',
      filename: 'test.ts',
    },
    // Issue #2327: storing the binding in an object literal does not copy it,
    // so the same array stays reachable through the container and a mutation
    // through it raises the same TS2339 the direct alias does (measured as a
    // ts.Program differential: clean before the fix, TS2339 after).
    {
      code: [
        'const ITEMS = [1, 2];',
        'const HOLDER = { items: ITEMS };',
        'HOLDER.items.push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2327: the shorthand spelling is the same Property node, so the
    // answer must not turn on which spelling the author reached for.
    {
      code: [
        'const ITEMS = [1, 2];',
        'const HOLDER = { ITEMS };',
        'HOLDER.ITEMS.push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2327: an array element retains the reference exactly as a property
    // value does.
    {
      code: [
        'const ITEMS = [1, 2];',
        'const HOLDER = [ITEMS];',
        'HOLDER[0].push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2327: containers nest, and every hop still names the one value.
    {
      code: [
        'const ITEMS = [1, 2];',
        'const HOLDER = { inner: { items: ITEMS } };',
        'HOLDER.inner.items.push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2324: the chain is followed transitively — each hop names the one
    // value, so a mutation two aliases away is still this binding's.
    {
      code: [
        'const ITEMS = [1, 2];',
        'const FIRST_HOP = ITEMS;',
        'const SECOND_HOP = FIRST_HOP;',
        'SECOND_HOP.push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2324: a property WRITE through an alias is a write to the value,
    // not only a mutating method call — `as const` yields TS2540 for it.
    {
      code: 'const CONFIG = { a: 1 };\nconst OTHER = CONFIG;\nOTHER.a = 2;\n',
      filename: 'test.ts',
    },
    // Issue #2324: the alias may be declared in any scope the binding reaches.
    // Its own declaration is invisible at module level, so an answer read off
    // the top-level statements alone would miss this one.
    {
      code: [
        'const ITEMS = [1, 2];',
        'export const collect = (value) => {',
        '  const local = ITEMS;',
        '  local.push(value);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2324: a type wrapper annotates the value without replacing it, so
    // `ITEMS!` aliases the same array and inherits the frozen type with it.
    {
      code: 'const ITEMS = [1, 2];\nconst OTHER = ITEMS!;\nOTHER.push(3);\n',
      filename: 'test.ts',
    },
    // Issue #2324: the declaring KEYWORD does not decide who carries the frozen
    // type. A `let` alias takes its declared type from this initializer just as
    // a `const` one does, so freezing here is the same TS2339 — and reassigning
    // the alias cannot recover mutability, since the reassignment is then
    // rejected against that frozen type.
    {
      code: 'const ITEMS = [1, 2];\nlet scratch = ITEMS;\nscratch.push(3);\n',
      filename: 'test.ts',
    },
    // Issue #2324: an exported alias is reached the same way. Its visibility
    // changes who else can mutate it, never whether this mutation counts.
    {
      code: 'const ITEMS = [1, 2];\nexport const SHARED = ITEMS;\nSHARED.push(3);\n',
      filename: 'test.ts',
    },
    // Issue #2324: a redeclared `var` makes the alias graph lead back on
    // itself — `ITEMS` reaches `first`, `first` reaches `second`, and `second`
    // reaches `first` again — and the mutation sits past the loop. Following
    // the chain has to survive the cycle to reach it.
    {
      code: [
        'const ITEMS = [1, 2];',
        'var first = ITEMS;',
        'var second = first;',
        'var first = second;',
        'second.push(3);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2055: a module-scope const whose binding is used as a JSX element
    // name holds a React component, whatever its initializer looks like. The
    // repro's initializer is a MEMBER EXPRESSION (a component read off a class
    // getter), which #1681's function-value/factory carve-out never reached.
    // Issue #2329: `as const` makes the literal type NON-WIDENING, so a
    // parameter defaulted from the constant narrows from `string` to that one
    // value and every call passing a different one becomes TS2345. Nothing is
    // written here, so the mutation walk alone cannot see it.
    {
      name: 'declines to freeze a constant an unannotated parameter defaults from',
      code: [
        "const REFEREE_ID = 'referee-uid';",
        "const REFERRER_ID = 'referrer-uid';",
        'const buildRequest = (uid = REFEREE_ID, referrerId = REFERRER_ID) => {',
        '  return { uid, referrerId };',
        '};',
        'export const request = buildRequest(REFEREE_ID, REFEREE_ID);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2329: the default may be reached through a container, which
    // retains the reference exactly as it does for the mutation walk.
    {
      name: 'declines when the default reaches the constant through a container',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'const render = (options = { stage: DEFAULT_STAGE }) => options.stage;',
        "export const shown = render({ stage: 'live' });",
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2329: a destructured parameter with no annotation on the
    // pattern infers just the same.
    {
      name: 'declines for an unannotated destructured parameter default',
      code: [
        'const DISTANCE_DEFAULT = 8;',
        'const reveal = ({ distance = DISTANCE_DEFAULT }) => distance;',
        'export const shifted = reveal({ distance: 12 });',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2329: an alias takes its type from the constant, so freezing
    // the constant narrows the alias and the reassignment becomes TS2322. The
    // walk already enrols this alias for #2324; only a write THROUGH it counted.
    {
      name: 'declines to freeze a constant whose alias is reassigned',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'let currentStage = DEFAULT_STAGE;',
        "currentStage = 'live';",
        'export { DEFAULT_STAGE, currentStage };',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to rename a module-scope const used as a JSX element name',
      code: `
const provider = buildProvider();
const Provider = provider.Provider;

const Probe = () => {
  return <Provider docPath="Test/doc"><span /></Provider>;
};
`,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Issue #2331: a spread builds a fresh VALUE but not a fresh TYPE. The copy
    // is mutable, so #2327's container walk rightly refuses it — but the copy's
    // element type is the frozen literal, so `COPY.push(3)` is TS2345 for an
    // input that compiled. The pushed literal has to sit OUTSIDE the frozen
    // union: pushing `1` compiles either way and asserts nothing.
    {
      name: 'declines to freeze an array whose spread copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'const COPY = [...ITEMS];',
        'COPY.push(3);',
        'export { COPY };',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose spread copy is written to',
      code: [
        'const CONFIG = { retries: 3 };',
        'export const run = () => {',
        '  const copy = { ...CONFIG };',
        '  copy.retries = 5;',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose concat copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = ITEMS.concat();',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose slice copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = ITEMS.slice();',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose filter copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = ITEMS.filter(Boolean);',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object copied through Object.assign and written to',
      code: [
        'const CONFIG = { retries: 3 };',
        'export const run = () => {',
        '  const copy = Object.assign({}, CONFIG);',
        '  copy.retries = 5;',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object copied through a bracketed Object.assign',
      code: [
        'const CONFIG = { retries: 3 };',
        'export const run = () => {',
        "  const copy = Object['assign']({}, CONFIG);",
        '  copy.retries = 5;',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose bracketed concat copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        "  const copy = ITEMS['concat']();",
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze a constant whose copy is reassigned wholesale',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  let copy = [...ITEMS];',
        '  copy = [3];',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2331: a class property's type is INFERRED from its initializer
    // exactly as a parameter's is from its default, so freezing the constant
    // narrows the property and `session.stage = 'live'` becomes TS2322.
    {
      name: 'declines to freeze a constant initializing an unannotated class property',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export class Session {',
        '  public stage = DEFAULT_STAGE;',
        '}',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze a constant stored in a literal that initializes a class property',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export class Session {',
        '  public state = { stage: DEFAULT_STAGE };',
        '}',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2336: #2333 admitted an `ObjectPattern` id, described as "a copy
    // destructured into bindings is followed into each of them". `ArrayPattern`
    // is the other half of that category, so the same construct got opposite
    // verdicts: `const { ...rest } = CONFIG; rest.a = 3` withheld while
    // `const [, ...rest] = ITEMS; rest.push(4)` was rewritten into TS2345.
    {
      name: 'declines to freeze an array whose rest of a spread copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [head, ...rest] = [...ITEMS];',
        '  rest.push(3);',
        '  return [head, rest];',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose rest of a slice copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [, ...rest] = ITEMS.slice();',
        '  rest.push(3);',
        '  return rest;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose rest of an Array.from copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [, ...rest] = Array.from(ITEMS);',
        '  rest.push(3);',
        '  return rest;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A rest element involves no copy expression at all: it is itself a fresh
    // array typed from the source, so the assertion narrows it exactly as
    // `slice()` would. This shape is why the walk must admit the pattern id
    // rather than only the copy that feeds it.
    {
      name: 'declines to freeze an array rest-destructured directly and pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [head, ...rest] = ITEMS;',
        '  rest.push(3);',
        '  return [head, rest];',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose rest element is index-assigned',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [, ...rest] = [...ITEMS];',
        '  rest[0] = 9;',
        '  return rest;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A default on an earlier element must not stop the walk reaching the rest.
    {
      name: 'declines to freeze an array whose rest follows a defaulted element',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [head = 0, ...rest] = [...ITEMS];',
        '  rest.push(3);',
        '  return [head, rest];',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2333: `copyExpressionOf` names "the expression that builds a COPY
    // carrying this value's type". These are the category's other members —
    // each compiles, is rewritten by `--fix` at v1.21.9, and then does not.
    {
      name: 'declines to freeze an array whose Array.from copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = Array.from(ITEMS);',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flat copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = ITEMS.flat();',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose toSorted copy is pushed to',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = ITEMS.toSorted();',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose structuredClone copy is written to',
      code: [
        'const CONFIG = { retries: 3 };',
        'export const run = () => {',
        '  const copy = structuredClone(CONFIG);',
        '  copy.retries = 5;',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A copy destructured into bindings carries the frozen type into each of
    // them, so the alias walk has to accept a pattern id rather than only an
    // identifier.
    {
      name: 'declines to freeze a constant destructured out of a spread copy and written',
      code: [
        'const CONFIG = { items: [1, 2] };',
        'export const run = () => {',
        '  const { items } = { ...CONFIG };',
        '  items.push(3);',
        '  return items;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2333: a constructor parameter property is a parameter AND declares
    // a class property, so it infers twice over. #2329's walk stopped at the
    // `TSParameterProperty` before it could reach the constructor's params.
    {
      name: 'declines to freeze a constant defaulting a constructor parameter property',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export class Session {',
        '  constructor(public stage = DEFAULT_STAGE) {}',
        '}',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2338: a binding introduced by ITERATING the constant is typed from
    // it — it carries the ELEMENT type rather than the whole value — so a write
    // through that binding breaks on the assertion exactly as a write through
    // an alias does. Every shape below compiles, was rewritten by `--fix`, and
    // then did not compile; the diagnostic each produced is named beside it.
    {
      name: 'declines to freeze an array whose for-of element has a property written',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const run = () => {',
        '  for (const item of ITEMS) {',
        "    item.label = 'b';",
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // TS2339: the nested array is frozen with the object that holds it.
    {
      name: 'declines to freeze an array whose for-of element has a nested array pushed to',
      code: [
        "const ITEMS = [{ tags: ['x'] }];",
        'export const run = () => {',
        '  for (const item of ITEMS) {',
        "    item.tags.push('y');",
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The head is accepted in all three binding spellings, on the same terms as
    // `aliasDeclaratorOf` accepts all three declarator spellings (#2336): every
    // name a pattern introduces is typed from the value it destructures.
    {
      name: 'declines to freeze an array whose for-of ARRAY pattern rest is pushed to',
      code: [
        'const PAIRS = [[1, 2, 3]];',
        'export const run = () => {',
        '  for (const [head, ...rest] of PAIRS) {',
        '    rest.push(head);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose for-of OBJECT pattern member is written',
      code: [
        'const ROWS = [{ meta: { n: 1 } }];',
        'export const run = () => {',
        '  for (const { meta } of ROWS) {',
        '    meta.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose for-of destructured element is pushed to',
      code: [
        "const ROWS = [{ tags: ['x'] }];",
        'export const run = () => {',
        '  for (const { tags } of ROWS) {',
        "    tags.push('y');",
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A PROPERTY of the constant is frozen with the object that holds it, and
    // the alias walk refuses a reference reached through a member access — so
    // the iterated expression is read through its member path.
    {
      name: 'declines to freeze an object iterated through a member path',
      code: [
        'const CONFIG = { list: [{ n: 1 }] };',
        'export const run = () => {',
        '  for (const item of CONFIG.list) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `for await` is the same node with `await` set and binds its element the
    // same way, so the flag is not screened.
    {
      name: 'declines to freeze an array whose for-await element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = async () => {',
        '  for await (const item of ITEMS) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose forEach parameter is written',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const run = () => {',
        '  ITEMS.forEach((item) => {',
        "    item.label = 'b';",
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The callback may be a `FunctionExpression`: the two spellings bind their
    // parameter identically.
    {
      name: 'declines to freeze an array whose function-expression callback parameter is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.forEach(function (item) {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose map parameter is written',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const lengths = () =>',
        '  ITEMS.map((item) => {',
        "    item.label = 'b';",
        '    return item.label.length;',
        '  });',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The method name is read through `accessedPropertyName`, so the bracketed
    // spelling cannot diverge from the dotted one.
    {
      name: 'declines to freeze an array whose bracket-spelled forEach parameter is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  ITEMS['forEach']((item) => {",
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `reduce` passes the accumulator FIRST and the element second, so the
    // element parameter is read by position rather than assumed to be first.
    {
      name: 'declines to freeze an array whose reduce element parameter is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const total = ITEMS.reduce((acc, item) => {',
        '  item.n = 2;',
        '  return acc + item.n;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose reduceRight element parameter is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const total = ITEMS.reduceRight((acc, item) => {',
        '  item.n = 2;',
        '  return acc + item.n;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose filter parameter is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const kept = ITEMS.filter((item) => {',
        '  item.n = 2;',
        '  return item.n > 1;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The receiver of the iteration is routinely one step removed from the
    // constant. Each derivation builds a fresh OUTER value whose elements are
    // still the frozen ones, so the element binding breaks identically.
    {
      name: 'declines to freeze an array whose spread copy is iterated and written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item) => {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose filtered copy is iterated and written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.filter(Boolean).forEach((item) => {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose slice copy is iterated in a for-of and written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of ITEMS.slice()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `Object.values`/`Object.entries` build a fresh array whose ELEMENTS are
    // the constant's own property values, so freezing the constant retypes them
    // exactly as it retypes an array's elements.
    {
      name: 'declines to freeze an object whose Object.values elements are written',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  Object.values(CONFIG).forEach((value) => {',
        '    value.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.entries value is written',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  for (const [key, value] of Object.entries(CONFIG)) {',
        '    value.n = key.length;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The enrolled binding is walked like any other: an alias taken from the
    // element is followed on to the write.
    {
      name: 'declines to freeze an array whose for-of element is aliased and then written',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const run = () => {',
        '  for (const item of ITEMS) {',
        '    const alias = item;',
        "    alias.label = 'b';",
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A loop variable REASSIGNED in the body takes the frozen element type from
    // the head, so the assignment is rejected against it. Only the head's own
    // write establishes the binding.
    {
      name: 'declines to freeze an array whose for-of element binding is reassigned',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const run = () => {',
        '  for (let item of ITEMS) {',
        "    item = { label: 'b' };",
        '    return item;',
        '  }',
        '  return null;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2339: the callback parameter AFTER the index is the RECEIVER ARRAY
    // itself, a second name for the constant, so a mutating call through it is a
    // write to the constant — the same write the rule already declines for when
    // it is spelled directly as `ITEMS.push(2)`. Only the handed-node spelling
    // escaped. Every case below compiles, and stops compiling once the assertion
    // is applied by hand; the diagnostic each produces is named beside it.
    // TS2339: `push` does not exist on the frozen `readonly` array.
    {
      name: 'declines to freeze an array whose forEach array parameter is mutated',
      code: [
        'const ITEMS = [{ label: 1 }];',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    arr.push({ label: 2 });',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `reduce`/`reduceRight` spend the first position on the accumulator, so the
    // array arrives FOURTH rather than third. TS2339.
    {
      name: 'declines to freeze an array whose reduce array parameter is mutated',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const total = ITEMS.reduce((acc, cur, index, arr) => {',
        '  arr.pop();',
        '  return acc + cur;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // TS2542 + TS2322: an index signature on a `readonly` array permits reading
    // only, so a write through the array parameter is rejected twice over.
    {
      name: 'declines to freeze an array whose map array parameter is written through an index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = ITEMS.map((item, index, arr) => {',
        '  arr[0] = { n: 2 };',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The two callback spellings bind their parameters identically. TS2339.
    {
      name: 'declines to freeze an array whose function-expression callback array parameter is mutated',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  ITEMS.forEach(function (item, index, arr) {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The method name is read through `accessedPropertyName`, so the bracketed
    // spelling cannot diverge from the dotted one. TS2339.
    {
      name: 'declines to freeze an array whose bracket-spelled forEach array parameter is mutated',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        "  ITEMS['forEach']((item, index, arr) => {",
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A PROPERTY of the constant is frozen with the object that holds it, and the
    // iterated expression is read through its member path. TS2339.
    {
      name: 'declines to freeze an object whose array parameter is mutated through a member path',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        '  CONFIG.list.forEach((item, index, arr) => {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The enrolled parameter is walked like any other binding, so an alias taken
    // from it is followed on to the write. TS2339.
    {
      name: 'declines to freeze an array whose array parameter is aliased and then mutated',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    const rest = arr;',
        '    rest.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose reduceRight array parameter is mutated',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const total = ITEMS.reduceRight((acc, cur, index, arr) => {',
        '  arr.pop();',
        '  return acc + cur;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Every method that hands its callback the receiver is enrolled, whatever the
    // method computes from it. TS2339 on each.
    {
      name: 'declines to freeze an array whose some array parameter is sorted',
      code: [
        'const ITEMS = [3, 1, 2];',
        'export const run = () => {',
        '  return ITEMS.some((item, index, arr) => {',
        '    arr.sort();',
        '    return item > 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose filter array parameter is reversed',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const kept = ITEMS.filter((item, index, arr) => {',
        '  arr.reverse();',
        '  return item > 1;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `flatMap` alone declares the parameter `T[]` where its siblings declare it
    // `readonly T[]`, so a mutating method through it survives the assertion. Its
    // ELEMENTS are frozen regardless, which is the break enrolling it catches:
    // TS2540, assignment to a read-only property.
    {
      name: 'declines to freeze an array whose flatMap array parameter has an element written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr[0].n = 2;',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose find array parameter is sorted',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const found = ITEMS.find((item, index, arr) => {',
        '  arr.sort();',
        '  return item > 1;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose every array parameter is reversed',
      code: [
        'const ITEMS = [1, 2];',
        'export const all = ITEMS.every((item, index, arr) => {',
        '  arr.reverse();',
        '  return item > 0;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2340: four more ways a binding typed from the constant's ELEMENTS
    // reaches a callback or a loop head. Every case below compiles, and stops
    // compiling with TS2540 once the assertion is applied by hand — measured as
    // a ts.Program differential, one live fixture per program.
    //
    // `values`/`entries` hand back an ITERATOR, which is neither a copy nor a
    // callback, so the element they yield reached no map the walk reads.
    {
      name: 'declines to freeze an array whose entries() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const [index, item] of ITEMS.entries()) {',
        '    item.n = index;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The pair `entries` yields carries the element in its second slot, so the
    // write reaches the frozen element through an index rather than a name.
    {
      name: 'declines to freeze an array whose entries() pair is written through its index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const entry of ITEMS.entries()) {',
        '    entry[1].n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose values() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of ITEMS.values()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `for await` is the same node with `await` set and binds its element the
    // same way, so the flag is not screened here either.
    {
      name: 'declines to freeze an array whose for-await values() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = async () => {',
        '  for await (const item of ITEMS.values()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A spread of the iterator builds an array of the same frozen elements, so
    // the derivation walk reaches the callback through two hops.
    {
      name: 'declines to freeze an array whose spread entries() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS.entries()].forEach(([index, item]) => {',
        '    item.n = index;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose spread values() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS.values()].forEach((item) => {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A PROPERTY of the constant is frozen with the object that holds it, so the
    // iterator taken from the member path yields frozen elements too.
    {
      name: 'declines to freeze an object whose member path values() element is written',
      code: [
        'const CONFIG = { list: [{ n: 1 }] };',
        'export const run = () => {',
        '  for (const item of CONFIG.list.values()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The declaring keyword is not screened: a `let` head takes its type from
    // the iterated value exactly as a `const` head does.
    {
      name: 'declines to freeze an array whose let head over values() is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (let item of ITEMS.values()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `Array.from(X, mapfn)` hands the mapper each element of `X`. The
    // two-argument form is no COPY — the mapper retypes the result — but that
    // says nothing about the element the mapper is handed.
    {
      name: 'declines to freeze an array whose Array.from mapper writes its element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = Array.from(ITEMS, (item) => {',
        '  item.n = 2;',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose Array.from function-expression mapper writes its element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = Array.from(ITEMS, function (item) {',
        '  item.n = 2;',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The mapper takes the element first and the index second, so declaring the
    // index does not move the enrolled position.
    {
      name: 'declines to freeze an array whose Array.from mapper writes its element beside an index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = Array.from(ITEMS, (item, index) => {',
        '  item.n = index;',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose member path Array.from mapper writes its element',
      code: [
        'const CONFIG = { list: [{ n: 1 }] };',
        'export const out = Array.from(CONFIG.list, (item) => {',
        '  item.n = 2;',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `new Set(ITEMS)` holds the constant's own contents, so its head and its
    // callback are second names for the frozen elements.
    {
      name: 'declines to freeze an array whose Set head element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of new Set(ITEMS)) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose Set forEach element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  new Set(ITEMS).forEach((item) => {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Two derivation steps. Each hop keeps the element type, so the chain keeps
    // it too — the one-hop spelling beside each of these already declines, and a
    // walk that stopped after one step gave two spellings of one construct
    // opposite verdicts.
    {
      name: 'declines to freeze an array whose filtered then sliced element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.filter(Boolean)',
        '    .slice()',
        '    .forEach((item) => {',
        '      item.n = 2;',
        '    });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose twice-sliced head element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of ITEMS.slice().slice()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose spread copy is sliced before its element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].slice().forEach((item) => {',
        '    item.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.values array is sliced before its element is written',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  Object.values(CONFIG)',
        '    .slice()',
        '    .forEach((item) => {',
        '      item.n = 2;',
        '    });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `flatMap`'s array parameter is declared MUTABLE, so a mutating call
    // through it cannot be a readonly violation — but it can still INTRODUCE a
    // value the narrowed element type has to accept. A fresh literal is typed
    // independently of the constant, so freezing narrows the parameter out from
    // under it: TS2322 for an input that compiled.
    {
      name: 'declines to freeze an array whose flatMap array parameter is appended to with a literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.push({ n: 3 });',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `splice` spends its first two arguments on the start index and the delete
    // count, so the inserted value is the third — and a literal there breaks
    // exactly as one passed to `push` does.
    {
      name: 'declines to freeze an array whose flatMap array parameter is spliced with a literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.splice(0, 1, { n: 3 });',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `fill` writes ONE value, at its first argument.
    {
      name: 'declines to freeze an array whose flatMap array parameter is filled with a literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.fill({ n: 3 });',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A value read from a binding the constant never typed is foreign however
    // it is spelled: this one is an ordinary local, and freezing the constant
    // narrows the parameter away from it (TS2345).
    {
      name: 'declines to freeze an array whose flatMap array parameter is appended to with a foreign binding',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  const foreign = { n: 3 };',
        '  arr.push(foreign);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A SPREAD argument is treated as foreign even when it spreads the constant
    // itself, whose elements do satisfy the narrowed type. The decline costs a
    // report on a call that would have compiled, which is the cheap error of the
    // two — the assertion is withheld rather than emitted into a break.
    {
      name: 'declines to freeze an array whose flatMap array parameter is appended to with a spread',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.push(...ITEMS);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2341: a binding initialized from a MEMBER ACCESS on the constant
    // names the constant's own frozen contents — `as const` freezes in depth,
    // so a property carries the assertion exactly as the object does. Every
    // case below compiles and stops compiling once the assertion is applied by
    // hand, measured as a ts.Program differential with one live fixture per
    // program. The alias walk refused all of them because it was asked only
    // when the reference was NOT the base of a member access, while the
    // DESTRUCTURED spelling of the same extraction was enrolled all along.
    {
      name: 'declines to freeze an object whose property alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const items = CONFIG.list;',
        '  items.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // An ELEMENT reached by index is frozen with the array that holds it.
    {
      name: 'declines to freeze an array whose element alias is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const first = ITEMS[0];',
        '  first.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A computed STRING key names the same property the dotted spelling does,
    // so the extraction cannot be decided by which syntax reaches it.
    {
      name: 'declines to freeze an object whose string-keyed alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        "  const items = CONFIG['list'];",
        '  items.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The path may be any depth: every step of it is frozen by the one
    // assertion on the constant.
    {
      name: 'declines to freeze an object whose nested-path alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const rowList = CONFIG.nested.rows;',
        '  rowList.push({ n: 2 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The declaring KEYWORD does not decide who carries the frozen type.
    {
      name: 'declines to freeze an object whose property alias is declared with let',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  let items = CONFIG.list;',
        '  items.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `?.` and `!` annotate the ACCESS rather than replace it, so the path is
    // rooted at the constant either way.
    {
      name: 'declines to freeze an object whose optional-chained alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const list = CONFIG?.list;',
        '  list.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose non-null-asserted alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const list = CONFIG.list!;',
        '  list.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The alias may be declared in any scope the constant reaches, module
    // scope included.
    {
      name: 'declines to freeze an object whose module-scope property alias is mutated',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'const PICKED = CONFIG.list;',
        'export const run = () => {',
        '  PICKED.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Destructuring the RESULT of a member access is two hops, not one: the
    // path is resolved first and the pattern then binds its contents.
    {
      name: 'declines to freeze an object destructured through a member path',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const { rows } = CONFIG.nested;',
        '  rows.push({ n: 2 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object array-destructured through a member path',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const [first] = CONFIG.nested.rows;',
        '  first.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The pattern screen withholds the enrolment only where `as const` stops.
    // With no cast in the way it reaches the destructured property exactly as
    // it reaches the member-access spelling, so both decline together.
    {
      name: 'declines to freeze an object whose destructured member is written',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        '  const { list } = CONFIG;',
        '  list.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose renamed destructured member is written',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        '  const { list: entries } = CONFIG;',
        '  entries.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose nested destructured member is written',
      code: [
        'const CONFIG = { outer: { inner: [1] } };',
        'export const run = () => {',
        '  const { outer: { inner } } = CONFIG;',
        '  inner.push(2);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose computed-key destructured member is written',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        "  const { ['list']: entries } = CONFIG;",
        '  entries.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A REST element gathers whatever the pattern did not name, which no single
    // literal value answers for, so it stays enrolled however the named
    // siblings are screened.
    {
      name: 'declines to freeze an object rest-destructured and written through',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        '  const { ...rest } = CONFIG;',
        '  rest.list.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The write need not land on the alias itself — an element of it is the
    // same frozen value reached one step further along.
    {
      name: 'declines to freeze an object whose property alias has an element written',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const rowList = CONFIG.nested.rows;',
        '  rowList[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A sibling declarator does not change which binding the initializer
    // types, so the alias is enrolled from a multi-declarator statement too.
    {
      name: 'declines to freeze an object whose property alias shares its declaration',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const items = CONFIG.list, step = 1;',
        '  items.push(step);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A PRIMITIVE property is frozen to its literal type, so reassigning the
    // binding it initializes is TS2322 rather than a mutation.
    {
      name: 'declines to freeze an object whose primitive property alias is reassigned',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  let level = CONFIG.mode;',
        '  level = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A copy taken OF a member path carries the frozen element type into a
    // fresh array, exactly as a copy of the constant itself does — the copy
    // walk was applied to the constant's own reference alone.
    {
      name: 'declines to freeze an object whose member-path copy is written',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const copy = CONFIG.nested.rows.slice();',
        '  copy[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose member-path spread copy is written',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const copy = [...CONFIG.nested.rows];',
        '  copy[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Scope depth is not screened: the alias is enrolled wherever the
    // constant's reference reaches.
    {
      name: 'declines to freeze an object whose property alias is mutated in a nested function',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const outer = () => () => {',
        '  const items = CONFIG.list;',
        '  items.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2341 arm B: `at`, `find`, `findLast` and the SEEDLESS folds hand
    // back an ELEMENT of the receiver rather than a container over it, so the
    // binding they initialize carries the assertion the way an indexed read
    // does. They belong with the element family rather than with the copy
    // methods, whose results are fresh containers.
    {
      name: 'declines to freeze an array whose at() result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const first = ITEMS.at(0)!;',
        '  first.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose find() result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const found = ITEMS.find((item) => item.n === 1)!;',
        '  found.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose findLast() result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const found = ITEMS.findLast((item) => item.n === 1)!;',
        '  found.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The seedless overload takes the FIRST ELEMENT as its seed, so the fold's
    // result is typed `T` and carries the constant's frozen element.
    {
      name: 'declines to freeze an array whose seedless reduce() result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const last = ITEMS.reduce((previous, item) => item);',
        '  last.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose seedless reduceRight() result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const first = ITEMS.reduceRight((previous, item) => item);',
        '  first.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2341 arm C: `Set.prototype.keys` is an ALIAS for `values`, and a
    // `Map`'s hands back the frozen key of each entry — so `keys` yields
    // indices only for an ARRAY receiver, which is the receiver its exclusion
    // was justified against. The `for…of` and `forEach` spellings over the
    // same `new Set(ITEMS)` were declined all along.
    {
      name: 'declines to freeze an array whose derived Set keys() element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of new Set(ITEMS).keys()) {',
        '    item.n = 2;',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A frozen tuple's `length` is the LITERAL `3`, not `number`, so the
    // enrolment is not array-only: any member read of the constant carries the
    // assertion, a primitive one included.
    {
      name: 'declines to freeze an array whose length alias is reassigned',
      code: [
        'const NUMS = [1, 2, 3];',
        'export const run = () => {',
        '  let size = NUMS.length;',
        '  size = 5;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose indexed primitive alias is reassigned',
      code: [
        'const NUMS = [1, 2, 3];',
        'export const run = () => {',
        '  let head = NUMS[0];',
        '  head = 9;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2342: `map` was excluded because "its result is typed from the
    // CALLBACK, so the constant's type reaches it only for a callback that
    // returns its argument unchanged — a no-op map". The premise is measured
    // false. The frozen type reaches the result whenever the callback returns
    // the element OR AN ACCESS PATH ROOTED AT IT, and `(x) => x.n` is the
    // commonest mapper written: over a frozen `[{ n: 1 }]` it yields `1[]`
    // rather than `number[]`, so a later `push` is TS2345.
    {
      name: 'declines to freeze an array whose mapped property result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map((item) => item.n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The no-op spelling the exclusion's own comment concedes.
    {
      name: 'declines to freeze an array whose no-op mapped result is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.map((item) => item);',
        '  copies[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The question is what the callback HANDS BACK, not which body syntax
    // spells it, so a block body and a function expression are read the same.
    {
      name: 'declines to freeze an array whose block-bodied mapper returns the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map((item) => {',
        '    return item.n;',
        '  });',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose function-expression mapper returns the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.map(function (item) {',
        '    return item;',
        '  });',
        '  copies[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `Array.from(X, fn)` was excluded by pointing at `map`'s premise, so
    // overturning that premise overturns this one: the same mapper keeps the
    // same frozen type through the sibling spelling.
    {
      name: 'declines to freeze an array whose Array.from mapper returns the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = Array.from(ITEMS, (item) => item.n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A container RETAINS the member path rather than copying it, so the one
    // frozen value is reachable through the container that holds it.
    {
      name: 'declines to freeze an object whose member path is stored in a container',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const holder = { rows: CONFIG.nested.rows };',
        '  holder.rows.push({ n: 2 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The element family and the member path compose: an element taken out of
    // a PROPERTY of the constant is frozen by the same assertion.
    {
      name: 'declines to freeze an object whose member-path at() result is written',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const row = CONFIG.nested.rows.at(0)!;',
        '  row.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose member-path find() result is written',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const row = CONFIG.nested.rows.find((item) => item.n === 1)!;',
        '  row.n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2349: the element parameter was matched by NAME, which required it
    // to be an Identifier, so every DESTRUCTURED spelling was misread as a
    // mapper that computes and the constant was frozen under it. Destructuring
    // and member access are two spellings of one extraction — the equivalence
    // #2341 established for the constant's own bindings — so `({ n }) => n`
    // keeps the frozen type exactly as `(x) => x.n` does, and `counts.push(3)`
    // is TS2345 for an input that compiled.
    {
      name: 'declines to freeze an array whose destructured mapper returns the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map(({ n }) => n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The walk must read the names a pattern INTRODUCES rather than the keys it
    // reads, because a renamed binding is the same extraction under a name the
    // constant never spells.
    {
      name: 'declines to freeze an array whose renamed destructured mapper returns the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map(({ n: value }) => value);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose array-destructured mapper returns the head',
      code: [
        'const ITEMS = [[1, 2]];',
        'export const run = () => {',
        '  const heads = ITEMS.map(([head]) => head);',
        '  heads.push(9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose nested-destructured mapper returns the property',
      code: [
        'const ITEMS = [{ inner: { n: 1 } }];',
        'export const run = () => {',
        '  const counts = ITEMS.map(({ inner: { n } }) => n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A REST name holds whatever the pattern did not name, so it carries the
    // frozen type exactly as a named property does.
    {
      name: 'declines to freeze an array whose object-rest mapper returns the rest',
      code: [
        'const ITEMS = [{ n: 1, m: 2 }];',
        'export const run = () => {',
        '  const rests = ITEMS.map(({ n, ...rest }) => rest);',
        '  rests.push({ m: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose array-rest mapper returns the tail',
      code: [
        'const ITEMS = [[1, 2, 3]];',
        'export const run = () => {',
        '  const tails = ITEMS.map(([, ...rest]) => rest);',
        '  tails.push([9]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A REST PARAMETER gathers the arguments the caller passes, so its first
    // slot is the element under another spelling.
    {
      name: 'declines to freeze an array whose rest-parameter mapper returns the first argument',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.map((...args) => args[0]);',
        '  copies.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The body syntax is not the question, so a block-bodied destructured
    // mapper is read on the same terms as the expression-bodied one.
    {
      name: 'declines to freeze an array whose block-bodied destructured mapper returns the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map(({ n }) => {',
        '    return n;',
        '  });',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `Array.from(X, fn)` carries the same mapper, so the parameter spelling
    // must not decide the sibling call differently either.
    {
      name: 'declines to freeze an array whose Array.from mapper destructures the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = Array.from(ITEMS, ({ n }) => n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2349, second group: a returned value that is not an access path
    // can still be typed FROM the element. The positions whose types compose
    // the result's are followed — the branches of a conditional or a logical
    // operator, a sequence's last expression, the parts of a container literal,
    // and the operand of an `await`.
    {
      name: 'declines to freeze an array whose mapper spreads the element into an object literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.map((x) => ({ ...x }));',
        '  copies.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose mapper spreads the element into an array literal',
      code: [
        'const ITEMS = [[1, 2]];',
        'export const run = () => {',
        '  const copies = ITEMS.map((x) => [...x]);',
        '  copies.push([9]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose mapper wraps the element in an array',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const wrapped = ITEMS.map((x) => [x]);',
        '  wrapped.push([{ n: 9 }]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose mapper puts the element property in an object literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const rows = ITEMS.map((x) => ({ n: x.n }));',
        '  rows.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Destructure then rebuild is the two halves of the gap in one mapper.
    {
      name: 'declines to freeze an array whose mapper rebuilds a destructured property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const rows = ITEMS.map(({ n }) => ({ n }));',
        '  rows.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A whole `ConditionalExpression` is ONE returned value, so without the
    // descent neither branch is ever tested against the element even though
    // both are access paths rooted at it.
    {
      name: 'declines to freeze an array whose mapper returns a property in each ternary branch',
      code: [
        'const ITEMS = [{ n: 1, m: 2 }];',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => (x.n > 0 ? x.n : x.m));',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose block-bodied mapper returns a ternary over properties',
      code: [
        'const ITEMS = [{ n: 1, m: 2 }];',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => {',
        '    return x.n > 0 ? x.n : x.m;',
        '  });',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose mapper returns a property through a logical operator',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => x.n || 0);',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose mapper returns a property as a sequence tail',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => (console.log(x), x.n));',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `await` unwraps rather than widens, so the frozen type reaches the
    // promise the mapper hands back.
    {
      name: 'declines to freeze an array whose async mapper awaits a property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const values = ITEMS.map(async (x) => await x.n);',
        '  values.push(Promise.resolve(3));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2351: a mapper handing back a CLOSURE hands back the closure's own
    // type, which the element's type composes — so the frozen element reaches
    // the mapped array through it. `(item) => () => item` over a frozen
    // `[{ n: 1 }]` yields `(() => { readonly n: 1 })[]`, and every insertion
    // below is a build break under `--fix` for an input that compiled. The
    // fixture this replaces closed on `makers.reverse()`, which rearranges the
    // elements it already holds and inserts nothing, so it could not break
    // under ANY element type and passed whichever way the boundary was drawn.
    {
      name: 'declines to freeze an array whose mapper returns a closure over the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item);',
        '  makers.push(() => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Every insertion spelling reaches the same element type, so the verdict
    // cannot depend on which one the mutation is written with.
    {
      name: 'declines to freeze an array whose closure-mapped result is unshifted',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item);',
        '  makers.unshift(() => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose closure-mapped result is spliced into',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item);',
        '  makers.splice(0, 0, () => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A closure returning a PROPERTY of the element carries that property's
    // frozen type on the same terms a bare mapper does.
    {
      name: 'declines to freeze an array whose mapper returns a closure over an element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item.n);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `flatMap` composes its result from the same closure type, so wrapping the
    // closure in the array literal it flattens changes nothing.
    {
      name: 'declines to freeze an array whose flatMap mapper wraps a closure over the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.flatMap((item) => [() => item]);',
        '  makers.push(() => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The body syntax that spells the closure is not what decides the type it
    // hands back, so the block-bodied and function-expression spellings are
    // read exactly as the expression-bodied one is.
    {
      name: 'declines to freeze an array whose block-bodied mapper returns a closure',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => {',
        '    return () => item;',
        '  });',
        '  makers.push(() => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose function-expression mapper returns a function expression',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map(function (item) {',
        '    return function () {',
        '      return item;',
        '    };',
        '  });',
        '  makers.push(function () {',
        '    return { n: 9 };',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // An async closure hands back `Promise<T>`, which the element composes
    // exactly as the synchronous spelling does.
    {
      name: 'declines to freeze an array whose mapper returns an async closure',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => async () => item);',
        '  makers.push(async () => ({ n: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A destructured element is the same extraction spelled differently
    // (Issue #2349), and the closure carries the name it binds.
    {
      name: 'declines to freeze an array whose destructured mapper returns a closure over the property',
      code: [
        'const ITEMS = [{ n: 1 }, { n: 2 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map(({ n }) => () => n);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The positions `carriesElementType` already reads are read inside the
    // closure too: the closure's return is decided on the same terms as the
    // mapper's.
    {
      name: 'declines to freeze an array whose returned closure wraps the element in an array',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => [item]);',
        '  makers.push(() => [{ n: 9 }]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose returned closure builds an object from the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => ({ held: item.n }));',
        '  makers.push(() => ({ held: 9 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose returned closure reaches the element in one ternary branch',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => (flag: boolean) => (flag ? item.n : 0));',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A generator hands its yields back through the iterator it returns, so a
    // yielded element composes the generator's type as a `return` composes a
    // plain closure's.
    {
      name: 'declines to freeze an array whose mapper returns a generator yielding the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => function* () {',
        '    yield item.n;',
        '  });',
        '  makers.push(function* () {',
        '    yield 9;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose returned generator delegates the element property',
      code: [
        "const ITEMS = [{ tags: ['a'] }];",
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => function* () {',
        '    yield* item.tags;',
        '  });',
        '  makers.push(function* () {',
        "    yield 'b';",
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The mapper itself may be the generator, whose yields are the values IT
    // hands back.
    {
      name: 'declines to freeze an array whose generator mapper yields the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const gens = ITEMS.map(function* (item) {',
        '    yield item.n;',
        '  });',
        '  gens.push((function* () {',
        '    yield 9;',
        '  })());',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `Array.from(X, fn)` carries the same mapper, so the closure is read
    // through the sibling spelling too.
    {
      name: 'declines to freeze an array whose Array.from mapper returns a closure',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = Array.from(ITEMS, (item) => () => item.n);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Each nesting level hands the next one's type back, so the descent cannot
    // stop after one.
    {
      name: 'declines to freeze an array whose mapper returns a doubly nested closure',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => () => item.n);',
        '  makers.push(() => () => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A function literal invoked on the spot has its body right here, so its
    // returns are as readable as a handed-back closure's and the element
    // reaches the result through them.
    {
      name: 'declines to freeze an array whose mapper returns an immediately-invoked closure',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const ns = ITEMS.map((item) => (() => item.n)());',
        '  ns.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The declared return type is deliberately not consulted:
    // `no-explicit-return-type` ships `recommended: 'error'` with a fixer, so
    // reading `number` here would make the freeze safe only until that fixer
    // deleted the annotation, and the pair wrote TS2345 into a file that
    // compiled. Composition guards caught exactly this fixture.
    {
      name: 'declines to freeze an array whose immediately-invoked closure declares a widening return type',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const ns = ITEMS.map((item) => ((): number => item.n)());',
        '  ns.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A function EXPRESSION invoked on the spot is the same construct.
    {
      name: 'declines to freeze an array whose mapper returns an invoked function expression',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const ns = ITEMS.map((item) => (function () { return item.n; })());',
        '  ns.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A parameter DEFAULT is what its parameter is typed from, so it carries
    // the element into the closure's signature without any return doing so.
    {
      name: 'declines to freeze an array whose returned closure defaults a parameter from the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => (value = item.n) => value);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2349: `Object.values`/`Object.entries` build a FRESH container, so
    // no write to the container is a readonly violation — but its elements are
    // the constant's own frozen property values, which is the TYPE half of the
    // question a copy is followed for. `vs.push({ n: 9 })` is TS2322 once
    // `CONFIG` is frozen, for an input that compiled.
    {
      name: 'declines to freeze an object whose Object.values array is pushed to',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const vs = Object.values(CONFIG);',
        '  vs.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.entries array is pushed to',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const es = Object.entries(CONFIG);',
        "  es.push(['b', { n: 9 }]);",
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.values result is mapped and written',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const counts = Object.values(CONFIG).map((x) => x.n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.values result is mapped by a destructured callback',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const counts = Object.values(CONFIG).map(({ n }) => n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.entries pair is destructured by a mapper',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const values = Object.entries(CONFIG).map(([key, value]) => value);',
        '  values.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2350: the callback-typed copy family carried `map` alone, so no
    // copy was tracked through `flatMap` at all. Flattening one level changes
    // the SHAPE of the result, not the types it is composed from — a mapper
    // handing back an array of the element contributes that element's type
    // exactly as a bare return does, so `counts.push(3)` is TS2345 for an input
    // that compiled, and the no-op wrap is TS2322.
    {
      name: 'declines to freeze an array whose flatMap mapper wraps the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => [item.n]);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper wraps the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.flatMap((item) => [item]);',
        '  copies.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The bare spellings are the same question asked without the wrapper: a
    // mapper may hand back a value where an array is accepted, and either way
    // the result's element type is the constant's.
    {
      name: 'declines to freeze an array whose flatMap mapper returns the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => item.n);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper returns the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.flatMap((item) => item);',
        '  copies.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // An array-valued PROPERTY is the shape `flatMap` exists for, and the
    // flattened result holds the constant's own frozen strings.
    {
      name: 'declines to freeze an array whose flatMap mapper returns an array property',
      code: [
        "const ITEMS = [{ tags: ['a'] }];",
        'export const run = () => {',
        '  const tags = ITEMS.flatMap((item) => item.tags);',
        "  tags.push('b');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper spreads an array property',
      code: [
        "const ITEMS = [{ tags: ['a'] }];",
        'export const run = () => {',
        '  const tags = ITEMS.flatMap((item) => [...item.tags]);',
        "  tags.push('b');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Only ONE level is flattened, so a doubly wrapped element survives as an
    // array of the frozen element rather than as the element itself.
    {
      name: 'declines to freeze an array whose flatMap mapper wraps the element twice',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const nested = ITEMS.flatMap((item) => [[item]]);',
        '  nested.push([{ n: 9 }]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper wraps a destructured property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap(({ n }) => [n]);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper wraps a renamed destructured property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap(({ n: value }) => [value]);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper rebuilds the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.flatMap((item) => [{ ...item }]);',
        '  copies.push({ n: 9 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose flatMap mapper wraps the property in one ternary branch',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => (item.n > 0 ? [item.n] : []));',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Which body syntax spells the return does not decide the question, so a
    // block body and a function expression read as the arrow spelling does.
    {
      name: 'declines to freeze an array whose block-bodied flatMap mapper wraps the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => {',
        '    return [item.n];',
        '  });',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose function-expression flatMap mapper wraps the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap(function (item) {',
        '    return [item.n];',
        '  });',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A copy OF a copy carries the frozen type just as far, so the two
    // callback-typed methods compose.
    {
      name: 'declines to freeze an array whose flatMap is chained onto a map result',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map((item) => item).flatMap((item) => [item.n]);',
        '  counts.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The write need not be a mutating call on the result: its ELEMENTS are
    // frozen with the constant, whether reached by index or by iterating the
    // unbound result in place.
    {
      name: 'declines to freeze an array whose flatMap result element is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const copies = ITEMS.flatMap((item) => [item]);',
        '  copies[0].n = 2;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose unbound flatMap result is iterated and written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.flatMap((item) => [item]).forEach((copy) => {',
        '    copy.n = 2;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Issue #2355: a DERIVED receiver hands its callback a fresh MUTABLE array,
    // so no mutating call through the array parameter is the TS2339 the
    // constant's own value gives — but the fresh array's ELEMENT type is the
    // constant's, so a call that INSERTS a value from outside the constant is
    // rejected once the assertion narrows that type. The parameter is therefore
    // enrolled for a derived receiver too, on the narrow terms
    // `introducesForeignElement` already decides for `flatMap` — see
    // `MUTABLE_ARRAY_PARAMETER_METHODS`. Every case below compiles, and stops
    // compiling once the assertion is applied by hand; the diagnostic each
    // produces is named beside it.
    // TS2322: the pushed object's `n` is not assignable to the frozen `1`.
    {
      name: 'declines to freeze an array whose spread copy pushes a foreign element through its forEach array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.push({ n: 3 });',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A primitive element narrows the same way, to a union of the frozen
    // literals. TS2345.
    {
      name: 'declines to freeze an array whose spread copy pushes a foreign primitive through its forEach array parameter',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // Each inserting method is read through `INSERTED_VALUE_POSITIONS_BY_METHOD`,
    // which spends `splice`'s leading arguments and `fill`'s trailing ones on
    // indices, so the inserted value is found wherever the method puts it.
    // TS2322 on each.
    {
      name: 'declines to freeze an array whose sliced copy unshifts a foreign element through its map array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = ITEMS.slice().map((item, index, arr) => {',
        '  arr.unshift({ n: 3 });',
        '  return item;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose filtered copy splices a foreign element through its flatMap array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = ITEMS.filter(Boolean).flatMap((item, index, arr) => {',
        '  arr.splice(0, 0, { n: 3 });',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose Array.from copy fills a foreign element through its some array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const any = Array.from(ITEMS).some((item, index, arr) => {',
        '  arr.fill({ n: 3 });',
        '  return item.n > 0;',
        '});',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The derivations compose, so a chain of copies carries the element type as
    // far as a single one does. TS2322.
    {
      name: 'declines to freeze an array whose chained copies push a foreign element through the array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.filter(Boolean).slice().forEach((item, index, arr) => {',
        '    arr.push({ n: 3 });',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // An `Object.values`/`Object.entries` projection is a fresh array whose
    // elements are the constant's own frozen property values, so its array
    // parameter narrows exactly as a copy's does. TS2345 / TS2322.
    {
      name: 'declines to freeze an object whose Object.values array pushes a foreign element through its array parameter',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  Object.values(CONFIG).forEach((value, index, arr) => {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an object whose Object.entries array pushes a foreign element through its array parameter',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  Object.entries(CONFIG).forEach((entry, index, arr) => {',
        "    arr.push(['c', 3]);",
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // `reduce`/`reduceRight` spend the first position on the accumulator, so the
    // array arrives FOURTH here too. TS2345.
    {
      name: 'declines to freeze an array whose spread copy pushes a foreign element through its reduce array parameter',
      code: [
        'const ITEMS = [1, 2];',
        'export const total = [...ITEMS].reduce((acc: number, cur, index, arr) => {',
        '  arr.push(3);',
        '  return acc + cur;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose concat copy pushes a foreign element through its reduceRight array parameter',
      code: [
        'const ITEMS = [1, 2];',
        'export const total = ITEMS.concat().reduceRight((acc: number, cur, index, arr) => {',
        '  arr.push(3);',
        '  return acc + cur;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The elements of a copy are the constant's own frozen objects, so a write
    // through the array parameter reaches a `readonly` property. TS2540.
    {
      name: 'declines to freeze an array whose spread copy writes an element through its array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr[0].n = 4;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The enrolled parameter is walked like any other binding, so an alias taken
    // from it is followed on to the insertion. TS2322.
    {
      name: 'declines to freeze an array whose spread copy array parameter is aliased and then mutated',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    const rest = arr;',
        '    rest.push({ n: 3 });',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // The method name and the callback spelling are read the same way here as
    // for the constant's own value. TS2345 on each.
    {
      name: 'declines to freeze an array whose bracket-spelled forEach on a spread copy pushes a foreign element',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        "  [...ITEMS]['forEach']((item, index, arr) => {",
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    {
      name: 'declines to freeze an array whose function-expression callback on a spread copy pushes a foreign element',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  [...ITEMS].forEach(function (item, index, arr) {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
    // A copy of a member PATH is a copy of the constant's frozen contents, so it
    // carries the narrowing on. TS2345.
    {
      name: 'declines to freeze an object whose spread member path pushes a foreign element through its array parameter',
      code: [
        'const CONFIG = { list: [1, 2] };',
        'export const run = () => {',
        '  [...CONFIG.list].forEach((item, index, arr) => {',
        '    arr.push(3);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
    },
  ],
  invalid: [
    // Issue #2055: a JSX tag name is spelled twice, but the scope manager
    // references only the OPENING occurrence — the identifier in a closing tag
    // resolves to no variable at all. Renaming the reference list alone split
    // `<nsHolder.Thing>…</nsHolder.Thing>` into a pair whose halves disagree,
    // and the emitted file no longer parsed: `--fix` exited 0 having written
    // source ESLint itself could never read again.
    //
    // This is the reachable arm of that defect. A binding used as a WHOLE tag
    // name is carved out of the rename entirely (it holds a React component),
    // so only a member-expression tag — where the reference is the namespace
    // object rather than the component — still reaches the fixer.
    {
      code: `const nsHolder = { Thing: () => null };
const Probe = () => {
  return <nsHolder.Thing>hi</nsHolder.Thing>;
};`,
      filename: 'src/x.tsx',
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2020 },
      errors: [
        {
          messageId: 'asConst',
          data: {
            name: 'nsHolder',
            valueKind: 'an object literal',
          },
        },
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'nsHolder',
            suggestedName: 'NS_HOLDER',
          },
        },
      ],
      // One RuleTester pass: the `as const` insertion and the rename overlap on
      // this declaration, so only the rename lands here. What it pins is that
      // BOTH halves of the tag pair move together.
      output: `const NS_HOLDER = { Thing: () => null };
const Probe = () => {
  return <NS_HOLDER.Thing>hi</NS_HOLDER.Thing>;
};`,
    },
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
    // Issue #1816: `toUpperSnakeCase` strips one leading underscore, so a name
    // built only from underscores derives the empty string. Applying that
    // rename emits `const  = …` and blanks every reference, so the fix is
    // declined and the report stands alone. `output: null` is the assertion
    // that no autofix is produced — omitting `output` verifies nothing.
    {
      code: `const _ = { a: 1 } as const;\nexport const useIt = () => _;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1816: two underscores derive one, which is not UPPER_SNAKE either,
    // so the rule would re-report and `--fix` would converge on the empty name
    // across passes. Declining at the first pass stops that walk.
    {
      code: `const __ = { a: 1 } as const;\nexport const useIt = () => __;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    {
      code: `const ___ = { a: 1 } as const;\nexport const useIt = () => ___;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1816: dropping the leading underscore in front of a digit leaves a
    // name that starts with a digit — `const 1 = …` is a syntax error, not a
    // rename.
    {
      code: `const _1 = { a: 1 } as const;\nexport const useIt = () => _1;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    {
      code: `const _2fa = { a: 1 } as const;\nexport const useIt = () => _2fa;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    {
      code: `const _0x = { a: 1 } as const;\nexport const useIt = () => _0x;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    {
      code: `const _9lives = { a: 1 } as const;\nexport const useIt = () => _9lives;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    {
      code: `const _1a = { a: 1 } as const;\nexport const useIt = () => _1a;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1816: `$` survives the conversion untouched and is a legal
    // identifier, but it is not UPPER_SNAKE, so renaming to it only relocates
    // the same report onto a name the rule can never accept.
    {
      code: `const _$ = { a: 1 } as const;\nexport const useIt = () => _$;\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'upperSnakeCase' }],
      output: null,
    },
    // Issue #1816: a declined rename is a fix-level decision only. The sibling
    // `as const` fix derives nothing from the name, so it still lands on the
    // very declarations whose rename is withheld.
    {
      code: `const _1 = { a: 1 };\nexport const useIt = () => _1;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: '_1', valueKind: 'an object literal' },
        },
        { messageId: 'upperSnakeCase' },
      ],
      output: `const _1 = { a: 1 } as const;\nexport const useIt = () => _1;\n`,
    },
    {
      code: `const _ = [1, 2, 3];\nexport const useIt = () => _;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: '_', valueKind: 'an array literal' },
        },
        { messageId: 'upperSnakeCase' },
      ],
      output: `const _ = [1, 2, 3] as const;\nexport const useIt = () => _;\n`,
    },
    // Issue #1816 positive controls: the guard tests the DERIVED name, so every
    // name whose derivation is a usable identifier keeps renaming — declaration
    // and references together. A guard that over-fires would turn each of these
    // into a decline.
    {
      code: `const _privateThing = { a: 1 } as const;\nexport const useIt = () => _privateThing;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_privateThing', suggestedName: 'PRIVATE_THING' },
        },
      ],
      output: `const PRIVATE_THING = { a: 1 } as const;\nexport const useIt = () => PRIVATE_THING;\n`,
    },
    // Issue #1816: a leading underscore followed by a LETTER derives a legal
    // name, which is the boundary the digit cases above sit on the far side of.
    {
      code: `const _a1 = { a: 1 } as const;\nexport const useIt = () => _a1;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_a1', suggestedName: 'A1' },
        },
      ],
      output: `const A1 = { a: 1 } as const;\nexport const useIt = () => A1;\n`,
    },
    {
      code: `const _APIKey = { a: 1 } as const;\nexport const useIt = () => _APIKey;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_APIKey', suggestedName: 'API_KEY' },
        },
      ],
      output: `const API_KEY = { a: 1 } as const;\nexport const useIt = () => API_KEY;\n`,
    },
    {
      code: `const _FOO = { a: 1 } as const;\nexport const useIt = () => _FOO;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: '_FOO', suggestedName: 'FOO' },
        },
      ],
      output: `const FOO = { a: 1 } as const;\nexport const useIt = () => FOO;\n`,
    },
    {
      code: `const ok_name = { a: 1 } as const;\nexport const useIt = () => ok_name;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'ok_name', suggestedName: 'OK_NAME' },
        },
      ],
      output: `const OK_NAME = { a: 1 } as const;\nexport const useIt = () => OK_NAME;\n`,
    },
    {
      code: `const foo = { a: 1 } as const;\nexport const useIt = () => foo;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'foo', suggestedName: 'FOO' },
        },
      ],
      output: `const FOO = { a: 1 } as const;\nexport const useIt = () => FOO;\n`,
    },
    {
      code: `const httpServer = { a: 1 } as const;\nexport const useIt = () => httpServer;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'httpServer', suggestedName: 'HTTP_SERVER' },
        },
      ],
      output: `const HTTP_SERVER = { a: 1 } as const;\nexport const useIt = () => HTTP_SERVER;\n`,
    },
    // Issue #1816: a name carrying digits in the middle derives a legal
    // identifier, so only a LEADING digit is disqualifying.
    {
      code: `const http2Server = { a: 1 } as const;\nexport const useIt = () => http2Server;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'http2Server', suggestedName: 'HTTP2_SERVER' },
        },
      ],
      output: `const HTTP2_SERVER = { a: 1 } as const;\nexport const useIt = () => HTTP2_SERVER;\n`,
    },
    // Issue #2329 negative control: an ANNOTATED parameter declares its own
    // type, so no inference reads the default and the assertion cannot narrow
    // the signature. Without this the withhold set over-declines — it was 18
    // consumer sites keyed on the position alone against 6 keyed on inference.
    {
      name: 'freezes a constant an annotated parameter merely defaults from',
      code: [
        "const DEFAULT_MODEL = 'gpt-4';",
        'export const prompt = (model: string = DEFAULT_MODEL) => model;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const DEFAULT_MODEL = 'gpt-4' as const;",
        'export const prompt = (model: string = DEFAULT_MODEL) => model;',
      ].join('\n'),
    },
    // Issue #2329 negative control: a destructured parameter carries its
    // annotation on the PATTERN, not on the binding, so the search for one has
    // to climb out of the pattern to find it.
    {
      name: 'freezes a constant defaulted into an annotated destructured parameter',
      code: [
        'const DISTANCE_DEFAULT = 8;',
        'type Props = { distance?: number };',
        'export const reveal = ({ distance = DISTANCE_DEFAULT }: Props) => distance;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const DISTANCE_DEFAULT = 8 as const;',
        'type Props = { distance?: number };',
        'export const reveal = ({ distance = DISTANCE_DEFAULT }: Props) => distance;',
      ].join('\n'),
    },
    // Issue #2329 negative control: a destructuring DECLARATION default is
    // the same AssignmentPattern node as a parameter default, but it declares
    // no signature, so it is not an inference site this rule must protect.
    {
      name: 'freezes a constant used as a destructuring declaration default',
      code: [
        "const FALLBACK_NAME = 'anon';",
        'export const pick = (source: { name?: string }) => {',
        '  const { name = FALLBACK_NAME } = source;',
        '  return name;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const FALLBACK_NAME = 'anon' as const;",
        'export const pick = (source: { name?: string }) => {',
        '  const { name = FALLBACK_NAME } = source;',
        '  return name;',
        '};',
      ].join('\n'),
    },
    // Issue #2329 negative control: an alias that is never reassigned still
    // takes the assertion. The write check has to read a real write, not the
    // declaration that established the alias.
    {
      name: 'freezes a constant whose alias is only read',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'let currentStage = DEFAULT_STAGE;',
        'export { DEFAULT_STAGE, currentStage };',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const DEFAULT_STAGE = 'ready' as const;",
        'let currentStage = DEFAULT_STAGE;',
        'export { DEFAULT_STAGE, currentStage };',
      ].join('\n'),
    },
    // Issue #2013: a mutated binding is renamed but NOT frozen — `as const`
    // makes the type `readonly`, so the appended assertion turns compiling
    // code into TS2339/TS2540.
    {
      code: 'const arr = [];\narr.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'arr', suggestedName: 'ARR' },
        },
      ],
      output: 'const ARR = [];\nARR.push(1);\n',
    },
    {
      code: 'const cfg = { a: 1 };\ncfg.a = 2;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: 1 };\nCFG.a = 2;\n',
    },
    // Issue #2013: every mutator that writes its receiver, one case each. A
    // set-membership test is only as good as the members it is asked about,
    // and each of these is a live `TS2339` under the appended assertion.
    ...[
      'pop()',
      'shift()',
      'unshift(1)',
      'splice(0, 1)',
      'sort()',
      'reverse()',
      'fill(0)',
      'copyWithin(0, 1)',
    ].map((call) => ({
      code: `const items = [1, 2];\nitems.${call};\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase' as const,
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: `const ITEMS = [1, 2];\nITEMS.${call};\n`,
    })),
    // Issue #2013: element assignment on an array literal.
    {
      code: 'const items = [1, 2];\nitems[0] = 3;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: 'const ITEMS = [1, 2];\nITEMS[0] = 3;\n',
    },
    // Issue #2013: a computed member assignment on an object literal.
    {
      code: `const cfg = { a: 1 };\ncfg['a'] = 2;\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: `const CFG = { a: 1 };\nCFG['a'] = 2;\n`,
    },
    // Issue #2013: compound assignment reads AND writes, so it breaks under a
    // `readonly` property exactly like the plain form.
    {
      code: 'const counters = { count: 0 };\ncounters.count += 1;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'counters', suggestedName: 'COUNTERS' },
        },
      ],
      output: 'const COUNTERS = { count: 0 };\nCOUNTERS.count += 1;\n',
    },
    // Issue #2013: `++` writes through the member without an assignment node.
    {
      code: 'const counters = { count: 0 };\ncounters.count++;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'counters', suggestedName: 'COUNTERS' },
        },
      ],
      output: 'const COUNTERS = { count: 0 };\nCOUNTERS.count++;\n',
    },
    // Issue #2013: `delete` removes a property, which `readonly` forbids.
    {
      code: 'const cfg = { a: 1 };\ndelete cfg.a;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: 1 };\ndelete CFG.a;\n',
    },
    // Issue #2013: `as const` is DEEP, so a write anywhere along the access
    // path breaks — the classifier reads the whole path, not its first step.
    {
      code: 'const cfg = { a: { b: 1 } };\ncfg.a.b = 2;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: { b: 1 } };\nCFG.a.b = 2;\n',
    },
    // Issue #2013: a mutator invoked on a nested member of the frozen value.
    {
      code: 'const cfg = { items: [] };\ncfg.items.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { items: [] };\nCFG.items.push(1);\n',
    },
    // Issue #2013: the write may sit in a nested scope. The reference list
    // from the scope manager crosses function boundaries, so it is seen.
    {
      code: [
        'const items = [];',
        'export const collect = (value) => {',
        '  items.push(value);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: [
        'const ITEMS = [];',
        'export const collect = (value) => {',
        '  ITEMS.push(value);',
        '};',
      ].join('\n'),
    },
    // Issue #2013: type syntax around the receiver does not change who is
    // mutated — `X!.push()` and `(X as any).push()` write `X` all the same.
    {
      code: 'const items = [];\nitems!.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: 'const ITEMS = [];\nITEMS!.push(1);\n',
    },
    {
      code: 'const items = [];\n(items as any).push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: 'const ITEMS = [];\n(ITEMS as any).push(1);\n',
    },
    // Issue #2013: an optional call is still a call on the same receiver.
    {
      code: 'const items = [];\nitems?.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: 'const ITEMS = [];\nITEMS?.push(1);\n',
    },
    // Issue #2013: a mutator reached through a computed string key.
    {
      code: `const items = [];\nitems['push'](1);\n`,
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: `const ITEMS = [];\nITEMS['push'](1);\n`,
    },
    // Issue #2013: a destructuring assignment whose target is a member of the
    // binding writes it, though no member sits directly left of the `=`.
    {
      code: 'const cfg = { a: 1 };\n[cfg.a] = [2];\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: 1 };\n[CFG.a] = [2];\n',
    },
    {
      code: 'const cfg = { a: 1 };\n({ p: cfg.a } = source);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: 1 };\n({ p: CFG.a } = source);\n',
    },
    // Issue #2013: a `for…of` loop variable is an assignment target too.
    {
      code: 'const cfg = { a: 1 };\nfor (cfg.a of [1, 2]) {}\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'cfg', suggestedName: 'CFG' },
        },
      ],
      output: 'const CFG = { a: 1 };\nfor (CFG.a of [1, 2]) {}\n',
    },
    // Issue #2013: the carve-out withholds only the assertion. An EXPORTED
    // mutated binding keeps its rename report, whose fix is declined for the
    // unrelated cross-file reason — `output: null` pins that the decline is
    // the export guard's, not a second effect of this one.
    {
      code: 'export const items = [];\nitems.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: null,
    },
    // Issue #2013 control: the carve-out is keyed on the binding, so an
    // untouched constant declared beside a mutated one is still frozen. The
    // frozen one is declared FIRST because a rename fix spans from the
    // declaration id to its last reference, and an `as const` fix landing
    // inside that span loses the single RuleTester pass to it.
    {
      code: 'const frozen = [1];\nconst mutated = [];\nmutated.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'frozen', valueKind: 'an array literal' },
        },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'frozen', suggestedName: 'FROZEN' },
        },
        {
          messageId: 'upperSnakeCase',
          data: { name: 'mutated', suggestedName: 'MUTATED' },
        },
      ],
      output:
        'const FROZEN = [1] as const;\nconst MUTATED = [];\nMUTATED.push(1);\n',
    },
    // Issue #2324 positive control: the same declaration with no mutation
    // anywhere is frozen, so the alias cases above pin a carve-out rather than
    // a rule that fell silent on this shape altogether.
    {
      code: 'const ITEMS = [1, 2];\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: 'const ITEMS = [1, 2] as const;\n',
    },
    // Issue #2324: an alias that only READS is no reason to withhold anything —
    // the walk screens an alias's references with the same access-path test it
    // applies to the binding's own, rather than treating the existence of an
    // alias as a mutation.
    {
      code: 'const ITEMS = [1];\nconst OTHER = ITEMS;\nexport const first = () => OTHER[0];\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nconst OTHER = ITEMS;\nexport const first = () => OTHER[0];\n',
    },
    // A read-only method on the alias returns a fresh value and leaves the
    // receiver alone, exactly as it does on the binding itself.
    {
      code: 'const ITEMS = [1];\nconst OTHER = ITEMS;\nexport const doubled = () => OTHER.map((x) => x * 2);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nconst OTHER = ITEMS;\nexport const doubled = () => OTHER.map((x) => x * 2);\n',
    },
    // Issue #2331 negative control: a copy that is never written cannot break,
    // so the copy walk keys on the write rather than on the copy. Without this
    // the spread arm would withhold from every constant anything is copied
    // from — 26 consumer sites against the 0 that are actually written.
    {
      name: 'freezes a constant whose spread copy is never written',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = [...ITEMS];',
        '  return copy.length;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  const copy = [...ITEMS];',
        '  return copy.length;',
        '};',
      ].join('\n'),
    },
    // Issue #2331 negative control: a method REFERENCE builds no copy, so there
    // is no second binding to carry the frozen type into.
    {
      name: 'freezes a constant whose copying method is referenced but never called',
      code: ['const ITEMS = [1, 2];', 'export const TAKE = ITEMS.concat;'].join(
        '\n',
      ),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const TAKE = ITEMS.concat;',
      ].join('\n'),
    },
    // Issue #2331 negative control, narrowed by #2342: a mapper that COMPUTES
    // substitutes the element type, so nothing of the constant's type survives
    // into the result and a write to it says nothing about freezing the source.
    // The premise holds for THIS callback rather than for `map` as a method —
    // one that hands back the element, or a property of it, is enrolled.
    {
      name: 'freezes a constant whose mapped result is written',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const doubled = ITEMS.map((x) => x * 2);',
        '  doubled.push(3);',
        '  return doubled;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  const doubled = ITEMS.map((x) => x * 2);',
        '  doubled.push(3);',
        '  return doubled;',
        '};',
      ].join('\n'),
    },
    // Issue #2331 negative control: an ANNOTATED class property declares its
    // own type, so nothing infers from the initializer — the same discriminator
    // #2329 uses for a parameter default.
    {
      name: 'freezes a constant initializing an annotated class property',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export class Session {',
        '  public stage: string = DEFAULT_STAGE;',
        '}',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const DEFAULT_STAGE = 'ready' as const;",
        'export class Session {',
        '  public stage: string = DEFAULT_STAGE;',
        '}',
      ].join('\n'),
    },
    // Issue #2333 negative control, narrowed by #2342: `Array.from(X, fn)` is
    // read from its MAPPER exactly as `map` is — which cuts both ways, so this
    // case is owed its report because the mapper COMPUTES, not because the
    // spelling is `Array.from`.
    {
      name: 'freezes a constant whose Array.from copy passes a mapper',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const copy = Array.from(ITEMS, (x) => x * 2);',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  const copy = Array.from(ITEMS, (x) => x * 2);',
        '  copy.push(3);',
        '  return copy;',
        '};',
      ].join('\n'),
    },
    // Issue #2336 negative control: admitting `ArrayPattern` must not withhold
    // wherever a destructure merely occurs. The walk still keys on the WRITE,
    // so a pattern that binds nothing writable keeps its report.
    {
      name: 'freezes an array destructured with no rest element',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [head, second] = ITEMS;',
        '  return head + second;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  const [head, second] = ITEMS;',
        '  return head + second;',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose rest element is never written',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  const [head, ...rest] = [...ITEMS];',
        '  return [head, rest.length];',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  const [head, ...rest] = [...ITEMS];',
        '  return [head, rest.length];',
        '};',
      ].join('\n'),
    },
    // Reading the rest into a mutable-typed slot is not a write to it. This
    // case COMPILES frozen, so the report is correct and must survive.
    {
      name: 'freezes an array whose rest element is only read into another slot',
      code: [
        'const ITEMS = [1, 2];',
        'const take = (xs: number[]) => xs.length;',
        'export const run = () => {',
        '  const [, ...rest] = ITEMS;',
        '  return take(rest);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'const take = (xs: number[]) => xs.length;',
        'export const run = () => {',
        '  const [, ...rest] = ITEMS;',
        '  return take(rest);',
        '};',
      ].join('\n'),
    },
    // Issue #2333 negative control: the copy walk keys on the WRITE, so a
    // destructured copy that is only read stays frozen.
    {
      name: 'freezes a constant destructured out of a copy but never written',
      code: [
        'const CONFIG = { items: [1, 2] };',
        'export const run = () => {',
        '  const { items } = { ...CONFIG };',
        '  return items.length;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [1, 2] } as const;',
        'export const run = () => {',
        '  const { items } = { ...CONFIG };',
        '  return items.length;',
        '};',
      ].join('\n'),
    },
    // Issue #2333 negative control: an ANNOTATED constructor parameter property
    // declares its own type, so nothing infers from the default — the same
    // discriminator #2329 uses for a plain parameter.
    {
      name: 'freezes a constant defaulting an annotated constructor parameter property',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export class Session {',
        '  constructor(public stage: string = DEFAULT_STAGE) {}',
        '}',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const DEFAULT_STAGE = 'ready' as const;",
        'export class Session {',
        '  constructor(public stage: string = DEFAULT_STAGE) {}',
        '}',
      ].join('\n'),
    },
    /**
     * Issue #2333: the shape that forced the unbound-copy LIMITATION.
     *
     * `[...ITEMS].push(3)` does break once ITEMS is frozen (TS2345), but the
     * break comes from the ARGUMENT's type, not from the mutation — and the two
     * cannot be told apart syntactically. Withholding on "a mutating method
     * called on an unbound copy" silences this fixture, which compiles
     * perfectly well frozen and is the copy-then-derive idiom the rule's own
     * docs recommend. It is asserted here so a future carve-out that
     * over-withholds on the workaround fails instead of passing quietly.
     *
     * The breaking shape itself is deliberately NOT a fixture:
     * `fixer-type-safety` holds an absolute contract that no autofix may turn
     * compiling code into non-compiling code, and a fixture encoding a known
     * break would assert against it. The limitation lives on the docs page.
     */
    {
      name: 'freezes a constant whose unbound slice copy is sorted',
      code: [
        'const ITEMS = [1, 2];',
        'export const sorted = () => ITEMS.slice().sort();',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const sorted = () => ITEMS.slice().sort();',
      ].join('\n'),
    },
    // Issue #2333 negative control: an unbound copy that is never written at
    // all cannot break, so the constant is still frozen.
    {
      name: 'freezes a constant whose unbound copy is only read',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  return [...ITEMS].length;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  return [...ITEMS].length;',
        '};',
      ].join('\n'),
    },
    // Issue #2331: a RETURN position infers exactly as a parameter default
    // does, and this fixture's `--fix` output narrows `read`'s return type. It
    // is reported anyway: declining costs 59 of 778 consumer reports (7.6%) to
    // prevent breaks the consumer does not contain, so the shape is a
    // documented limitation rather than a carve-out. See #2330, where the
    // comparable trade was rejected at 5%.
    {
      name: 'freezes a constant returned from an unannotated function',
      code: [
        "const DEFAULT_STAGE = 'ready';",
        'export const read = () => DEFAULT_STAGE;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        "const DEFAULT_STAGE = 'ready' as const;",
        'export const read = () => DEFAULT_STAGE;',
      ].join('\n'),
    },
    // Issue #2327: being STORED in a container is not itself a mutation. The
    // walk follows the container only to look for a write through it, so a
    // constant merely held somewhere is still frozen.
    {
      code: 'const ITEMS = [1, 2];\nconst HOLDER = { items: ITEMS };\nexport const use = () => HOLDER.items[0];\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
        {
          messageId: 'asConst',
          data: { name: 'HOLDER', valueKind: 'an object literal' },
        },
      ],
      output:
        'const ITEMS = [1, 2] as const;\nconst HOLDER = { items: ITEMS } as const;\nexport const use = () => HOLDER.items[0];\n',
    },
    // The walk starts from ONE binding: an alias of a DIFFERENT constant, and
    // the mutation through it, leave this one frozen. A carve-out keyed on
    // "some alias in the file is mutated" would silence the rule here.
    {
      code: 'const FROZEN = [1];\nconst MUTATED = [2];\nconst ALIAS = MUTATED;\nALIAS.push(3);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'FROZEN', valueKind: 'an array literal' },
        },
      ],
      output:
        'const FROZEN = [1] as const;\nconst MUTATED = [2];\nconst ALIAS = MUTATED;\nALIAS.push(3);\n',
    },
    // The carve-out withholds only the assertion. A binding mutated through an
    // alias keeps its rename, and the rename rewrites the alias's initializer
    // along with every other reference.
    {
      code: 'const items = [1, 2];\nconst OTHER = items;\nOTHER.push(3);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'upperSnakeCase',
          data: { name: 'items', suggestedName: 'ITEMS' },
        },
      ],
      output: 'const ITEMS = [1, 2];\nconst OTHER = ITEMS;\nOTHER.push(3);\n',
    },
    // An alias passed as an ARGUMENT to a mutator is not the receiver, so the
    // access-path test answers for it the same way it does one hop earlier.
    {
      code: 'const ITEMS = [1];\nconst OTHER = ITEMS;\nexport const send = () => sink.push(OTHER);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nconst OTHER = ITEMS;\nexport const send = () => sink.push(OTHER);\n',
    },
    // The same cycle as the valid case above with NO mutation anywhere: the
    // walk has to visit every hop and come back empty. This is what the visited
    // set owns — without it the traversal never terminates, and a rule that
    // hangs is a `--fix` run that never returns.
    {
      code: [
        'const ITEMS = [1, 2];',
        'var first = ITEMS;',
        'var second = first;',
        'var first = second;',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'var first = ITEMS;',
        'var second = first;',
        'var first = second;',
      ].join('\n'),
    },
    // Issue #2013 controls: the mutation carve-out must not swallow bindings
    // that are merely NEAR a mutation. Each is spelled UPPER_SNAKE_CASE so the
    // rename arm stays silent and the surviving `as const` report — and its
    // applied fix — is unambiguously this arm's.
    //
    // A binding passed as an ARGUMENT to a mutator is not the receiver:
    // `other.push(ITEMS)` mutates `other`.
    {
      code: 'const ITEMS = [1];\nother.push(ITEMS);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: 'const ITEMS = [1] as const;\nother.push(ITEMS);\n',
    },
    // A same-named mutator on an unrelated receiver never reaches this
    // binding's reference list at all. The call sits inside a function because
    // a module-scope statement that depends on nothing above it is
    // `logical-top-to-bottom-grouping`'s `moveSideEffect`, and a fixture this
    // rule blesses must not be one a sibling rule reports.
    {
      code: 'const ITEMS = [1];\nexport const send = () => other.push(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nexport const send = () => other.push(1);\n',
    },
    // A shadowing binding of the same name that IS mutated belongs to another
    // variable. Resolving references through the scope manager — rather than
    // searching the text for the name — is what keeps this constant frozen.
    {
      code: [
        'const ITEMS = [1];',
        'export const build = () => {',
        '  const items = [];',
        '  items.push(2);',
        '  return items;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1] as const;',
        'export const build = () => {',
        '  const items = [];',
        '  items.push(2);',
        '  return items;',
        '};',
      ].join('\n'),
    },
    // Read-only methods return a new value and leave the receiver alone.
    {
      code: 'const ITEMS = [1];\nexport const doubled = () => ITEMS.map((x) => x * 2);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nexport const doubled = () => ITEMS.map((x) => x * 2);\n',
    },
    {
      code: 'const ITEMS = [1];\nexport const hasOne = () => ITEMS.includes(1);\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nexport const hasOne = () => ITEMS.includes(1);\n',
    },
    // Reading a member, and appearing on the RIGHT of an assignment, are not
    // writes.
    {
      code: 'const CFG = { a: 1 };\nother.a = CFG.a;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CFG', valueKind: 'an object literal' },
        },
      ],
      output: 'const CFG = { a: 1 } as const;\nother.a = CFG.a;\n',
    },
    // A mutator called on the RESULT of a read-only method mutates that fresh
    // array, so the access path stops at the intervening call.
    {
      code: 'const ITEMS = [1];\nexport const sorted = () => ITEMS.slice().sort();\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output:
        'const ITEMS = [1] as const;\nexport const sorted = () => ITEMS.slice().sort();\n',
    },
    // A member of the constant used as a default parameter value is read, not
    // written, though the pattern node types match a destructuring target.
    {
      code: 'const CFG = { a: 1 };\nexport const read = (value = CFG.a) => value;\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CFG', valueKind: 'an object literal' },
        },
      ],
      output:
        'const CFG = { a: 1 } as const;\nexport const read = (value = CFG.a) => value;\n',
    },
    // A member of the constant sitting in an object LITERAL shares its node
    // types with an object PATTERN, so the write classifier must decide by
    // position rather than by node type.
    {
      code: 'const CFG = { a: 1 };\nsend({ p: CFG.a });\n',
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CFG', valueKind: 'an object literal' },
        },
      ],
      output: 'const CFG = { a: 1 } as const;\nsend({ p: CFG.a });\n',
    },
    // Issue #2126: the append LENGTHENS the declaration by nine columns, so a
    // line that fitted prettier's 80-column print width before the fix does not
    // after it. Prettier's answer for an over-wide assignment whose right-hand
    // side cannot break internally is to break after the `=` and indent one
    // step, so emitting the flat form leaves the file churning on every format
    // run. Every `output` below is a prettier fixed point, measured against the
    // formatter the consuming repo runs (prettier 2.8.8 at print width 80).
    {
      code: `export const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default.svg';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `export const PLACEHOLDER_AVATAR_URL =\n  '/assets/images/avatar-default.svg' as const;\n`,
    },
    // The break follows from the WIDTH alone, so an unexported declaration of
    // the same shape breaks on the same terms.
    {
      code: `const PLACEHOLDER_AVATAR_URL = '/assets/images/avatar-default-large.svg';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const PLACEHOLDER_AVATAR_URL =\n  '/assets/images/avatar-default-large.svg' as const;\n`,
    },
    // The negative control for the whole group: a declaration that still fits
    // once the nine columns are added keeps the flat append. Without it this set
    // would pass just as well against a fixer that broke every line it touched.
    {
      code: `const API_URL = 'https://api.example.com';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const API_URL = 'https://api.example.com' as const;\n`,
    },
    // The boundary. This declaration is 71 columns, so the append lands it on
    // exactly 80 — the width is a limit, not a target, and 80 fits.
    {
      code: `export const ANALYTICS_EVENT_NAME = 'user_profile_avatar_upload_start';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `export const ANALYTICS_EVENT_NAME = 'user_profile_avatar_upload_start' as const;\n`,
    },
    // One column more of value, and the append lands on 81: the break appears.
    {
      code: `export const ANALYTICS_EVENT_NAME = 'user_profile_avatar_upload_failed';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `export const ANALYTICS_EVENT_NAME =\n  'user_profile_avatar_upload_failed' as const;\n`,
    },
    // An exported binding's rename fix withdraws — its name is a cross-file
    // contract — so the id keeps its spelling and adds no columns. This
    // declaration is the same 71 columns as the flat one above and stays flat,
    // which a measurement that counted every REPORTED rename would get wrong.
    {
      code: `export const avatarAnalyticsEvent = 'user_profile_avatar_upload_start';\n`,
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'avatarAnalyticsEvent',
            suggestedName: 'AVATAR_ANALYTICS_EVENT',
          },
        },
      ],
      output: `export const avatarAnalyticsEvent = 'user_profile_avatar_upload_start' as const;\n`,
    },
    // A rename that DOES land moves the width the append is measured against,
    // because ESLint applies both of this rule's fixes in the same pass. The
    // two declarations below are both 71 columns and differ only in whether the
    // id is rewritten: `avatarAnalyticsEvent` becomes `AVATAR_ANALYTICS_EVENT`,
    // two columns longer, which is what carries the line past the width.
    {
      code: `const ANALYTICS_EVENT_NAME = 'user_profile_avatar_upload_has_finished';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const ANALYTICS_EVENT_NAME = 'user_profile_avatar_upload_has_finished' as const;\n`,
    },
    {
      code: `const avatarAnalyticsEvent = 'user_profile_avatar_upload_has_finished';\n`,
      filename: 'test.ts',
      errors: [
        { messageId: 'asConst' },
        {
          messageId: 'upperSnakeCase',
          data: {
            name: 'avatarAnalyticsEvent',
            suggestedName: 'AVATAR_ANALYTICS_EVENT',
          },
        },
      ],
      output: `const AVATAR_ANALYTICS_EVENT =\n  'user_profile_avatar_upload_has_finished' as const;\n`,
    },
    // A declaration already broken across lines is measured on a line that is
    // not the whole of what moves, so the flat append is kept — and that is
    // what prettier settles on anyway, since the value still cannot fit beside
    // the id.
    {
      code: `export const PLACEHOLDER_AVATAR_URL_FOR_A_MISSING_USER_PROFILE =\n  '/assets/images/avatar-default.svg';\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `export const PLACEHOLDER_AVATAR_URL_FOR_A_MISSING_USER_PROFILE =\n  '/assets/images/avatar-default.svg' as const;\n`,
    },
    // Prettier prints a trailing LINE comment as a suffix that never counts
    // toward fitting: this output is 91 columns and prettier leaves it alone.
    // Measuring the LINE instead of the statement would break it for nothing.
    {
      code: `const CDN_BASE_URL = 'https://cdn.example.com'; // read by the avatar image loader\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const CDN_BASE_URL = 'https://cdn.example.com' as const; // read by the avatar image loader\n`,
    },
    // A trailing BLOCK comment occupies columns like any other text, so the
    // same declaration carrying one that ends at column 72 does break.
    {
      code: `const CDN_BASE_URL = 'https://cdn.example.com'; /* read by the loader */\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const CDN_BASE_URL =\n  'https://cdn.example.com' as const; /* read by the loader */\n`,
    },
    // Counting a block comment is not the same as breaking whenever one is
    // present: one that ends inside the width leaves the declaration flat.
    {
      code: `const CDN_BASE_URL = 'https://cdn.example.com'; /* the CDN */\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const CDN_BASE_URL = 'https://cdn.example.com' as const; /* the CDN */\n`,
    },
    // A comment on the NEXT line shares no columns with the declaration, so it
    // must not be measured — this one ends past column 71 and changes nothing.
    {
      code: `const CDN_BASE_URL = 'https://cdn.example.com';\n/* a comment long enough to end past column seventy-one, yes it is */\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const CDN_BASE_URL = 'https://cdn.example.com' as const;\n/* a comment long enough to end past column seventy-one, yes it is */\n`,
    },
    // Every block comment on the line occupies columns, not just the first: the
    // declaration and the first comment together end at column 55, and it is
    // the second comment that carries the line past the width.
    {
      code: `const CDN_BASE_URL = 'https://cdn.example.com'; /* a */ /* bbbbbbbbbbbbbbbbbbbbbbbb */\n`,
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: `const CDN_BASE_URL =\n  'https://cdn.example.com' as const; /* a */ /* bbbbbbbbbbbbbbbbbbbbbbbb */\n`,
    },
    // Issue #2338 negative controls. The decline is keyed on a WRITE through the
    // iteration binding, not on the constant being iterated: every case below
    // compiles both before and after `--fix`, so withholding the assertion from
    // it would cost a report for nothing.
    {
      name: 'freezes an array whose for-of element is only read',
      code: [
        "const ITEMS = [{ label: 'a' }];",
        'export const run = () => {',
        "  let out = '';",
        '  for (const item of ITEMS) {',
        '    out += item.label;',
        '  }',
        '  return out;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        "const ITEMS = [{ label: 'a' }] as const;",
        'export const run = () => {',
        "  let out = '';",
        '  for (const item of ITEMS) {',
        '    out += item.label;',
        '  }',
        '  return out;',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose forEach parameter is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const total = () => {',
        '  let sum = 0;',
        '  ITEMS.forEach((item) => {',
        '    sum += item.n;',
        '  });',
        '  return sum;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const total = () => {',
        '  let sum = 0;',
        '  ITEMS.forEach((item) => {',
        '    sum += item.n;',
        '  });',
        '  return sum;',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose map parameter is only projected',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const NS = ITEMS.map((item) => item.n);',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const NS = ITEMS.map((item) => item.n);',
      ].join('\n'),
    },
    // A destructuring ASSIGNMENT declares nothing: `rest` takes its type from
    // its own annotation, and destructuring a readonly tuple with a rest element
    // yields a mutable one, so nothing here carries the frozen type.
    {
      name: 'freezes an array destructured by assignment into a pre-declared rest',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const run = () => {',
        '  let rest: number[] = [];',
        '  [, ...rest] = ITEMS;',
        '  rest.push(4);',
        '  return rest;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2, 3] as const;',
        'export const run = () => {',
        '  let rest: number[] = [];',
        '  [, ...rest] = ITEMS;',
        '  rest.push(4);',
        '  return rest;',
        '};',
      ].join('\n'),
    },
    // The accumulator of a `reduce` is typed from the SEED, not from the
    // constant, which is why the element is read at its own parameter position:
    // enrolling the first parameter would withhold the assertion here.
    {
      name: 'freezes an array whose reduce accumulator is written',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const collected = ITEMS.reduce((acc, item) => {',
        '  acc.push(item.n);',
        '  return acc;',
        '}, [] as number[]);',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const collected = ITEMS.reduce((acc, item) => {',
        '  acc.push(item.n);',
        '  return acc;',
        '}, [] as number[]);',
      ].join('\n'),
    },
    // `Object.keys` yields `string[]` whatever the argument's type, so nothing
    // the assertion changes reaches the binding — even one that is written.
    {
      name: 'freezes an object whose Object.keys binding is written',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  const names: string[] = [];',
        '  Object.keys(CONFIG).forEach((key) => {',
        '    key = key.trim();',
        '    names.push(key);',
        '  });',
        '  return names;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CONFIG', valueKind: 'an object literal' },
        },
      ],
      output: [
        'const CONFIG = { a: 1, b: 2 } as const;',
        'export const run = () => {',
        '  const names: string[] = [];',
        '  Object.keys(CONFIG).forEach((key) => {',
        '    key = key.trim();',
        '    names.push(key);',
        '  });',
        '  return names;',
        '};',
      ].join('\n'),
    },
    // A callback passed BY NAME declares its parameter elsewhere, where it
    // carries the type that declaration gives it rather than one read off the
    // constant — the frozen element is assignable to it, so nothing breaks.
    {
      name: 'freezes an array whose iteration callback is passed by name',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'const mutate = (item: { n: number }) => {',
        '  item.n = 2;',
        '};',
        'export const run = () => {',
        '  ITEMS.forEach(mutate);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'const mutate = (item: { n: number }) => {',
        '  item.n = 2;',
        '};',
        'export const run = () => {',
        '  ITEMS.forEach(mutate);',
        '};',
      ].join('\n'),
    },
    // The walk reads the constant's own references, so an iteration of an
    // unrelated receiver is never even visited, however it is spelled.
    {
      name: 'freezes an array beside a written iteration of an unrelated receiver',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = (rows: { n: number }[]) => {',
        '  rows.forEach((row) => {',
        '    row.n = 2;',
        '  });',
        '  return ITEMS[0];',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = (rows: { n: number }[]) => {',
        '  rows.forEach((row) => {',
        '    row.n = 2;',
        '  });',
        '  return ITEMS[0];',
        '};',
      ].join('\n'),
    },
    // A `for…of` head that is not a declaration assigns into a binding declared
    // elsewhere, whose type the constant never gave it.
    {
      name: 'freezes an array iterated into a pre-declared loop variable',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  let current = 0;',
        '  for (current of ITEMS) {',
        '    if (current > 1) {',
        '      return current;',
        '    }',
        '  }',
        '  return current;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  let current = 0;',
        '  for (current of ITEMS) {',
        '    if (current > 1) {',
        '      return current;',
        '    }',
        '  }',
        '  return current;',
        '};',
      ].join('\n'),
    },
    // Issue #2339 negative controls. The decline is keyed on a WRITE through the
    // array parameter of an iteration over the constant ITSELF: every case below
    // compiles both before and after `--fix`, so withholding the assertion from
    // one would cost a report for nothing.
    {
      name: 'freezes an array whose array parameter is only read',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    console.log(arr.length);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    console.log(arr.length);',
        '  });',
        '};',
      ].join('\n'),
    },
    // A callback routinely declares fewer parameters than the method passes, so
    // each position is taken only where the signature actually spells it.
    {
      name: 'freezes an array whose callback declares no array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  let sum = 0;',
        '  ITEMS.forEach((item, index) => {',
        '    sum += item.n + index;',
        '  });',
        '  return sum;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  let sum = 0;',
        '  ITEMS.forEach((item, index) => {',
        '    sum += item.n + index;',
        '  });',
        '  return sum;',
        '};',
      ].join('\n'),
    },
    // The index is a `number` whatever the receiver holds, so nothing the
    // assertion changes reaches it and writing it is not a write to the constant.
    {
      name: 'freezes an array whose index parameter is written',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    index = arr.length;',
        '    console.log(index + item);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  ITEMS.forEach((item, index, arr) => {',
        '    index = arr.length;',
        '    console.log(index + item);',
        '  });',
        '};',
      ].join('\n'),
    },
    // A DERIVED receiver hands the callback the fresh MUTABLE value it built
    // rather than the constant, so mutating that array is no readonly violation
    // and the assertion stands. The ELEMENT parameter stays enrolled for all
    // three derivations, which the #2338 cases above pin; only the array
    // parameter is withheld here.
    //
    // The write is a REORDERING method rather than an appending one because a
    // derivation also narrows the element type: `arr.push(3)` on `[...ITEMS]`
    // is TS2345 after `--fix` — `3` is not assignable to `1 | 2` — and is
    // declined by the narrow assignability arm the #2355 cases pin. `sort`,
    // `reverse` and `pop` insert nothing, so no element type can reject what
    // they write and the output still compiles, which is what keeps these
    // controls a statement about the mutability half alone.
    {
      name: 'freezes an array whose spread copy hands its callback a fresh array',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.sort();',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.sort();',
        '  });',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose filtered copy hands its callback a fresh array',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  ITEMS.filter(Boolean).forEach((item, index, arr) => {',
        '    arr.reverse();',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  ITEMS.filter(Boolean).forEach((item, index, arr) => {',
        '    arr.reverse();',
        '  });',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an object whose Object.values array hands its callback a fresh array',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  Object.values(CONFIG).forEach((value, index, arr) => {',
        '    arr.pop();',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CONFIG', valueKind: 'an object literal' },
        },
      ],
      output: [
        'const CONFIG = { a: 1, b: 2 } as const;',
        'export const run = () => {',
        '  Object.values(CONFIG).forEach((value, index, arr) => {',
        '    arr.pop();',
        '  });',
        '};',
      ].join('\n'),
    },
    // The accumulator is typed from the SEED rather than from the constant, and
    // the array parameter beside it is only read, so neither reaches the
    // assertion.
    {
      name: 'freezes an array whose reduce accumulator is written beside a read array parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const collected = ITEMS.reduce((acc, item, index, arr) => {',
        '  acc.push(item.n + index + arr.length);',
        '  return acc;',
        '}, [] as number[]);',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const collected = ITEMS.reduce((acc, item, index, arr) => {',
        '  acc.push(item.n + index + arr.length);',
        '  return acc;',
        '}, [] as number[]);',
      ].join('\n'),
    },
    // Issue #2340 negative controls. Widening the derivation vocabulary buys
    // nothing if it also swallows the reports the wider walk is supposed to
    // leave standing: each case below READS what the iteration hands it, so it
    // compiles both before and after `--fix`.
    {
      name: 'freezes an array whose values() element is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of ITEMS.values()) {',
        '    console.log(item.n);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  for (const item of ITEMS.values()) {',
        '    console.log(item.n);',
        '  }',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose entries() element is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const [index, item] of ITEMS.entries()) {',
        '    console.log(index, item.n);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  for (const [index, item] of ITEMS.entries()) {',
        '    console.log(index, item.n);',
        '  }',
        '};',
      ].join('\n'),
    },
    // A head that DESTRUCTURES the element reads a property out of it and binds
    // nothing that names the element itself, so there is nothing to write
    // through and the assertion stands.
    {
      name: 'freezes an array whose values() element is destructured and read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const { n } of ITEMS.values()) {',
        '    console.log(n);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  for (const { n } of ITEMS.values()) {',
        '    console.log(n);',
        '  }',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose twice-sliced copy is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  ITEMS.slice()',
        '    .slice()',
        '    .forEach((item) => {',
        '      console.log(item.n);',
        '    });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  ITEMS.slice()',
        '    .slice()',
        '    .forEach((item) => {',
        '      console.log(item.n);',
        '    });',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose Set head element is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  for (const item of new Set(ITEMS)) {',
        '    console.log(item.n);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  for (const item of new Set(ITEMS)) {',
        '    console.log(item.n);',
        '  }',
        '};',
      ].join('\n'),
    },
    // A mapper that COMPUTES from its element writes nothing through it, which
    // is what keeps `Array.from(X, fn)` fixable at all.
    {
      name: 'freezes an array whose Array.from mapper only reads its element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const out = Array.from(ITEMS, (item) => item.n);',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const out = Array.from(ITEMS, (item) => item.n);',
      ].join('\n'),
    },
    // `flatMap` alone is handed a MUTABLE `T[]`, so a mutating method through
    // its array parameter compiles unchanged under the assertion — measured by
    // appending `as const` by hand and reading the checker, which reports
    // nothing here and TS2339 for the identical `forEach` spelling. Enrolling
    // the parameter for the element question alone is what leaves these two
    // fixable (Issue #2340).
    {
      name: 'freezes an array whose flatMap array parameter is sorted',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.sort();',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.sort();',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // The pushed value is the element the callback was handed, so it is
    // assignable to the frozen element type and the append compiles too. A push
    // of a FOREIGN value does not — but that break is TS2322, the
    // literal-narrowing family filed as #2330, which this walk tolerates
    // wherever it appears.
    {
      name: 'freezes an array whose flatMap array parameter is appended to with its own element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.push(item);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.push(item);',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // A method that REMOVES rather than inserts writes back nothing the element
    // type could reject, so it cannot break however the assertion narrows.
    {
      name: 'freezes an array whose flatMap array parameter is popped',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.pop();',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.pop();',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // `splice` inserts from its THIRD argument on, so a two-argument call
    // introduces nothing and the start index and delete count beside it are
    // numbers rather than elements.
    {
      name: 'freezes an array whose flatMap array parameter is spliced without an insert',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.splice(0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.splice(0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // `fill`'s bounds are indices, so only its FIRST argument is read as an
    // inserted value — and that one is the element the callback was handed.
    {
      name: 'freezes an array whose flatMap array parameter is filled with its own element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.fill(item, 0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.fill(item, 0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // `copyWithin` moves elements the receiver already holds, so its three index
    // arguments introduce nothing either.
    {
      name: 'freezes an array whose flatMap array parameter is copied within itself',
      code: [
        'const ITEMS = [{ n: 1 }, { n: 2 }];',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.copyWithin(0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }, { n: 2 }] as const;',
        'export const flat = ITEMS.flatMap((item, index, arr) => {',
        '  arr.copyWithin(0, 1);',
        '  return [item];',
        '});',
      ].join('\n'),
    },
    // Issue #2341 negative control: the member read must carry the frozen type
    // for the enrolment to be owed. `join` hands back a `string` whatever the
    // receiver holds, so reassigning the binding it initializes is no readonly
    // violation and the report is still owed. Every control below compiles
    // BEFORE and AFTER the assertion is applied — measured, not assumed.
    {
      name: 'freezes an array whose join() result is reassigned',
      code: [
        'const NUMS = [1, 2, 3];',
        'export const run = () => {',
        "  let joined = NUMS.join(',');",
        "  joined = 'x';",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const NUMS = [1, 2, 3] as const;',
        'export const run = () => {',
        "  let joined = NUMS.join(',');",
        "  joined = 'x';",
        '};',
      ].join('\n'),
    },
    // Issue #2341 negative control: the extraction is owed the enrolment only
    // where `as const` REACHES the value. An explicit `as T` cast is a value
    // the literal refers to rather than one the assertion retypes, so
    // `{ items: [] as string[] } as const` freezes the `items` PROPERTY and
    // leaves the array it holds a mutable `string[]` — the push below compiles
    // after the assertion exactly as before it, so the report is still owed.
    {
      name: 'freezes an object whose extracted member is an `as` cast',
      code: [
        'const CONFIG = { items: [] as string[] };',
        'export const run = () => {',
        '  const items = CONFIG.items;',
        "  items.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [] as string[] } as const;',
        'export const run = () => {',
        '  const items = CONFIG.items;',
        "  items.push('a');",
        '};',
      ].join('\n'),
    },
    // The screen reads the whole path, not just its first step: the cast sits
    // one property deeper here, and the steps above it are object literals the
    // assertion does deepen into.
    {
      name: 'freezes an object whose nested extracted member is an `as` cast',
      code: [
        'const CONFIG = { outer: { inner: [] as number[] } };',
        'export const run = () => {',
        '  const inner = CONFIG.outer.inner;',
        '  inner.push(1);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { outer: { inner: [] as number[] } } as const;',
        'export const run = () => {',
        '  const inner = CONFIG.outer.inner;',
        '  inner.push(1);',
        '};',
      ].join('\n'),
    },
    // The step is resolved through `accessedPropertyName`, so the bracketed
    // spelling reads the same property the dotted one does — a screen keyed on
    // one spelling would enrol the other and withhold this report.
    {
      name: 'freezes an object whose bracketed extracted member is an `as` cast',
      code: [
        'const CONFIG = { items: [] as string[] };',
        'export const run = () => {',
        "  const items = CONFIG['items'];",
        "  items.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [] as string[] } as const;',
        'export const run = () => {',
        "  const items = CONFIG['items'];",
        "  items.push('a');",
        '};',
      ].join('\n'),
    },
    // The screen must read a DESTRUCTURING pattern on the same terms as the
    // member access, because `prefer-destructuring-no-class` rewrites the one
    // into the other under `--fix`. Screening only the member-access spelling
    // let that sibling fixer flip this rule from reporting to silent on
    // unchanged semantics — a detection loss the composition guard caught.
    {
      name: 'freezes an object whose destructured member is an `as` cast',
      code: [
        'const CONFIG = { items: [] as string[] };',
        'export const run = () => {',
        '  const { items } = CONFIG;',
        "  items.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [] as string[] } as const;',
        'export const run = () => {',
        '  const { items } = CONFIG;',
        "  items.push('a');",
        '};',
      ].join('\n'),
    },
    // The binding's NAME is not what the property is looked up by, so a rename
    // in the pattern reads the same cast the plain spelling does.
    {
      name: 'freezes an object whose renamed destructured member is an `as` cast',
      code: [
        'const CONFIG = { items: [] as string[] };',
        'export const run = () => {',
        '  const { items: entries } = CONFIG;',
        "  entries.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [] as string[] } as const;',
        'export const run = () => {',
        '  const { items: entries } = CONFIG;',
        "  entries.push('a');",
        '};',
      ].join('\n'),
    },
    // A nested pattern descends the literal exactly as a multi-step member
    // path does, so the cast is found at whatever depth it sits.
    {
      name: 'freezes an object whose nested destructured member is an `as` cast',
      code: [
        'const CONFIG = { outer: { inner: [] as number[] } };',
        'export const run = () => {',
        '  const { outer: { inner } } = CONFIG;',
        '  inner.push(1);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { outer: { inner: [] as number[] } } as const;',
        'export const run = () => {',
        '  const { outer: { inner } } = CONFIG;',
        '  inner.push(1);',
        '};',
      ].join('\n'),
    },
    // `prefer-destructuring-no-class` rewrites the bracketed member access into
    // a COMPUTED-key pattern, so that spelling is a shape the composed `--fix`
    // actually lands on rather than one only a test writes.
    {
      name: 'freezes an object whose computed-key destructured member is an `as` cast',
      code: [
        'const CONFIG = { items: [] as string[] };',
        'export const run = () => {',
        "  const { ['items']: items } = CONFIG;",
        "  items.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { items: [] as string[] } as const;',
        'export const run = () => {',
        "  const { ['items']: items } = CONFIG;",
        "  items.push('a');",
        '};',
      ].join('\n'),
    },
    // An array pattern binds by INDEX, the same key an indexed member read
    // resolves, so an element holding a cast is screened out too.
    {
      name: 'freezes an array whose destructured element is an `as` cast',
      code: [
        'const ROWS = [[] as string[]];',
        'export const run = () => {',
        '  const [first] = ROWS;',
        "  first.push('a');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ROWS = [[] as string[]] as const;',
        'export const run = () => {',
        '  const [first] = ROWS;',
        "  first.push('a');",
        '};',
      ].join('\n'),
    },
    // The extraction must be rooted at the CONSTANT. A same-shaped read of a
    // parameter names a value the assertion never reaches.
    {
      name: 'freezes a constant whose name is reached through an unrelated receiver',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const mutate = (other: { list: number[] }) => {',
        '  const items = other.list;',
        '  items.push(3);',
        '};',
        'export const run = () => {',
        '  console.log(CONFIG.mode);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 } as const;',
        'export const mutate = (other: { list: number[] }) => {',
        '  const items = other.list;',
        '  items.push(3);',
        '};',
        'export const run = () => {',
        '  console.log(CONFIG.mode);',
        '};',
      ].join('\n'),
    },
    // A name rebound inside a function is a DIFFERENT variable, so the write
    // through it says nothing about the module-scope constant.
    {
      name: 'freezes a constant whose name is rebound in an inner scope',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const mutate = (other: { list: number[] }) => {',
        '  const CONFIG = other;',
        '  CONFIG.list.push(3);',
        '};',
        'export const run = () => {',
        '  console.log(CONFIG.mode);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 } as const;',
        'export const mutate = (other: { list: number[] }) => {',
        '  const CONFIG = other;',
        '  CONFIG.list.push(3);',
        '};',
        'export const run = () => {',
        '  console.log(CONFIG.mode);',
        '};',
      ].join('\n'),
    },
    // A binding declared inside a callback under the property's own NAME is a
    // different variable, so the write through it says nothing about the
    // constant.
    {
      name: 'freezes a constant whose property name is rebound inside a callback',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const seen = [1].map(() => {',
        '    const list = [2];',
        '    list.push(3);',
        '    return list;',
        '  });',
        '  return seen;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 } as const;',
        'export const run = () => {',
        '  const seen = [1].map(() => {',
        '    const list = [2];',
        '    list.push(3);',
        '    return list;',
        '  });',
        '  return seen;',
        '};',
      ].join('\n'),
    },
    // The walk keys on the WRITE, so an extraction that only READS is no
    // reason to withhold the assertion — this is the boundary that keeps the
    // enrolment from costing a report wherever a member access merely occurs.
    {
      name: 'freezes an object whose property alias is only read',
      code: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 };',
        'export const run = () => {',
        '  const items = CONFIG.list;',
        '  console.log(items.length);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { list: [1, 2], nested: { rows: [{ n: 1 }] }, mode: 1 } as const;',
        'export const run = () => {',
        '  const items = CONFIG.list;',
        '  console.log(items.length);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose element alias is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const first = ITEMS[0];',
        '  console.log(first.n);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const first = ITEMS[0];',
        '  console.log(first.n);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose at() result is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const first = ITEMS.at(0)!;',
        '  console.log(first.n);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const first = ITEMS.at(0)!;',
        '  console.log(first.n);',
        '};',
      ].join('\n'),
    },
    // Issue #2341 negative control: given a SEED the fold's result is typed
    // from that value, which the constant need not have given, so the seeded
    // spelling carries nothing frozen however the receiver is declared.
    {
      name: 'freezes an array whose seeded reduce() result is reassigned',
      code: [
        'const NUMS = [1, 2, 3];',
        'export const run = () => {',
        '  let total = NUMS.reduce((sum, item) => sum + item, 0);',
        '  total = 5;',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const NUMS = [1, 2, 3] as const;',
        'export const run = () => {',
        '  let total = NUMS.reduce((sum, item) => sum + item, 0);',
        '  total = 5;',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose seeded reduce() accumulator is pushed',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const collected = ITEMS.reduce((acc: { n: number }[], item) => acc, []);',
        '  collected.push({ n: 2 });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const collected = ITEMS.reduce((acc: { n: number }[], item) => acc, []);',
        '  collected.push({ n: 2 });',
        '};',
      ].join('\n'),
    },
    // Issue #2341 negative control: `keys` still yields INDICES for an ARRAY
    // receiver, so admitting it for Set/Map must not admit it here. One set per
    // receiver, because a single one would decide the two by the same name.
    {
      name: 'freezes an array whose keys() index is reassigned',
      code: [
        'const NUMS = [1, 2, 3];',
        'export const run = () => {',
        '  for (let index of NUMS.keys()) {',
        '    index = 5;',
        '    console.log(index);',
        '  }',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const NUMS = [1, 2, 3] as const;',
        'export const run = () => {',
        '  for (let index of NUMS.keys()) {',
        '    index = 5;',
        '    console.log(index);',
        '  }',
        '};',
      ].join('\n'),
    },
    // Issue #2342 negative control: a callback that COMPUTES widens, so its
    // result carries none of the frozen type and the report is still owed.
    // This is the over-decline boundary the `map` exclusion was written to
    // protect, and it survives the exclusion being lifted.
    {
      name: 'freezes an array whose mapped result is a fresh literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  const labels = ITEMS.map(() => 'x');",
        "  labels.push('y');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        "  const labels = ITEMS.map(() => 'x');",
        "  labels.push('y');",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose mapped result is a widened call',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const scores = ITEMS.map(() => Math.random());',
        '  scores.push(1);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const scores = ITEMS.map(() => Math.random());',
        '  scores.push(1);',
        '};',
      ].join('\n'),
    },
    // A mapper that returns a DIFFERENT parameter hands back nothing of the
    // element, so the position the element arrives in is load-bearing.
    {
      name: 'freezes an array whose mapper ignores its element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const indexes = ITEMS.map((item, index) => index);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const indexes = ITEMS.map((item, index) => index);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
    },
    // Issue #2351: descending into a returned closure is not a licence to
    // decline for every mapper that mentions a function. A closure whose
    // returns COMPUTE reaches nothing of the element, so the report stands and
    // the freeze is safe — measured, not assumed, for each control below.
    {
      name: 'freezes an array whose mapper returns a closure over a fresh literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map(() => () => ({ n: 9 }));',
        '  makers.push(() => ({ n: 3 }));',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map(() => () => ({ n: 9 }));',
        '  makers.push(() => ({ n: 3 }));',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose returned closure computes from the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item.n * 2);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => item.n * 2);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose returned closure interpolates the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => `${item.n}`);',
        "  makers.push(() => 'x');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => () => `${item.n}`);',
        "  makers.push(() => 'x');",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose returned generator yields a computed value',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => function* () {',
        '    yield item.n * 2;',
        '  });',
        '  makers.push(function* () {',
        '    yield 9;',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => function* () {',
        '    yield item.n * 2;',
        '  });',
        '  makers.push(function* () {',
        '    yield 9;',
        '  });',
        '};',
      ].join('\n'),
    },
    // The closure's own parameter is a DIFFERENT binding from the element it
    // shadows, so the name it returns carries nothing of the constant.
    {
      name: 'freezes an array whose returned closure returns its own shadowing parameter',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => (item: number) => item);',
        '  makers.push((value: number) => value + 1);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map((item) => (item: number) => item);',
        '  makers.push((value: number) => value + 1);',
        '};',
      ].join('\n'),
    },
    // The boundary the descent keeps: a NAMED callee is not descended into.
    // Its body is not part of this expression, the call is typed by the
    // callee's own return type, and a call is where every other widening
    // construct hides — so the element reaches nothing and the freeze compiles.
    {
      name: 'freezes an array whose mapper calls a named widening function',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'const widen = (value: number): number => value;',
        'export const run = () => {',
        '  const ns = ITEMS.map((item) => widen(item.n));',
        '  ns.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'const widen = (value: number): number => value;',
        'export const run = () => {',
        '  const ns = ITEMS.map((item) => widen(item.n));',
        '  ns.push(3);',
        '};',
      ].join('\n'),
    },
    // A closure the mapper CALLS for its effect and never hands back is on the
    // far side of that boundary too: what the mapper returns is the literal
    // beside it.
    {
      name: 'freezes an array whose mapper calls a closure and returns a literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const zeros = ITEMS.map((item) => {',
        '    (() => item.n)();',
        '    return 0;',
        '  });',
        '  zeros.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const zeros = ITEMS.map((item) => {',
        '    (() => item.n)();',
        '    return 0;',
        '  });',
        '  zeros.push(3);',
        '};',
      ].join('\n'),
    },
    // The position the element arrives in stays load-bearing inside a closure:
    // a closure over the INDEX hands back nothing of the constant.
    {
      name: 'freezes an array whose returned closure returns the index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const makers = ITEMS.map((item, index) => () => index);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const makers = ITEMS.map((item, index) => () => index);',
        '  makers.push(() => 9);',
        '};',
      ].join('\n'),
    },
    // The map arm keys on the WRITE too.
    {
      name: 'freezes an array whose mapped result is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.map((item) => item.n);',
        '  console.log(counts.length);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const counts = ITEMS.map((item) => item.n);',
        '  console.log(counts.length);',
        '};',
      ].join('\n'),
    },
    // Issue #2349 negative controls: reading the parameter's PATTERN must not
    // become a licence to decline. A destructured mapper that COMPUTES widens
    // exactly as the Identifier spelling of it does, so its result carries none
    // of the frozen type and the report is still owed.
    {
      name: 'freezes an array whose destructured mapper computes from the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const doubled = ITEMS.map(({ n }) => n * 2);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const doubled = ITEMS.map(({ n }) => n * 2);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose destructured mapper interpolates the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const labels = ITEMS.map(({ n }) => `#${n}`);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const labels = ITEMS.map(({ n }) => `#${n}`);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
    },
    // The position the element arrives in stays load-bearing under the pattern
    // spelling: a destructured element the mapper never returns hands back
    // nothing of the constant.
    {
      name: 'freezes an array whose destructured mapper returns the index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const indexes = ITEMS.map(({ n }, index) => index);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const indexes = ITEMS.map(({ n }, index) => index);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
    },
    // Descending into a container literal must not admit one whose parts all
    // COMPUTE — the container is fresh and so are its contents.
    {
      name: 'freezes an array whose mapper builds an object literal from computed values',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const rows = ITEMS.map((x) => ({ label: String(x.n) }));',
        "  rows.push({ label: 'y' });",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const rows = ITEMS.map((x) => ({ label: String(x.n) }));',
        "  rows.push({ label: 'y' });",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose mapper builds an array literal from computed values',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const rows = ITEMS.map((x) => [x.n * 2]);',
        '  rows.push([3]);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const rows = ITEMS.map((x) => [x.n * 2]);',
        '  rows.push([3]);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose destructured mapper builds a literal holding none of the element',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  const rows = ITEMS.map(({ n }) => ({ label: 'x' }));",
        "  rows.push({ label: 'y' });",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        "  const rows = ITEMS.map(({ n }) => ({ label: 'x' }));",
        "  rows.push({ label: 'y' });",
        '};',
      ].join('\n'),
    },
    // A conditional's TEST decides which branch runs rather than what the
    // expression is typed as, so an element reached only there carries nothing
    // into the result. The write is a mutating call, which would decline had
    // the copy been enrolled — so this measures the enrolment, not the absence
    // of a write.
    {
      name: 'freezes an array whose mapper reaches the element only in the ternary test',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  const flags = ITEMS.map((x) => (x.n > 0 ? 'yes' : 'no'));",
        '  flags.reverse();',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        "  const flags = ITEMS.map((x) => (x.n > 0 ? 'yes' : 'no'));",
        '  flags.reverse();',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose ternary branches both compute',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => (x.n > 0 ? x.n * 2 : 0));',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const values = ITEMS.map((x) => (x.n > 0 ? x.n * 2 : 0));',
        '  values.push(3);',
        '};',
      ].join('\n'),
    },
    // Issue #2349 negative controls for the projection: `Object.keys` hands
    // back `string[]` whatever the argument holds, so the assertion cannot
    // reach a binding taken from it, and a computing mapper over
    // `Object.values` widens on the same terms any other mapper does.
    {
      name: 'freezes an object whose Object.keys array is pushed to',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  const ks = Object.keys(CONFIG);',
        "  ks.push('c');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { a: 1, b: 2 } as const;',
        'export const run = () => {',
        '  const ks = Object.keys(CONFIG);',
        "  ks.push('c');",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an object whose Object.values result is mapped by a computing callback',
      code: [
        'const CONFIG = { a: { n: 1 } };',
        'export const run = () => {',
        '  const doubled = Object.values(CONFIG).map((x) => x.n * 2);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const CONFIG = { a: { n: 1 } } as const;',
        'export const run = () => {',
        '  const doubled = Object.values(CONFIG).map((x) => x.n * 2);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
    },
    // Issue #2350 negative controls: enrolling `flatMap` must not become a
    // licence to decline for every call spelling it. A mapper that COMPUTES
    // widens whatever the receiver holds, so its result carries none of the
    // frozen type and the report is still owed — each of these compiles with
    // the assertion appended, measured against a real program.
    {
      name: 'freezes an array whose flatMap mapper doubles the element',
      code: [
        'const NUMS = [1, 2];',
        'export const run = () => {',
        '  const doubled = NUMS.flatMap((n) => [n * 2]);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const NUMS = [1, 2] as const;',
        'export const run = () => {',
        '  const doubled = NUMS.flatMap((n) => [n * 2]);',
        '  doubled.push(3);',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose flatMap mapper stringifies the element property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const labels = ITEMS.flatMap((item) => [String(item.n)]);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const labels = ITEMS.flatMap((item) => [String(item.n)]);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose destructured flatMap mapper interpolates the property',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const labels = ITEMS.flatMap(({ n }) => [`#${n}`]);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const labels = ITEMS.flatMap(({ n }) => [`#${n}`]);',
        "  labels.push('y');",
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose flatMap mapper returns a fresh literal',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  const labels = ITEMS.flatMap(() => ['x']);",
        "  labels.push('y');",
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        "  const labels = ITEMS.flatMap(() => ['x']);",
        "  labels.push('y');",
        '};',
      ].join('\n'),
    },
    // The position the element arrives in stays load-bearing: the index is a
    // `number` whatever the receiver holds.
    {
      name: 'freezes an array whose flatMap mapper wraps the index',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const indexes = ITEMS.flatMap((item, index) => [index]);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const indexes = ITEMS.flatMap((item, index) => [index]);',
        '  indexes.push(3);',
        '};',
      ].join('\n'),
    },
    // The flatMap arm keys on the WRITE too, exactly as the map arm does.
    {
      name: 'freezes an array whose flatMap result is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => [item.n]);',
        '  console.log(counts.length);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const counts = ITEMS.flatMap((item) => [item.n]);',
        '  console.log(counts.length);',
        '};',
      ].join('\n'),
    },
    // A conditional's TEST decides which branch runs rather than what the
    // expression is typed as, and a wrapper around computed parts computes as
    // surely as a bare expression does.
    {
      name: 'freezes an array whose flatMap mapper reaches the element only in the ternary test',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        "  const flags = ITEMS.flatMap((item) => (item.n > 0 ? ['yes'] : ['no']));",
        '  flags.reverse();',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        "  const flags = ITEMS.flatMap((item) => (item.n > 0 ? ['yes'] : ['no']));",
        '  flags.reverse();',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose flatMap ternary branches both compute',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  const values = ITEMS.flatMap((item) => (item.n > 0 ? [item.n * 2] : [0]));',
        '  values.push(3);',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [{ messageId: 'asConst' }],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  const values = ITEMS.flatMap((item) => (item.n > 0 ? [item.n * 2] : [0]));',
        '  values.push(3);',
        '};',
      ].join('\n'),
    },
    // Issue #2355 negative controls. The decline is keyed on an INSERTED value
    // from outside the constant, because that is the only thing the assertion
    // can reject on a receiver the lib declares MUTABLE: every case below
    // compiles both before and after `--fix`, so withholding the assertion from
    // one would cost a report for nothing.
    // An inserted value that is a REFERENCE to the element the callback was
    // handed narrows with the parameter it is written into.
    {
      name: 'freezes an array whose spread copy pushes the element it was handed',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.push(item);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.push(item);',
        '  });',
        '};',
      ].join('\n'),
    },
    // Reading the array parameter reaches nothing the assertion changes.
    {
      name: 'freezes an array whose spread copy array parameter is only read',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    console.log(arr.length, arr.indexOf(item));',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    console.log(arr.length, arr.indexOf(item));',
        '  });',
        '};',
      ].join('\n'),
    },
    // `shift`, `copyWithin`, `sort`, `reverse` and `pop` insert nothing — they
    // reorder, remove or copy elements the receiver already holds — so no
    // element type can reject what they write.
    {
      name: 'freezes an array whose spread copy array parameter is shifted',
      code: [
        'const ITEMS = [1, 2];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.shift();',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.shift();',
        '  });',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose sliced copy array parameter is copied within',
      code: [
        'const ITEMS = [1, 2, 3];',
        'export const run = () => {',
        '  ITEMS.slice().forEach((item, index, arr) => {',
        '    arr.copyWithin(0, 1);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2, 3] as const;',
        'export const run = () => {',
        '  ITEMS.slice().forEach((item, index, arr) => {',
        '    arr.copyWithin(0, 1);',
        '  });',
        '};',
      ].join('\n'),
    },
    // `splice` inserts from its THIRD argument on, so the two-argument spelling
    // introduces no value at all.
    {
      name: 'freezes an array whose spread copy array parameter is spliced without an inserted value',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.splice(0, 1);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.splice(0, 1);',
        '  });',
        '};',
      ].join('\n'),
    },
    // `fill` inserts at its FIRST argument alone, and the element it was handed
    // is enrolled for this constant.
    {
      name: 'freezes an array whose spread copy array parameter is filled with the element it was handed',
      code: [
        'const ITEMS = [{ n: 1 }];',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.fill(item);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [{ n: 1 }] as const;',
        'export const run = () => {',
        '  [...ITEMS].forEach((item, index, arr) => {',
        '    arr.fill(item);',
        '  });',
        '};',
      ].join('\n'),
    },
    // The projection controls: a read through the array parameter keeps the
    // report that widening this arm exists to leave standing.
    {
      name: 'freezes an object whose Object.entries array parameter is only read',
      code: [
        'const CONFIG = { a: 1, b: 2 };',
        'export const run = () => {',
        '  Object.entries(CONFIG).forEach((entry, index, arr) => {',
        '    console.log(entry[0], arr.length);',
        '  });',
        '};',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'CONFIG', valueKind: 'an object literal' },
        },
      ],
      output: [
        'const CONFIG = { a: 1, b: 2 } as const;',
        'export const run = () => {',
        '  Object.entries(CONFIG).forEach((entry, index, arr) => {',
        '    console.log(entry[0], arr.length);',
        '  });',
        '};',
      ].join('\n'),
    },
    {
      name: 'freezes an array whose spread copy reduce array parameter is only read',
      code: [
        'const ITEMS = [1, 2];',
        'export const total = [...ITEMS].reduce((acc: number, cur, index, arr) => {',
        '  return acc + cur + arr.length;',
        '}, 0);',
      ].join('\n'),
      filename: 'test.ts',
      errors: [
        {
          messageId: 'asConst',
          data: { name: 'ITEMS', valueKind: 'an array literal' },
        },
      ],
      output: [
        'const ITEMS = [1, 2] as const;',
        'export const total = [...ITEMS].reduce((acc: number, cur, index, arr) => {',
        '  return acc + cur + arr.length;',
        '}, 0);',
      ].join('\n'),
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

// Issue #1816: RuleTester applies a single fix pass, but `--fix` re-lints its
// own output up to ten times, so a name that degenerates over several passes
// (`__` -> `_` -> ``) needs the real loop to be observed. These cases also check
// the emitted text against the TypeScript parser, because a rename to a
// non-identifier is a *syntax* defect that a report-count assertion cannot see.
describe('global-const-style --fix degeneracy (Issue #1816)', () => {
  const RULE_ID = 'global-const-style';

  const fixWith = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(RULE_ID, rule as unknown as Rule.RuleModule);
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      },
      'constants.ts',
    ).output;
  };

  const parseErrorCount = (code: string) =>
    (
      ts.createSourceFile(
        'constants.ts',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      ) as unknown as { parseDiagnostics: readonly unknown[] }
    ).parseDiagnostics.length;

  const DEGENERATE_NAMES = [
    '_',
    '__',
    '___',
    '_1',
    '_2fa',
    '_0x',
    '_9lives',
    '_1a',
    '_$',
  ];

  it.each(DEGENERATE_NAMES)(
    'leaves `%s` untouched instead of renaming it to a non-identifier',
    (name) => {
      const code = `const ${name} = { a: 1 } as const;\nexport const useIt = () => ${name};\n`;

      const fixed = fixWith(code);

      expect(fixed).toBe(code);
      expect(parseErrorCount(fixed)).toBe(0);
    },
  );

  // The decline must not be a blanket amnesty for underscore-prefixed or
  // digit-carrying names: every derivation that yields a usable identifier
  // still renames the declaration and each reference through the same loop.
  it.each([
    ['_privateThing', 'PRIVATE_THING'],
    ['_APIKey', 'API_KEY'],
    ['_FOO', 'FOO'],
    ['_a1', 'A1'],
    ['ok_name', 'OK_NAME'],
    ['foo', 'FOO'],
    ['httpServer', 'HTTP_SERVER'],
    ['http2Server', 'HTTP2_SERVER'],
  ])('still renames `%s` to `%s`', (name, expected) => {
    const code = `const ${name} = { a: 1 } as const;\nexport const useIt = () => ${name};\n`;

    const fixed = fixWith(code);

    expect(fixed).toBe(
      `const ${expected} = { a: 1 } as const;\nexport const useIt = () => ${expected};\n`,
    );
    expect(parseErrorCount(fixed)).toBe(0);
  });
});

/**
 * Issue #2126: the shapes below overflow the print width once ` as const` is
 * appended, and the width measurement deliberately withholds the break for each
 * of them. Each carve-out needs a case of its own, or a later change deletes one
 * without anything going red.
 *
 * They are pinned here rather than in the RuleTester corpus because the flat
 * append is NOT the spelling prettier settles on for them: the fixed-point sweep
 * formats every fixture before linting it and would read a deliberate carve-out
 * as a defect of the fixer. What these cases own is that the emitted text is the
 * flat append — the shape the rule has always written — and nothing else.
 */
describe('global-const-style as-const width carve-outs (Issue #2126)', () => {
  const RULE_ID = 'global-const-style';

  const fixWith = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(RULE_ID, rule as unknown as Rule.RuleModule);
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      },
      'constants.ts',
    ).output;
  };

  it.each([
    // Prettier EXPANDS an over-wide object or array literal across lines rather
    // than pushing it below the `=`. Only a rebuild from the literal's own
    // items could emit that shape, and such a rebuild owns every byte between
    // the brackets — a comment written among the items would be deleted by it.
    [
      'an object literal',
      `export const AVATAR_UPLOAD_OPTIONS = { maxSizeMb: 4, qualityPercent: 82 };`,
      `export const AVATAR_UPLOAD_OPTIONS = { maxSizeMb: 4, qualityPercent: 82 } as const;`,
    ],
    [
      'an array literal',
      `export const SUPPORTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];`,
      `export const SUPPORTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;`,
    ],
    // A sibling declarator carries its own report, and its fix lands in the same
    // pass, so the columns this one is measured against move with it. The
    // post-pass width is not knowable from either declarator alone.
    [
      'a declaration with a sibling declarator',
      `const AVATAR_URL = '/assets/avatar.svg', BANNER = '/assets/banner.svg';`,
      `const AVATAR_URL = '/assets/avatar.svg' as const, BANNER = '/assets/banner.svg' as const;`,
    ],
    // The break rewrites the span between `=` and the end of the initializer, so
    // a comment sitting inside that span would be swallowed by it.
    [
      'a comment between `=` and the initializer',
      `const CDN_BASE_URL = /* pinned by ops */ 'https://cdn.example.com/assets';`,
      `const CDN_BASE_URL = /* pinned by ops */ 'https://cdn.example.com/assets' as const;`,
    ],
    // Parentheses are not part of the initializer's range, so a break anchored
    // on `=` would move the `(` and leave the `)` behind.
    [
      'a parenthesized initializer',
      `const CDN_BASE_URL = ('https://cdn.example.com/assets/images/avatars/');`,
      `const CDN_BASE_URL = ('https://cdn.example.com/assets/images/avatars/' as const);`,
    ],
    // A second statement on the line is a shape prettier splits before it
    // measures anything, so the width read from the source is not the one it
    // decides on.
    [
      'a declaration sharing its line with another statement',
      `const SHORT = 1; const AVATAR_PLACEHOLDER_URL = '/assets/avatar.svg';`,
      `const SHORT = 1 as const; const AVATAR_PLACEHOLDER_URL = '/assets/avatar.svg' as const;`,
    ],
  ])('keeps the flat append for %s', (_shape, code, expected) => {
    // Non-vacuity: each input must overflow the print width once the nine
    // columns are appended, otherwise the carve-out is never the reason the
    // declaration stays flat and the case guards nothing.
    expect(expected.split('\n')[0].length).toBeGreaterThan(80); // measured 81 (per-iteration floor; min of 4 observed values: 81,83,87,89)

    expect(fixWith(code)).toBe(expected);
  });
});
