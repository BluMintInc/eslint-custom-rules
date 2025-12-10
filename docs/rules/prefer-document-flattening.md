# Enforce using the shouldFlatten option when setting deeply nested objects in Firestore documents (`@blumintinc/blumint/prefer-document-flattening`)

<!-- end auto-generated rule header -->

Require DocSetter and DocSetterTransaction instances to flatten nested Firestore writes so nested updates stay atomic, queryable, and conflict-resistant.

## Why this rule exists

- Nested object writes overwrite sibling fields unless the caller reads and merges the document first, forcing read-modify-write cycles.
- Read-modify-write increases contention and makes concurrent updates brittle, especially on high-traffic collections.
- Flattening to field-path writes keeps nested updates atomic, enables targeted queries, and avoids accidental data loss when multiple writers touch the same document.

## Rule Details

The rule reports DocSetter or DocSetterTransaction instances that are created without `shouldFlatten` and later call `set` or `setAll` with payloads containing nested objects (including arrays of nested objects).

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

Consider disabling the rule when all documents are flat, or when another enforced pattern already guarantees safe field-path updates without relying on `DocSetter` flattening.

## Further Reading

- [Firestore Field Paths Documentation](https://firebase.google.com/docs/firestore/query-data/queries#query_operators)
- [Firestore Update Operations](https://firebase.google.com/docs/firestore/manage-data/add-data#update-data)
