# Enforce UPPER_SNAKE_CASE and as const for global static constants (`@blumintinc/blumint/global-const-style`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Top-level constants should read as immutable configuration and stay frozen at the value authored. This rule keeps that intent obvious by enforcing:

1. `UPPER_SNAKE_CASE` names for module-scope constants so they stand out from runtime variables.
1. `as const` for literal, array, and object initializers in TypeScript so the type stays exact and the value cannot be mutated accidentally.

## Rule Details

Global configuration often feeds props, feature flags, and lookups. When these values look like regular variables or lose their literal types, downstream code can mutate them or accidentally rely on widened types. UPPER_SNAKE_CASE signals “static config lives here,” and `as const` preserves literal types so enums, discriminated unions, and memoized consumers stay stable.

### Examples of **incorrect** code for this rule:

```ts
// Looks like a runtime variable and can be widened
const apiEndpoint = 'https://api.bluemint.com/v1';

// Literal object is mutable without `as const`
const COLORS = { primary: '#000', secondary: '#fff' };

// Array literal loses its literal element types without `as const`
const buttonSizes = ['small', 'medium', 'large'];
```

### Examples of **correct** code for this rule:

```ts
const API_ENDPOINT = 'https://api.bluemint.com/v1' as const;
const MAX_RETRIES = 3 as const;
const COLORS = { primary: '#000', secondary: '#fff' } as const;
const BUTTON_SIZES = ['small', 'medium', 'large'] as const;

// Inside functions (not affected by this rule)
function example() {
  const apiEndpoint = 'https://api.bluemint.com/v1';
  const maxRetries = 3;
}

// Dynamic or computed values (not affected by this rule)
const API_VERSION = getApiVersion();
const DEFAULT_TIMEOUT = 1000 * 60;

// Destructuring (not affected by this rule)
const { apiUrl, maxRetries } = config;

// React components and hooks at module scope (not affected)
const MyComponent = () => null;
const memoized = memo(MyComponent);

// Next.js reserved export names (not renamed — the literal export name is a
// framework contract; renaming `config` would silently break the API route)
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } } as const;
```

### Initializers that already carry a type assertion

An initializer wrapped in a non-`const` assertion is exempt from the `as const`
requirement:

```ts
// Not flagged — the author has already pinned the type.
const CONFIG = { a: 1 } as Foo;
const PHONE_PROVIDER = { providerId: 'phone' } as unknown as UserProviderInfo;
const THEME = <Theme>{ primary: '#000' };
```

TypeScript permits a `const` assertion only on a literal, so appending one after
an `as`-expression is a compile error (TS1355: *A 'const' assertion can only be
applied to references to enum members, or string, number, boolean, array, or
object literals*). An `as X` cast is also the author pinning the type
deliberately — the same intent as the explicit `id` annotation the rule already
skips.

To get both an exact literal type and a widening cast, put the `const`
assertion on the literal itself, where it is legal:

```ts
const PHONE_PROVIDER = {
  providerId: 'phone',
} as const as unknown as UserProviderInfo;
```

The `UPPER_SNAKE_CASE` half of the rule is unaffected and still applies to these
declarations.

### Next.js reserved exports

Next.js recognizes certain exports by their literal identifier (`config`,
`getServerSideProps`, `getStaticProps`, `getStaticPaths`, `getInitialProps`,
`middleware`). Renaming these to `UPPER_SNAKE_CASE` silently breaks the
framework, so **exported** declarations using these reserved names are not
flagged for renaming. Only the rename is suppressed — `as const` is still
enforced because it never changes the export name. A local (unexported)
constant sharing one of these names is still renamed, since renaming a value
that Next.js never reads is safe.

### Jest mock handles

Jest mock handles created with a `jest.Mock*` cast are exempt from the
`UPPER_SNAKE_CASE` requirement:

```ts
// Not flagged — a mutable test double, not immutable config.
const mockedFetch = fetchData as jest.MockedFunction<typeof fetchData>;
mockedFetch.mockResolvedValue('ok');
```

The exemption covers `jest.Mock`, `jest.MockedFunction`, `jest.Mocked`, and
`jest.MockedClass` casts. These handles are reassigned through
`.mockImplementation()`, `.mockReturnValue()`, etc. — they are not immutable
module configuration, and the `mockedX` camelCase spelling is the established
idiom, so renaming them to `UPPER_SNAKE_CASE` would fight the convention.

### Aliases of another binding

A `const` whose initializer is a bare identifier aliases an existing binding
rather than declaring a configuration value, so neither half of the rule
applies:

```ts
// Not flagged — a re-export that preserves a callable's name.
import { toKvStamp } from './stampedKvValue';
export const toUsernameSlugStamp = toKvStamp;

// Not flagged — component/hook aliases, and aliases carrying a cast.
export const BalanceGuardProvider = BalanceGuardProviderInternal;
const mockDb = db as unknown as { collection: jest.Mock };
```

An alias inherits whatever convention its target follows, and the dominant case
— aliasing a function, component, or hook — is camelCase everywhere else in the
codebase. Renaming one is also destructive: the point of such a re-export is
preserving a name importers depend on, and a single-file fixer cannot rewrite
them (the rename would produce TS2724 in every importer).

The exemption is deliberately blanket — the rule does not resolve what the
identifier points at, so `const alias = MAX_RETRIES;` is exempt too. Aliasing is
not declaring a configuration constant, and a missed rename is preferable to a
build-breaking one.

Two narrow shapes stay in scope:

- `undefined`, `NaN` and `Infinity` parse as identifiers but denote primitive
  values, not a binding being aliased, so `const someDefault = undefined;` is
  still renamed to `SOME_DEFAULT`.
- A member expression reads a property off something rather than aliasing a
  binding, so `const themeColor = Theme.color;` is unaffected by this exemption.

### Reference-safe autofix

The rename fix rewrites the declaration **and every in-file reference** in a
single pass, so `--fix` never orphans a use site on a now-undefined name.
Shorthand object properties are expanded so only the value is renamed:

```ts
// Before                             // After --fix
const fooBar = 42 as const;           const FOO_BAR = 42 as const;
const OBJ = { fooBar } as const;      const OBJ = { fooBar: FOO_BAR } as const;
```

The suggested name splits the identifier on case **boundaries**, so an acronym
run stays one word and the conversion is idempotent — re-running `--fix` over an
already-renamed constant never adds another separator:

```ts
// Before                             // After --fix
const HTTPServer = 8080 as const;     const HTTP_SERVER = 8080 as const;
const parseHTMLString = '' as const;  const PARSE_HTML_STRING = '' as const;
const userID = 1 as const;            const USER_ID = 1 as const;
```

When a safe rename cannot be guaranteed, the violation is still reported but the
fix is withheld (report-only) rather than risk changing behavior. That happens
when the new name would collide with or shadow an existing binding, or when the
symbol crosses a file boundary — an inline `export const` with in-file uses, or
a re-export such as `export { fooBar }` — where a single-file fixer cannot reach
the importers.

## When Not To Use It

You might want to disable this rule if:

1. Use a different naming convention for module-level constants.
1. Prefer explicit type annotations over `as const` for literals.
1. Avoid this rule if you rarely keep literal values at module scope and do not need the visual distinction.

## Further Reading

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [Naming conventions in JavaScript](https://github.com/airbnb/javascript#naming-conventions)
