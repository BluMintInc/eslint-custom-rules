# no-try-catch-already-exists-in-transaction

💼 Enabled in the recommended config.

Disallow handling Firestore `ALREADY_EXISTS` errors inside `runTransaction` callbacks. `ALREADY_EXISTS` is permanent; the transaction body is retried on contention, so a catch inside the callback will re-run and can append/mutate state multiple times. Handle the error outside the transaction or via a helper (e.g., `runCreateForgivenessTransaction`) so the handler runs once.

## Why this rule exists

- Firestore retries transaction callbacks on contention; in-callback catches run again on retry.
- `ALREADY_EXISTS` (code `6`) is not retryable, so handling it inside the retried section breaks idempotent “ask-for-forgiveness” patterns (e.g., Coinflow processors).

## Rule details

The rule reports any `try`/`catch` inside a `runTransaction` callback that checks for `ALREADY_EXISTS` by string (`'already-exists'`, `'ALREADY_EXISTS'`) or numeric code (`6`) using equality (`==`/`===`). Inequality checks (e.g., `!== 'already-exists'`) are allowed.

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

```ts
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

## Correct

Handle the error outside the transaction:

```ts
try {
  await db.runTransaction(async (transaction) => {
    await creator.createTransaction(transaction);
  });
} catch (error) {
  const errorWithCode = error as { code?: string | number };
  if (errorWithCode.code === 'already-exists' || errorWithCode.code === 6) {
    await this.appendAdvancementToExisting();
    return;
  }
  throw error;
}
```

Or use the forgiveness helper:

```ts
import { runCreateForgivenessTransaction } from '../utils/runCreateForgivenessTransaction';

await runCreateForgivenessTransaction({
  create: async (transaction) => {
    await creator.createTransaction(transaction);
  },
  onAlreadyExists: async () => {
    await this.appendAdvancementToExisting();
  },
});
```

## Edge cases handled

- Detects both `db.runTransaction(...)` and `runTransaction(firestore, ...)`.
- Supports equality comparisons against `'already-exists'`, `'ALREADY_EXISTS'`, and numeric `6`.
- Handles optional chaining, destructured catch params, aliases from the caught error, nested try/catch, and `switch` cases on `error.code`.

## Limitations

- Focuses on try/catch blocks inside the transaction callback; it does not follow external helpers invoked from inside the transaction. Keep `ALREADY_EXISTS` handling adjacent to the transaction call site.
