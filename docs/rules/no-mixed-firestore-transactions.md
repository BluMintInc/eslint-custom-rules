# Prevent mixing transactional and non-transactional Firestore operations within a transaction (`@blumintinc/blumint/no-mixed-firestore-transactions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule identifies usage of non-transactional Firestore operations within a transaction scope. Mixing these can lead to race conditions and inconsistent data, as transactional reads must occur before any writes, and all operations within a transaction should use the transaction object.

## Rule Details

Within a `db.runTransaction()` callback or functions that receive a `FirebaseFirestore.Transaction` as a parameter, you must ensure that all Firestore operations are aware of the transaction.

- For **writes** using `DocSetter`, you should use `DocSetterTransaction` and pass the transaction object in the options.
- For **reads** using `FirestoreDocFetcher` or `FirestoreFetcher`, you should pass `{ transaction: tx }` to the `fetch()` method.

### Why It Matters

1.  **Atomicity**: Non-transactional operations happen outside the transaction's atomic scope.
2.  **Consistency**: Mixing operations can violate Firestore's requirement that all reads must precede all writes in a transaction.
3.  **Isolation**: Non-transactional reads might see partially applied changes from other concurrent transactions.

## How to Fix

### For Reads (FirestoreDocFetcher / FirestoreFetcher)

Pass the transaction object to the `fetch` method:

```typescript
await db.runTransaction(async (tx) => {
  const fetcher = new FirestoreDocFetcher(ref);
  // INCORRECT: fetcher.fetch()
  const data = await fetcher.fetch({ transaction: tx }); // CORRECT
});
```

### For Writes (DocSetter)

Use `DocSetterTransaction` instead of `DocSetter`:

```typescript
await db.runTransaction(async (tx) => {
  // INCORRECT: new DocSetter(ref).set(...)
  const setter = new DocSetterTransaction(ref, { transaction: tx }); // CORRECT
  await setter.set(data);
});
```

## Examples

### Examples of incorrect code for this rule:

```typescript
await db.runTransaction(async (tx) => {
  const fetcher = new FirestoreDocFetcher(ref);
  const data = await fetcher.fetch(); // Missing transaction
});

await db.runTransaction(async (tx) => {
  const setter = new DocSetter(ref); // Non-transactional setter
  await setter.set(data);
});

async function updateData(tx: FirebaseFirestore.Transaction) {
  const fetcher = new FirestoreDocFetcher(ref);
  await fetcher.fetch(); // Missing transaction in helper
}
```

### Examples of correct code for this rule:

```typescript
await db.runTransaction(async (tx) => {
  const fetcher = new FirestoreDocFetcher(ref);
  const data = await fetcher.fetch({ transaction: tx });
});

await db.runTransaction(async (tx) => {
  const setter = new DocSetterTransaction(ref, { transaction: tx });
  await setter.set(data);
});

async function updateData(tx: FirebaseFirestore.Transaction) {
  const fetcher = new FirestoreDocFetcher(ref);
  await fetcher.fetch({ transaction: tx });
}
```
