# Enforce that all Firestore transaction read operations are performed before any write operations (`@blumintinc/blumint/firestore-transaction-reads-before-writes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule detects when Firestore transaction read operations are performed after write operations within the same transaction. In Firestore transactions, all read operations should be performed before any write operations to ensure transaction integrity and prevent potential errors.

Reading after writing can lead to:
- Unexpected behavior
- Transaction failures
- Infinite retry loops
- Inconsistent data states

This rule enforces a critical pattern for reliable Firestore transaction usage throughout your codebase.

## Examples

### ❌ Incorrect

```typescript
// Read operation AFTER a write operation (problematic)
const transactionResult = await firestore.runTransaction(async (transaction) => {
  // Write operation before read
  transaction.set(docRef, { status: 'processing' });

  // Read operation AFTER a write (problematic)
  const docSnapshot = await transaction.get(otherDocRef);

  return docSnapshot.data();
});
```

```typescript
// Conditional write followed by read
await firestore.runTransaction(async (transaction) => {
  const snapshot = await transaction.get(docRef);

  if (condition) {
    transaction.update(docRef, { field: 'value' });

    // This read happens after a conditional write
    const secondSnapshot = await transaction.get(otherDocRef); // ❌ Error
  }
});
```

```typescript
// Different transaction object names
await firestore.runTransaction(async (t) => {
  t.set(docRef, { field: 'value' });
  const doc = await t.get(otherRef); // ❌ Error
});
```

### ✅ Correct

```typescript
// All read operations performed first
const transactionResult = await firestore.runTransaction(async (transaction) => {
  // All read operations performed first
  const docSnapshot = await transaction.get(otherDocRef);
  const additionalSnapshot = await transaction.get(anotherDocRef);

  // All write operations performed after all reads
  transaction.set(docRef, { status: 'processing' });
  transaction.update(otherDocRef, { lastUpdated: Date.now() });

  return docSnapshot.data();
});
```

```typescript
// Proper ordering with conditional logic
await firestore.runTransaction(async (transaction) => {
  // Perform all reads first
  const snapshot = await transaction.get(docRef);
  const secondSnapshot = await transaction.get(otherDocRef);

  // Then perform writes based on read results
  if (condition) {
    transaction.update(docRef, { field: 'value' });
    transaction.set(anotherDocRef, { data: snapshot.data() });
  }
});
```

```typescript
// Works with different SDK versions
import { runTransaction, getFirestore } from 'firebase/firestore';

await runTransaction(getFirestore(), async (transaction) => {
  // Reads first
  const doc = await transaction.get(docRef);

  // Writes after
  transaction.update(docRef, { field: 'value' });
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

## When Not To Use

This rule should generally always be enabled when working with Firestore transactions, as it enforces a fundamental requirement of Firestore's transaction model. However, you might consider disabling it if:

- You're working with a custom transaction-like abstraction that doesn't follow Firestore's read-before-write requirement
- You're in a migration phase and need to temporarily allow the pattern while refactoring

## Further Reading

- [Firestore Transactions Documentation](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Transaction Best Practices](https://firebase.google.com/docs/firestore/manage-data/transactions#transaction_best_practices)
