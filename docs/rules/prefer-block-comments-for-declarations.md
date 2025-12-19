# Enforce the use of block comments for declarations (`@blumintinc/blumint/prefer-block-comments-for-declarations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of block comments (`/** */`) instead of single-line comments (`//`) for all declarations, including type declarations, variable declarations, and function declarations.

## Rule Details

Line comments placed directly above a declaration look like documentation but TypeScript and IDEs ignore them for hovers, signature help, and generated docs. Converting them to block comments keeps the text attached to the declaration so refactors and API exploration still show the intent.

- Reports line comments immediately before declarations (functions, variables, types, interfaces, classes, properties, enums) except inside function bodies.
- Leaves existing block comments untouched, including block ESLint directives.
- Ignores ESLint directive comments so configuration comments remain untouched.
- Auto-fix rewrites `//` comments into `/** ... */` while preserving the text; whitespace-only comments become `/** declaration comment */` as a generic label so the declaration still has a visible doc stub.

### ❌ Incorrect

```ts
// This function fetches user data
function getUser() {
  return fetch('/api/user');
}

// API base URL
const BASE_URL = 'https://api.example.com';

// User type
interface User {
  id: number;
  // Name of user
  name: string;
}
```

### Exceptions

ESLint directive comments are ignored by this rule so configuration stays intact.

```ts
// eslint-disable-next-line no-unused-vars
const ignored = true;
```

### ✅ Correct

```ts
/** This function fetches user data */
function getUser() {
  return fetch('/api/user');
}

/** API base URL */
const BASE_URL = 'https://api.example.com';

/** User type */
interface User {
  id: number;
  /** Name of user */
  name: string;
}

/* Block comments of any kind are not checked by this rule */
/* eslint-disable no-console */
function log() {
  console.log('safe');
}
```

## When Not To Use It

You might consider disabling this rule if:

1. Your team has a different commenting convention that doesn't rely on JSDoc-style block comments.
2. You're working with a codebase that doesn't benefit from IDE tooltips and autocomplete features.
3. You're working on a project where documentation is primarily maintained outside the code.

## Further Reading

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeScript Documentation Comments](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
