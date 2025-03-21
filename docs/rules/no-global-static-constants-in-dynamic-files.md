# no-global-static-constants-in-dynamic-files

> Disallow global static constants in .dynamic.ts/.dynamic.tsx files

## Rule Details

This rule enforces that global static constants (variables declared using `export const` in SCREAMING_SNAKE_CASE) are not defined in files ending with `.dynamic.ts` or `.dynamic.tsx`. These files are meant for dynamic behavior, and including static constants in them goes against this purpose. Instead, such constants should be moved to other files that do not have the `.dynamic.ts` or `.dynamic.tsx` suffix.

This rule is important for maintaining a clear separation between static and dynamic logic, improving maintainability and readability.

### ❌ Incorrect

```ts
// file: data.dynamic.ts
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
```

### ✅ Correct

```ts
// file: config.ts
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
```

```ts
// file: fetchData.dynamic.ts
import { API_URL, TIMEOUT } from './config';

export async function fetchData() {
  return fetch(API_URL, { timeout: TIMEOUT });
}
```

## Options

This rule has no options.

## When Not To Use It

You might want to disable this rule if you don't follow the convention of separating static constants from dynamic behavior in your codebase.

## Further Reading

- [Dynamic Imports in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)
