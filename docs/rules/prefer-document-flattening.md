# Enforce using the shouldFlatten option when setting deeply nested objects in Firestore documents (`@blumintinc/blumint/prefer-document-flattening`)

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

Require DocSetter and DocSetterTransaction instances to flatten nested Firestore writes so nested updates stay atomic, queryable, and conflict-resistant.

## Why this rule exists

- Nested object writes overwrite sibling fields unless the caller reads and merges the document first, forcing read-modify-write cycles.
- Read-modify-write increases contention and makes concurrent updates brittle, especially on high-traffic collections.
- Flattening to field-path writes keeps nested updates atomic, enables targeted queries, and avoids accidental data loss when multiple writers touch the same document.

## Rule Details

The rule reports when you create `DocSetter` or `DocSetterTransaction` instances without `shouldFlatten` and later call `set` or `setAll` with payloads containing nested objects (including arrays of nested objects).

Using field paths with flattened documents instead of nested objects provides several critical advantages:

1. Enables direct querying of nested fields without compound indexes.
2. Eliminates the need for read-before-write operations when updating nested fields.
3. Reduces transaction requirements for updating nested properties.
4. Minimizes potential update conflicts.
5. Improves performance through more targeted database operations.

### How to fix

- Prefer adding `shouldFlatten: true` in the constructor options so nested payloads are flattened automatically.
- Alternatively, pass flattened field-path keys (for example, `'profile.settings.theme'`) instead of nested objects when calling `set` or `setAll`.

### Examples

#### ❌ Incorrect

```typescript
const userSetter = new DocSetter<UserDocument>(db.collection('users'));

await userSetter.set({
  id: 'user123',
  profile: {
    personal: {
      firstName: 'John',
      lastName: 'Doe',
    },
    settings: {
      theme: 'dark',
      notifications: {
        email: true,
        push: false,
      },
    },
  },
});
```

#### ✅ Correct (enable shouldFlatten)

```typescript
const userSetter = new DocSetter<UserDocument>(
  db.collection('users'),
  { shouldFlatten: true },
);

await userSetter.set({
  id: 'user123',
  profile: {
    personal: {
      firstName: 'John',
      lastName: 'Doe',
    },
    settings: {
      theme: 'dark',
      notifications: {
        email: true,
        push: false,
      },
    },
  },
});
```

#### ✅ Correct (transaction)

```typescript
// Creating DocSetterTransaction with shouldFlatten option
const userTx = new DocSetterTransaction<UserDocument>(db, { shouldFlatten: true });

await userTx.run(async (tx) => {
  // Set nested objects; they will be flattened automatically.
  await tx.set('users/user123', {
    profile: {
      personal: { firstName: 'John', lastName: 'Doe' },
      settings: { theme: 'dark' },
    },
  });

  // Update a nested field directly using a field path.
  await tx.updateIfExists('users/user123', {
    'profile.settings.theme': 'light',
  });
});
```

#### ✅ Correct (flatten manually)

```typescript
const userSetter = new DocSetter<UserDocument>(db.collection('users'));

await userSetter.set({
  id: 'user123',
  'profile.personal.firstName': 'John',
  'profile.personal.lastName': 'Doe',
  'profile.settings.theme': 'dark',
  'profile.settings.notifications.email': true,
  'profile.settings.notifications.push': false,
});
```

## When Not To Use It

You might consider disabling this rule if:

1. The documents you handle do not have nested objects.
2. Performance needs are better served by nested object structures.
3. A different document-update pattern avoids field paths entirely.

## Further Reading

- [Firestore Field Paths Documentation](https://firebase.google.com/docs/firestore/query-data/queries#query_operators)
- [Firestore Update Operations](https://firebase.google.com/docs/firestore/manage-data/add-data#update-data)
