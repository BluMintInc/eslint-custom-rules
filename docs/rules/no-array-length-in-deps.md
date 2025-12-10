# Prevent using array.length in React hook dependency arrays. Instead, memoize stableHash(array) with useMemo and depend on the hash (`@blumintinc/blumint/no-array-length-in-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

**Prevent using `array.length` in React hook dependency arrays. Enforce a memoized `stableHash(array)` with `useMemo`, and depend on the hash instead.**

- Why: Using only the length of an array in a deps array fails when the contents change but the length stays the same. This causes stale effects and subtle bugs.
- Fix: Create a memoized hash with `useMemo(() => stableHash(array), [array])` and use that variable as the dependency.

## Rule Details

This rule flags any usage of `array.length` in the dependency arrays of `useEffect`, `useCallback`, and `useMemo`.
It auto-fixes by:

- Inserting a memoized hash variable above the hook call:
  - `const itemsHash = useMemo(() => stableHash(items), [items]);`
- Adding imports:
  - `import { useMemo } from 'react';`
  - `import { stableHash } from 'functions/src/util/hash/stableHash';`
- Replacing the `array.length` expression inside the dependency array with the memoized variable name.
- Generating unique variable names by appending `Hash` (e.g., `itemsHash`) or `Hash2`, `Hash3`, etc. on conflict.

This ensures effects re-run whenever array contents change, not just when its length changes. `stableHash` safely stringifies values to produce a stable hash for arrays and objects.

## Options

- `hashImport.source` (default `functions/src/util/hash/stableHash`): module path for the hash helper.
- `hashImport.importName` (default `stableHash`): import name for the hash helper.

## Examples

Bad:

```tsx
useEffect(() => {
  // ...
}, [items.length]);
```

Good:

```tsx
import { useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

const itemsHash = useMemo(() => stableHash(items), [items]);

useEffect(() => {
  // ...
}, [itemsHash]);
```

### Optional Chaining

```tsx
// bad
useEffect(() => {}, [data?.items.length]);

// good
const itemsHash = useMemo(() => stableHash(data?.items), [data?.items]);
useEffect(() => {}, [itemsHash]);
```

### Multiple array.length Expressions

```tsx
// bad
useEffect(() => {}, [items.length, users.length, messages.length]);

// good
const itemsHash = useMemo(() => stableHash(items), [items]);
const usersHash = useMemo(() => stableHash(users), [users]);
const messagesHash = useMemo(() => stableHash(messages), [messages]);
useEffect(() => {}, [itemsHash, usersHash, messagesHash]);
```

## Edge Cases

- Primitive and complex arrays: Works for arrays of primitives and arrays of objects.
- Nullable arrays and conditionals: Optional chaining on array references is preserved in both memo and deps (e.g., `s?.users`).
- Variable naming: Appends `Hash` to the array name or last property (e.g., `listHash`, `usersHash`), adding a numeric suffix on conflict.
- False positives: If you truly only care about length (e.g., emptiness), temporarily disable: `// eslint-disable-next-line no-array-length-in-deps` on the previous line.

## When Not To Use It

- If performance requirements or architectural constraints mean you only want to trigger when the length changes and not when contents change. Prefer a targeted disable comment for specific cases.