# Enforce usage of Firestore facades instead of direct Firestore methods (`@blumintinc/blumint/enforce-firestore-facade`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Direct Firestore reads and writes must go through the facade layer so we keep type safety, retries, validation, and metrics in one place. Calling `get`, `set`, `update`, or `delete` on `DocumentReference`, transactions, or batches bypasses those safeguards and makes data access harder to audit or evolve.

## Rule Details

This rule reports direct Firestore CRUD calls and reminds you to use the provided facades instead:

- Use `FirestoreFetcher` or `FirestoreDocFetcher` for reads.
- Use `DocSetter`, `DocSetterTransaction`, or `BatchManager` for writes and deletes.
- Realtime Database refs and JavaScript collection methods (`Set`, `Map`, etc.) remain allowed; the rule only targets Firestore access.

## Client SDK vs Admin SDK

The facades wrap `firebase-admin/firestore` and the admin `db` singleton, so they are backend-only. Frontend code cannot import them at all. Reporting a modular **client** SDK batch or transaction would therefore prescribe a remedy that cannot exist, so client-SDK receivers are exempt:

```ts
// Frontend: exempt, because no facade equivalent exists on the client
import { doc, writeBatch, runTransaction } from 'firebase/firestore';

const batch = writeBatch(firestore);
batch.update(doc(firestore, 'users', 'u1'), { active: true });
await batch.commit();

await runTransaction(firestore, async (transaction) => {
  transaction.update(doc(firestore, 'users', 'u1'), { n: 1 });
});
```

Origin, not the spelling of the identifier, decides the classification. A receiver counts as client-SDK when any of the following holds:

- It comes from a static import of `firebase/firestore`, `@firebase/firestore`, or `firebase/firestore/lite`, including aliases (`import { writeBatch as wb }`) and namespaces (`import * as fs`).
- It comes from a dynamic `await import('firebase/firestore')`, either destructured or bound as a namespace object. The `Promise.all([...])` array form is correlated positionally, since frontend Firebase access is required to be dynamically imported.
- It is a call to `writeBatch(...)` whose origin cannot be traced. `firebase-admin/firestore` exposes no `writeBatch` export — the admin API is `db.batch()` — so that spelling identifies the client SDK on its own. A binding demonstrably imported from another module (`import { writeBatch } from './my-admin-helpers'`) overrides this.
- It is the first callback parameter of a client `runTransaction(firestore, cb)` call. `runTransaction` is spelled the same in both SDKs, so the callee shape decides: the client SDK exports a free function, while the admin SDK only exposes the `db.runTransaction(cb)` method. A bare `runTransaction(...)` that cannot be traced to a client-SDK import is treated as admin.

Admin batches and transactions are detected from their origin as well, so a rename does not evade the rule: `const chunkWriter = db.batch()` and `firestore.runTransaction(async (tx) => ...)` are reported the same as their conventionally named counterparts.

### Known limitations

- Tracking is keyed by identifier name for the whole file rather than by scope. A single file that uses the *same* identifier for both a client and an admin batch or transaction resolves it as client-SDK and leaves the admin half unreported. Admin code is backend-only and client code is frontend-only, so this shape does not occur in practice.
- Only `db`, `firestore`, and `app.firestore()` are recognized as Firestore roots. An admin handle bound to another name (`const adminDb = getFirestore(); adminDb.batch()`) is detected only when the receiver keeps a conventional name such as `batch`.
- A **local** function named `writeBatch` that returns an admin batch is treated as client-SDK, because only imported bindings are traced.
- `doc(firestore, path)` is not modeled as a client-SDK document reference, so `docRef.update(...)` is still reported through the name heuristic. The modular client `DocumentReference` exposes no `get`/`set`/`update`/`delete` methods — those are the free functions `getDoc`/`setDoc`/`updateDoc`/`deleteDoc` — so such a call site does not compile in the first place.

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
