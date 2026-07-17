# Enforce UPPER_SNAKE_CASE and as const for global static constants (`@blumintinc/blumint/global-const-style`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Top-level constants should read as immutable configuration and stay frozen at the value authored. This rule keeps that intent obvious by enforcing:

1. `UPPER_SNAKE_CASE` names for module-scope constants so they stand out from runtime variables.
1. `as const` for literal, array, and object initializers in TypeScript so the type stays exact and the value cannot be mutated accidentally.

## Rule Details

Global configuration often feeds props, feature flags, and lookups. When these values look like regular variables or lose their literal types, downstream code can mutate them or accidentally rely on widened types. UPPER_SNAKE_CASE signals “static config lives here,” and `as const` preserves literal types so enums, discriminated unions, and memoized consumers stay stable.

Examples of **incorrect** code for this rule:

```ts
// Looks like a runtime variable and can be widened
const apiEndpoint = 'https://api.bluemint.com/v1';

// Literal object is mutable without `as const`
const COLORS = { primary: '#000', secondary: '#fff' };

// Array literal loses its literal element types without `as const`
const buttonSizes = ['small', 'medium', 'large'];
```

Examples of **correct** code for this rule:

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

### Reference-safe autofix

The rename fix rewrites the declaration **and every in-file reference** in a
single pass, so `--fix` never orphans a use site on a now-undefined name.
Shorthand object properties are expanded so only the value is renamed:

```ts
// Before                             // After --fix
const fooBar = 42 as const;           const FOO_BAR = 42 as const;
const OBJ = { fooBar } as const;      const OBJ = { fooBar: FOO_BAR } as const;
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
