# Enforce that all Firestore transaction read operations are performed before any write operations (`@blumintinc/blumint/firestore-transaction-reads-before-writes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Firestore transactions must complete every read before performing any writes so the callback runs against a consistent snapshot. If a read happens after a write, the Firestore SDK can throw (`All reads must be before any writes`) or retry the transaction with stale data, reapplying writes that were computed from outdated snapshots. This rule reports reads that occur after writes inside the same transaction callback.

Reading after writing can lead to:

- Unexpected behavior
- Transaction failures
- Infinite retry loops
- Inconsistent data states

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
// Computed property access after a write (still a read)
await firestore.runTransaction(async (transaction) => {
  transaction.set(docRef, { status: 'processing' });

  const method = 'get';
  const docSnapshot = await transaction[method](otherDocRef); // ❌ Error

  return docSnapshot.data();
});
```

```typescript
// Different transaction object names
await firestore.runTransaction(async (t) => {
  t.set(docRef, { field: 'value' });
  const doc = await t.get(otherRef); // ❌ Error
});
```

```typescript
// A wrapper around the computed key does not hide the read
await firestore.runTransaction(async (transaction) => {
  transaction.set(docRef, { status: 'processing' });

  const method = 'get';
  const docSnapshot = await transaction[assertSafe(method)](otherDocRef); // ❌ Error

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

```typescript
// Computed property access is safe when reads happen first
await firestore.runTransaction(async (transaction) => {
  const method = 'get';
  const doc = await transaction[method](docRef); // Read first, before writes

  transaction.set(docRef, { status: 'processing' });
  return doc.data();
});
```

```typescript
// A wrapped key resolving to a write is a write, not a read
await firestore.runTransaction(async (transaction) => {
  const doc = await transaction[assertSafe('get')](docRef);

  transaction[assertSafe('set')](docRef, { status: 'processing' });
  return doc.data();
});
```

## Edge Cases Handled

### 1. Conditional Write Operations

The rule tracks control flow to identify reads that could potentially occur after writes, even in conditional branches.

### 2. Different Transaction Object Names

The rule identifies transaction parameters regardless of their name (e.g., `transaction`, `tx`, `t`) and tracks their methods.

### 3. Multiple SDK Versions

The rule recognizes various Firebase SDK imports and patterns:
- Web v9 SDK (modular)
- Web v8 SDK (namespaced)
- Admin SDK

### 4. Transaction vs. Direct Methods

The rule distinguishes between transaction methods (`transaction.get()`) and direct Firestore methods (`docRef.get()`), only flagging transaction operations.

### 5. Nested Function Calls

The rule attempts to track transaction objects passed to other functions and analyzes their usage across function boundaries when possible.

### 6. Computed Transaction Method Access

Computed property access (e.g., `transaction['get']`) is treated conservatively. Reads after writes are reported even when the method name is computed, and reported data includes the method name when it can be determined.

### 7. Wrapped Computed Keys

A computed key is read through the wrappers that leave the selected method unchanged, so wrapping cannot hide a read:

- **Key assertions** — `assertSafe(key)` validates the key and returns it, so `transaction[assertSafe(method)]` is judged exactly as `transaction[method]` is. This matters because [`enforce-assert-safe-object-key`](./enforce-assert-safe-object-key.md) is `error` in the same config and its fixer writes that wrapper automatically.
- **Erased type wrappers** — `key as string`, `key satisfies string`, `<string>key`, `key!` and `await key` compile away or resolve to the same key, and they nest (`assertSafe((key as string)!)`).
- **Any other call** — `transaction[String(method)]` may return something other than what it was handed, so the key counts as unresolved and falls to the conservative verdict rather than to a definite read or write. A definite `get` / `set` / `update` / `delete` classification is only drawn through a key assertion, whose return value is provably its argument.

Shapes the rule has never classified — member expressions (`transaction[ops.read]`), ternaries and template literals — stay unclassified whether or not a key assertion wraps them, since reading through an assertion is information-free.

## When Not To Use It

Keep this rule enabled wherever you use Firestore transactions. Consider disabling only if:

- You work with a custom transaction abstraction that does not require read-before-write ordering.
- You are in a short migration window where enforcing the pattern would block staged refactors.

## Further Reading

- [Firestore Transactions Documentation](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Transaction Best Practices](https://firebase.google.com/docs/firestore/manage-data/transactions#transaction_best_practices)
