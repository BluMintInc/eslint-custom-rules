# Enforce UPPER_SNAKE_CASE and as const for global static constants (`@blumintinc/blumint/global-const-style`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces a consistent format for global static constants in BluMint's codebase. Global constants declared in the top-level scope of a file (not inside any function or block) must follow these two conventions:

1. They must use `as const` to indicate immutability explicitly.
2. They must be written in `UPPER_SNAKE_CASE` to visually distinguish them from other variables.

## Rule Details

This rule aims to improve code readability, ensure consistent styling for global constants, and enforce immutability for constants in a clear way.

Examples of **incorrect** code for this rule:

```ts
const apiEndpoint = 'https://api.bluemint.com/v1';
const maxRetries = 3;
const baseConfig = { timeout: 5000 };
```

Examples of **correct** code for this rule:

```ts
const API_ENDPOINT = 'https://api.bluemint.com/v1' as const;
const MAX_RETRIES = 3 as const;
const BASE_CONFIG = { timeout: 5000 } as const;

// Inside functions (not affected by this rule)
function example() {
  const apiEndpoint = 'https://api.bluemint.com/v1';
  const maxRetries = 3;
}

// Dynamic values (not affected by this rule)
const API_VERSION = getApiVersion();
const DEFAULT_TIMEOUT = 1000 * 60;

// Destructuring (not affected by this rule)
const { apiUrl, maxRetries } = config;
```

## When Not To Use It

You might want to disable this rule if:

1. Your project has different naming conventions for constants
2. You prefer not to use TypeScript's `as const` assertion
3. You have many global constants that cannot use `as const` (e.g., computed values)

## Further Reading

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [Naming conventions in JavaScript](https://github.com/airbnb/javascript#naming-conventions)
