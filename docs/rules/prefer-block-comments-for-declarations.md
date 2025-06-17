# Enforce the use of block comments for declarations (`@blumintinc/blumint/prefer-block-comments-for-declarations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of block comments (`/** */`) instead of single-line comments (`//`) for all declarations, including type declarations, variable declarations, and function declarations.

## Rule Details

This rule aims to improve code readability and developer experience by ensuring that documentation-like comments are properly formatted as block comments. Block comments are picked up by VSCode and other IDEs for autocomplete and hover tooltips, making the codebase more maintainable and developer-friendly.

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
```

## When Not To Use It

You might consider disabling this rule if:

1. Your team has a different commenting convention that doesn't rely on JSDoc-style block comments.
2. You're working with a codebase that doesn't benefit from IDE tooltips and autocomplete features.
3. You're working on a project where documentation is primarily maintained outside the code.

## Further Reading

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeScript Documentation Comments](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
