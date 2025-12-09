# no-try-catch-already-exists-in-transaction

Disallow handling Firestore `ALREADY_EXISTS` errors inside `runTransaction` callbacks. `ALREADY_EXISTS` is a permanent failure, but Firestore retries transaction bodies on contention. Catching it inside the transaction re-runs the handler on every retry and breaks the ask-for-forgiveness pattern.

## Why this rule exists

- Firestore retries transaction callbacks, so error handling inside the callback is executed again when the transaction retries for unrelated contention.
- `ALREADY_EXISTS` (code `6`) is not retryable; handling it inside the transaction couples idempotent logic to the retry loop.
- BluMint uses the ask-for-forgiveness pattern for idempotent writes (e.g., Coinflow webhook processors). The handler for `ALREADY_EXISTS` must run once, outside the transaction.

## Rule details

This rule reports any `try`/`catch` inside a Firestore `runTransaction` callback that checks for `ALREADY_EXISTS`, whether by string (`'already-exists'`, `'ALREADY_EXISTS'`) or numeric code (`6`).

### Options

None.

## Incorrect

```ts
await db.runTransaction(async (transaction) => {
  try {
    await creator.createTransaction(transaction);
  } catch (error) {
    if (error.code === 'already-exists' || error.code === 6) {
      await this.appendAdvancementToExisting(transaction);
      return;
    }
    throw error;
  }
});
```

## Correct

Place the handler outside the transaction:

```ts
try {
  await db.runTransaction(async (transaction) => {
    await creator.createTransaction(transaction);
  });
} catch (error) {
  if (error.code === 'already-exists' || error.code === 6) {
    await this.appendAdvancementToExisting();
    return;
  }
  throw error;
}
```

Or use the forgiveness helper:

```ts
import { runCreateForgivenessTransaction } from '../../../util/firestore/runCreateForgivenessTransaction';

await runCreateForgivenessTransaction({
  create: async (transaction) => {
    await creator.createTransaction(transaction);
  },
  onAlreadyExists: async () => {
    await this.appendAdvancementToExisting();
  },
});
```

