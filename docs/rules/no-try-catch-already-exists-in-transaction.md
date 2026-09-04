# Disallow catching ALREADY_EXISTS errors inside Firestore transaction callbacks (`@blumintinc/blumint/no-try-catch-already-exists-in-transaction`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Disallow handling Firestore `ALREADY_EXISTS` errors inside `runTransaction` callbacks. `ALREADY_EXISTS` is permanent; the transaction body is retried on contention, so a catch inside the callback will re-run and can append/mutate state multiple times. Handle the error outside the transaction or via a helper (e.g., `runCreateForgivenessTransaction`) so the handler runs once.

## Why this rule exists

- Firestore retries transaction callbacks on contention; in-callback catches run again on retry.
- `ALREADY_EXISTS` (code `6`) is not retryable, so handling it inside the retried section breaks idempotent “ask-for-forgiveness” patterns (e.g., Coinflow processors).

## Rule details

The rule reports any `try`/`catch` inside a `runTransaction` callback that checks for `ALREADY_EXISTS` by string (`'already-exists'`, `'ALREADY_EXISTS'`) or numeric code (`6`) using equality (`==`/`===`). Inequality checks (e.g., `!== 'already-exists'`) are allowed.

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

## Realtime Database is excluded

`runTransaction` is not a Firestore-only name. Firebase ships a second one for the
Realtime Database:

```ts
// firebase/firestore — reported
export declare function runTransaction<T>(
  firestore: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>,
  options?: TransactionOptions,
): Promise<T>;

// firebase/database — not reported
export declare function runTransaction(
  ref: DatabaseReference,
  transactionUpdate: (currentData: any) => unknown,
  options?: TransactionOptions,
): Promise<TransactionResult>;
```

The Realtime Database re-applies its update function locally on conflict and its
errors carry no gRPC status codes, so `ALREADY_EXISTS` (code `6`) is not part of
its error model. Neither remedy this rule offers applies either —
`runCreateForgivenessTransaction` is backend-Firestore only — so a report on an
RTDB transaction leaves no way to comply except a blanket disable.

The rule therefore traces the callee binding to its import and stays silent when
the module is a Realtime Database surface:

```ts
// Not reported: the callee resolves to firebase/database
import { runTransaction } from 'firebase/database';
await runTransaction(dbRef, (currentData) => {
  try {
    return currentData + 1;
  } catch (error) {
    if (error.code === 6) {
      return currentData;
    }
    throw error;
  }
});
```

## Edge cases handled

- Detects both `db.runTransaction(...)` and `runTransaction(firestore, ...)`.
- Supports equality comparisons against `'already-exists'`, `'ALREADY_EXISTS'`, and numeric `6`.
- Handles optional chaining, destructured catch params, aliases from the caught error, nested try/catch, and `switch` cases on `error.code`.
- Resolves the provenance of the call through named, aliased, default, and namespace imports; for `database.runTransaction(...)` the receiver is what carries the module, not the property.
- Recognizes Firestore package roots structurally, so a deep entry point (`firebase/firestore/lite`), a build variant (`@firebase/firestore-compat`), and a pinned specifier (`firebase@10.1.0/firestore`) all count: `firebase/firestore`, `firebase-admin/firestore`, `@firebase/firestore`, and `@google-cloud/firestore`.

## Limitations

- Focuses on try/catch blocks inside the transaction callback; it does not follow external helpers invoked from inside the transaction. Keep `ALREADY_EXISTS` handling adjacent to the transaction call site.
- The module gate speaks only when the binding resolves to an import. A call whose callee has no traceable origin — a bare `runTransaction(...)`, a parameter, a locally declared helper, or a member call on an unresolvable receiver such as `db.runTransaction(...)` — is reported, because an untraceable `runTransaction` is far more often Firestore than not. Wrapping a Realtime Database transaction in a local helper named `runTransaction` therefore still reports; import the RTDB function directly, or disable the rule at that call.
- A binding that shadows an import (a parameter or local named `runTransaction`) resolves to the shadow, which carries no module provenance, so the call is reported.
- Aliasing the import away from the name (`import { runTransaction as runRtdbTransaction }`) puts the call outside the rule entirely: matching starts from the callee's spelling.
