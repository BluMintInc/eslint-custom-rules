# Enforce that all Firestore transaction read operations are performed before any write operations (`@blumintinc/blumint/firestore-transaction-reads-before-writes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Firestore transactions must complete every read before performing any writes so the callback runs against a consistent snapshot. If a read happens after a write, the Firestore SDK can throw (`All reads must be before any writes`) or retry the transaction with stale data, reapplying writes that were computed from outdated snapshots. This rule reports reads that occur after writes inside the same transaction callback.

When the rule fires, it names the read and the earlier writes so you know what to reorder. Example message:

- `Read operation "transaction.get" runs after transaction writes (transaction.set). Firestore transactions must collect every read before any write to keep a consistent snapshot and avoid Firestore retries that reapply writes with stale data. Move this read before the first write in the same transaction callback.`

### How to fix

- Move all `transaction.get` calls (or helpers that perform reads) before any `set`, `update`, or `delete`.
- Store snapshot data in locals and perform writes only after all reads finish.
- For conditional logic, perform the needed reads first and branch on the in-memory data afterward.

## Examples

### ❌ Incorrect

```typescript
await firestore.runTransaction(async (transaction) => {
  transaction.set(docRef, { status: 'processing' });

  const docSnapshot = await transaction.get(otherDocRef); // ❌ Read after a write

  return docSnapshot.data();
});
```

```typescript
await firestore.runTransaction(async (tx) => {
  tx.update(docRef, { count: 1 });
  tx.delete(otherDocRef);

  const snapshot = await tx.get(summaryRef); // ❌ After update/delete writes
  return snapshot.data();
});
```

```typescript
const methodName = 'get';
await firestore.runTransaction(async (transaction) => {
  transaction.set(docRef, { status: 'processing' });

  const docSnapshot = await transaction[methodName](otherDocRef); // ❌ Computed read after write
  return docSnapshot.data();
});
```

### ✅ Correct

```typescript
await firestore.runTransaction(async (transaction) => {
  const docSnapshot = await transaction.get(otherDocRef);
  const additionalSnapshot = await transaction.get(anotherDocRef);

  transaction.set(docRef, { status: 'processing' });
  transaction.update(otherDocRef, { lastUpdated: Date.now() });

  return {
    first: docSnapshot.data(),
    second: additionalSnapshot.data(),
  };
});
```

```typescript
await firestore.runTransaction(async (transaction) => {
  const userSnapshot = await transaction.get(userRef);

  const updates = userSnapshot.exists
    ? { status: 'active' }
    : { status: 'pending' };

  transaction.set(userRef, updates);
});
```

```typescript
import { runTransaction, getFirestore } from 'firebase/firestore';

await runTransaction(getFirestore(), async (transaction) => {
  const [settings, profile] = await Promise.all([
    transaction.get(settingsRef),
    transaction.get(profileRef),
  ]);

  transaction.set(settingsRef, { ...settings.data(), updatedBy: adminId });
  transaction.update(profileRef, { syncedAt: Date.now() });
});
```

## Edge Cases Handled

- Transaction parameters named `transaction`, `tx`, or `t`.
- Reads that follow any combination of `set`, `update`, or `delete` writes.
- Computed property access such as `transaction[methodName]` when writes already occurred.
- Differentiating transaction calls from direct document reads (`docRef.get()` is ignored).

## When Not To Use

Keep this rule enabled wherever you use Firestore transactions. Consider disabling only if:

- You work with a custom transaction abstraction that does not require read-before-write ordering.
- You are in a short migration window where enforcing the pattern would block staged refactors.

## Further Reading

- [Firestore Transactions Documentation](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Transaction Best Practices](https://firebase.google.com/docs/firestore/manage-data/transactions#transaction_best_practices)
