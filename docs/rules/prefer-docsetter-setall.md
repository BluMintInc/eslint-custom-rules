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
const docSetter = new DocSetter<User>(userCollection);

await Promise.all(
  userIds.map((userId) =>
    docSetter.set({ id: userId, activeTournament: FieldValue.delete() }),
  ),
);
```

```typescript
class TournamentWriter {
  #docSetter = new DocSetter<User>(userCollection);

  async write(userIds: string[]) {
    userIds.forEach((userId) => {
      this.#docSetter.set({ id: userId, activeTournament: null });
    });
  }
}
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

```typescript
class TournamentWriter {
  #docSetter = new DocSetter<User>(userCollection);

  async write(userIds: string[]) {
    const updates = userIds.map((userId) => ({
      id: userId,
      activeTournament: null,
    }) as const);
    await this.#docSetter.setAll(updates);
  }
}
```

## Edge Cases and Notes

- Single `set` calls outside of loops or array callbacks are allowed; the rule focuses on iterative writes.
- The receiver must be resolvable to a setter in the same file — a `new DocSetter(...)`/`new DocSetterTransaction(...)` initializer or a `DocSetter`/`DocSetterTransaction` type annotation. A `set` call on a receiver of unknown origin is left alone so unrelated `map.set(...)`/`ref.set(...)` calls are never flagged, which is why each example below declares its own setter.
- A class field holding the setter resolves the same whichever way its privacy is spelled: `private docSetter`, a `private docSetter` constructor parameter property, a plain public field, and the ECMA private field `#docSetter` are all reported alike. `#docSetter` and `docSetter` are nonetheless separate members — a class may declare both — so a `set` call on one is never explained by the other, and `this.#docSetter.set(...)` is reported only when the `#docSetter` field itself is a setter. Reports on an ECMA private field name it as `#docSetter` so the suggested `this.#docSetter.setAll(updates)` is written exactly as read.
- Keep Firestore batch/transaction limits (500 operations) in mind when batching. The rule does not enforce the limit, so split batches manually when necessary.
- When building the updates array, prefer `as const` for literal objects so `setAll` keeps the narrow types you expect.

## When Not To Use It

You can disable this rule in legacy areas that cannot easily be refactored to batch writes, but prefer refactoring instead of suppressing so Firestore operations remain efficient and consistent.
