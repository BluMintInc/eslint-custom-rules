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
    // Issue #2331 negative control: `map` substitutes the element type, so
    // nothing of the constant's type survives into the result and a write to
    // that result says nothing about freezing the source.
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
    // Issue #2333 negative control: `Array.from(X, fn)` retypes the result from
    // the MAPPER, exactly as `map` does, so nothing of the constant's type
    // survives into it and the assertion is still enforced.
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
