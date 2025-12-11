# Disallow exporting SCREAMING_SNAKE_CASE constants from .dynamic files (`@blumintinc/blumint/no-static-constants-in-dynamic-files`)

<!-- end auto-generated rule header -->

`.dynamic.ts` and `.dynamic.tsx` files are reserved for runtime-only logic. Exporting static constants from these files couples fixed configuration to code paths meant to stay dynamic. Move exported `const` values with SCREAMING_SNAKE_CASE names into non-dynamic modules (for example, `config.ts`) and import them where needed.

## Rule Details

This rule reports any `export const SOME_CONSTANT = ...` declarations in files ending with `.dynamic.ts` or `.dynamic.tsx` when the identifier is SCREAMING_SNAKE_CASE. It does not auto-fix because constants should be relocated, not renamed.

Examples of **incorrect** code for this rule:

```ts
// file: data.dynamic.ts
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
```

```ts
// file: config.dynamic.ts
const settings = { API_URL: 'https://api.example.com', TIMEOUT: 5000 };
export const { API_URL, TIMEOUT } = settings;
```

```ts
// file: array-config.dynamic.ts
const settings = ['https://api.example.com', 5000];
export const [API_URL, TIMEOUT] = settings;
```

Examples of **correct** code for this rule:

```ts
// file: config.ts
export const API_URL = 'https://api.example.com';
export const TIMEOUT = 5000;
```

```ts
// file: fetch-data.dynamic.ts
import { API_URL, TIMEOUT } from './config';

export async function fetchData() {
  return fetch(API_URL, { timeout: TIMEOUT });
}
```

```ts
// file: helper.dynamic.ts
const LOCAL_TIMEOUT = 5000; // Not exported, so it is allowed
```

## When Not To Use It

Disable this rule if your project does not reserve `.dynamic.ts(x)` files for runtime-only behavior or you intentionally colocate static configuration inside those files.
