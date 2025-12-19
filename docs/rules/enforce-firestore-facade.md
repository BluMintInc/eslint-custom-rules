# Enforce usage of Firestore facades instead of direct Firestore methods (`@blumintinc/blumint/enforce-firestore-facade`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Direct Firestore reads and writes must go through the facade layer so we keep type safety, retries, validation, and metrics in one place. Calling `get`, `set`, `update`, or `delete` on `DocumentReference`, transactions, or batches bypasses those safeguards and makes data access harder to audit or evolve.

## Rule Details

This rule reports direct Firestore CRUD calls and reminds you to use the provided facades instead:

- Use `FirestoreFetcher` or `FirestoreDocFetcher` for reads.
- Use `DocSetter`, `DocSetterTransaction`, or `BatchManager` for writes and deletes.
- Realtime Database refs and JavaScript collection methods (`Set`, `Map`, etc.) remain allowed; the rule only targets Firestore access.

## Options

This rule does not have any options.

### Examples of **incorrect** code for this rule:

```ts
const docRef = db.collection('users').doc('user123');

// Direct Firestore calls bypass validation, retries, and metrics
const snapshot = await docRef.get();
await docRef.set({ name: 'Ada' });
await docRef.update({ active: true });
await docRef.delete();

// Transactions and batches also need facades
await db.runTransaction(async (transaction) => {
  const user = await transaction.get(docRef);
  transaction.set(docRef, { ...user.data(), refreshedAt: Date.now() });
});
```

### Examples of **correct** code for this rule:

```ts
// Reads go through the fetcher facades
const fetcher = new FirestoreDocFetcher<UserDocument>(docRef);
const user = await fetcher.fetch();

// Writes and deletes go through the setter facades
const setter = new DocSetter<UserDocument>(db.collection('users'));
await setter.set({ id: 'user123', name: 'Ada' });
await setter.update({ id: 'user123', active: true });
await setter.delete('user123');

// Transactions stay safe via DocSetterTransaction
await db.runTransaction(async (transaction) => {
  const txSetter = new DocSetterTransaction<UserDocument>(db.collection('users'), {
    transaction,
  });
  await txSetter.update({ id: 'user123', refreshedAt: Date.now() });
});
```

## When Not To Use It

Disable this rule only in the rare cases where you are building or testing the facade layer itself and need to exercise the raw Firestore SDK. For application code, keep it enabled so Firestore access stays consistent and observable.
