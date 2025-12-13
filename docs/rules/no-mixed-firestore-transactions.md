# Prevent mixing transactional and non-transactional Firestore operations within a transaction (`@blumintinc/blumint/no-mixed-firestore-transactions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Firestore only guarantees atomicity when every read and write inside `runTransaction` uses the transaction object provided to the callback. Instantiating non-transactional helpers inside the callback (for example, `DocSetter`, `FirestoreDocFetcher`, or `FirestoreFetcher`) performs reads and writes outside that transaction. Those calls are not retried with the transaction and can commit even if the transaction aborts, leaving partial data or stale reads.

This rule flags new expressions for non-transactional helpers inside transaction scopes and directs you to their transaction-aware counterparts.

## Lint Message

`Non-transactional Firestore helper "{{ className }}" is instantiated inside a transaction callback, so its reads and writes bypass the transaction context. That breaks Firestore's atomicity guarantees and can commit partial updates. Use the transaction-safe "{{ transactionalClass }}" and pass the provided transaction so every operation participates in the same commit.`

## Why Mixing Contexts Is Risky

- Atomicity: writes performed outside the transaction can commit while the transaction retries, leaving partial updates.
- Consistency: reads that skip the transaction return stale data and ignore pending writes in the transaction’s view.
- Side effects and billing: helpers invoked in a retried transaction callback can run multiple times even though their work is not tied to the transaction, causing duplicate side effects or extra billing.

## How to Fix

- Inside transaction callbacks, use `DocSetterTransaction`, `FirestoreDocFetcherTransaction`, or `FirestoreFetcherTransaction`.
- Pass the provided transaction object to the helper (for example, `{ transaction: tx }`) so every operation participates in the same commit.
- Keep non-transactional helpers outside the transaction, or refactor them to accept the transaction object.

## Examples

### ❌ Incorrect

```typescript
await db.runTransaction(async (tx) => {
  const setter = new DocSetter(ref); // ❌ bypasses the transaction
  await setter.set(doc);
});
```

```typescript
await db.runTransaction(async (tx) => {
  const fetcher = new FirestoreDocFetcher(ref); // ❌ outside transaction context
  const doc = await fetcher.fetch();
});
```

### ✅ Correct

```typescript
await db.runTransaction(async (tx) => {
  const setter = new DocSetterTransaction(ref, { transaction: tx });
  await setter.set(doc);
});
```

```typescript
const setter = new DocSetter(ref);
await setter.set(doc); // ✅ safe because it is outside any transaction

await db.runTransaction(async (tx) => {
  const txSetter = new DocSetterTransaction(ref, { transaction: tx });
  await txSetter.set(otherDoc);
});
```
