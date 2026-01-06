# Enforce batching DocSetter and DocSetterTransaction writes by using setAll instead of set inside loops or array callbacks (`@blumintinc/blumint/prefer-docsetter-setall`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

`DocSetter` and `DocSetterTransaction` expose `setAll` so multiple document updates can be batched. Calling `set` inside loops or array callbacks issues one Firestore write per iteration, which slows down hot paths and makes it easy to miss type narrowing (e.g., `as const` payloads). This rule reports `set` calls for these setters when they appear in loops or array callbacks and guides you to collect updates and call `setAll` once.

## Examples

### ❌ Incorrect

```typescript
const docSetter = new DocSetter<User>(userCollection);

for (const userId of userIds) {
  await docSetter.set({ id: userId, activeTournament: null });
}
```

```typescript
const docSetterTransaction = new DocSetterTransaction<User>(userCollection, { transaction });

userIds.forEach((userId) => {
  docSetterTransaction.set({ id: userId, activeTournament: null });
});
```

```typescript
await Promise.all(
  userIds.map((userId) =>
    docSetter.set({ id: userId, activeTournament: FieldValue.delete() }),
  ),
);
```

### ✅ Correct

```typescript
const docSetter = new DocSetter<User>(userCollection);
const updates = userIds.map((userId) => ({
  id: userId,
  activeTournament: FieldValue.delete(),
}) as const);
await docSetter.setAll(updates);
```

```typescript
const docSetterTransaction = new DocSetterTransaction<User>(userCollection, { transaction });
const updates = userIds.map((userId) => ({
  id: userId,
  activeTournament: null,
}));
docSetterTransaction.setAll(updates);
```

## Edge Cases and Notes

- Single `set` calls outside of loops or array callbacks are allowed; the rule focuses on iterative writes.
- Keep Firestore batch/transaction limits (500 operations) in mind when batching. The rule does not enforce the limit, so split batches manually when necessary.
- When building the updates array, prefer `as const` for literal objects so `setAll` keeps the narrow types you expect.

## When Not To Use It

You can disable this rule in legacy areas that cannot easily be refactored to batch writes, but prefer refactoring instead of suppressing so Firestore operations remain efficient and consistent.
