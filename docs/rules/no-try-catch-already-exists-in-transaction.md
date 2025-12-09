# Prevent ALREADY_EXISTS handling inside Firestore transactions (`@blumintinc/blumint/no-try-catch-already-exists-in-transaction`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Firestore automatically retries `runTransaction` callbacks on contention. `ALREADY_EXISTS` errors are permanent, not retryable. Catching them inside the transaction callback makes the handler re-run on each retry attempt, which can append or mutate state multiple times and breaks the ask-for-forgiveness pattern used for idempotent writes (e.g., Coinflow processors). The error handling must sit outside the transaction or use a dedicated helper like `runCreateForgivenessTransaction`.

## Examples

### ❌ Incorrect

```typescript
await db.runTransaction(async (transaction) => {
  try {
    await creator.createTransaction();
  } catch (error) {
    if (error.code === 'already-exists' || error.code === 6) {
      await appendAdvancementToExisting(transaction);
      return;
    }
    throw error;
  }
});
```

```typescript
await firestore.runTransaction(async (transaction) => {
  try {
    await creator.createTransaction();
  } catch ({ code }) {
    if (code === 'already-exists') {
      await appendAdvancementToExisting(transaction);
    }
  }
});
```

### ✅ Correct

```typescript
import { runCreateForgivenessTransaction } from '../../../util/firestore/runCreateForgivenessTransaction';

await runCreateForgivenessTransaction({
  create: async (transaction) => {
    await creator.createTransaction();
  },
  onAlreadyExists: async () => {
    await appendAdvancementToExisting();
  },
});
```

```typescript
try {
  await db.runTransaction(async (transaction) => {
    await creator.createTransaction();
  });
} catch (error) {
  const errorWithCode = error as { code?: string | number };
  if (errorWithCode.code === 'already-exists' || errorWithCode.code === 6) {
    await appendAdvancementToExisting();
    return;
  }
  throw error;
}
```

## Edge Cases Handled

- Detects `runTransaction` as a method (`db.runTransaction(...)`) and as a standalone call (`runTransaction(firestore, ...)`).
- Catches comparisons against `'already-exists'`, `'ALREADY_EXISTS'`, and numeric code `6` with either `==` or `===`.
- Handles optional chaining, destructured catch parameters, and aliases created from the caught error (e.g., `const errorWithCode = error as ...` or `const { code } = error`).
- Flags checks inside nested try/catch blocks within the transaction callback.
- Matches `switch` statements that branch on `error.code` with an `ALREADY_EXISTS` case.

## Limitations

The rule focuses on try/catch blocks located inside the transaction callback. It does not follow error-handling helpers defined outside and invoked from within the transaction. Keep the ALREADY_EXISTS handling adjacent to the transaction call site for clarity and to avoid retries re-running the handler.
