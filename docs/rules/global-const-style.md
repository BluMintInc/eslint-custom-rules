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
```

## When Not To Use It

You might want to disable this rule if:

1. You use a different naming convention for module-level constants.
1. You prefer explicit type annotations over `as const` for literals.
1. You rarely keep literal values at module scope and do not need the visual distinction.

## Further Reading

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [Naming conventions in JavaScript](https://github.com/airbnb/javascript#naming-conventions)
