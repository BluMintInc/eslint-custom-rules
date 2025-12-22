# Prevent unsafe object/array spreads in Firestore updates (`@blumintinc/blumint/no-unsafe-firestore-spread`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Firestore merge updates treat each field you provide as a complete value. Spreading objects or arrays into the merge payload serializes the entire nested value, bypassing Firestore's field-path merges and atomic array helpers. That can overwrite sibling fields you did not include and lose concurrent array changes.

## What does this rule prevent?

- Object spreads inside `set()`/`setDoc()` calls that use `{ merge: true }`. Spreading rewrites the whole nested object instead of merging individual field paths, so unseen keys can disappear.
- Array spreads inside the same merge updates. Spreading sends a full array snapshot and skips atomic helpers like `FieldValue.arrayUnion`/`arrayRemove`, which means concurrent updates are lost.

## Examples

### ❌ Incorrect

```ts
await userDoc.ref.set(
  {
    settings: {
      ...settings,
      theme: 'dark',
    },
    tags: [...tags, 'new'],
  },
  { merge: true },
);
```

### ✅ Correct

```ts
await userDoc.ref.set(
  {
    'settings.theme': 'dark',
    tags: FieldValue.arrayUnion('new'),
  },
  { merge: true },
);
```

You can also use the Web SDK equivalents (`arrayUnion`, `arrayRemove`) or `FieldPath` objects to target specific nested fields without rewriting entire objects or arrays.
