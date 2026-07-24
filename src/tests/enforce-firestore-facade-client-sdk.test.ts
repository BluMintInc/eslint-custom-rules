import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run('enforce-firestore-facade', enforceFirestoreFacade, {
  valid: [
    // Issue #1348 case 1: client-SDK writeBatch reached via a static import.
    // DocSetter is admin-only, so there is no facade this code could use.
    {
      code: `
import { doc, writeBatch } from 'firebase/firestore';
import { firestore } from '../../config/firebase-client/firestore';

export const persist = async (data: { a: number }) => {
  const docRef = doc(firestore, 'users', 'u1');
  const batch = writeBatch(firestore);
  batch.update(docRef, data);
  batch.set(docRef, data);
  batch.delete(docRef);
  await batch.commit();
};
`,
    },
    // Issue #1348 case 2: the same shape reached through the correlated
    // Promise.all dynamic-import form frontend code is required to use.
    {
      code: `
export const persist = async (data: { a: number }) => {
  const [{ firestore }, { doc, writeBatch }] = await Promise.all([
    import('../../config/firebase-client/firestore'),
    import('firebase/firestore'),
  ]);
  const docRef = doc(firestore, 'users', 'u1');
  const batch = writeBatch(firestore);
  batch.update(docRef, data);
  await batch.commit();
};
`,
    },
    // Issue #1348 case 3: client-SDK runTransaction free function.
    {
      code: `
import { doc, runTransaction } from 'firebase/firestore';
import { firestore } from '../../config/firebase-client/firestore';

export const bump = async () => {
  const docRef = doc(firestore, 'users', 'u1');
  await runTransaction(firestore, async (transaction) => {
    transaction.update(docRef, { n: 1 });
  });
};
`,
    },
    // Aliased client import.
    {
      code: `
import { writeBatch as wb } from 'firebase/firestore';
const batch = wb(firestore);
batch.set(docRef, {});
batch.update(docRef, {});
batch.delete(docRef);
`,
    },
    // Namespace client import.
    {
      code: `
import * as fs from 'firebase/firestore';
const batch = fs.writeBatch(firestore);
batch.set(docRef, {});
`,
    },
    // Namespace client import driving a transaction.
    {
      code: `
import * as fs from 'firebase/firestore';
await fs.runTransaction(firestore, async (transaction) => {
  transaction.set(docRef, {});
});
`,
    },
    // Client transaction whose callback parameter is not named "transaction".
    {
      code: `
import { runTransaction } from 'firebase/firestore';
await runTransaction(firestore, async (tx) => {
  tx.set(docRef, {});
});
`,
    },
    // Client transaction reads are equally unroutable through the facades.
    {
      code: `
import { runTransaction } from 'firebase/firestore';
await runTransaction(firestore, async (transaction) => {
  const snapshot = await transaction.get(docRef);
});
`,
    },
    // Single dynamic import, destructured.
    {
      code: `
const { writeBatch } = await import('firebase/firestore');
const batch = writeBatch(firestore);
batch.set(docRef, {});
`,
    },
    // Single dynamic import bound as a namespace object.
    {
      code: `
const firestoreSdk = await import('firebase/firestore');
const batch = firestoreSdk.writeBatch(firestore);
batch.set(docRef, {});
`,
    },
    // Dynamic import with renamed destructured bindings.
    {
      code: `
const { writeBatch: wb, runTransaction: rt } = await import('firebase/firestore');
const batch = wb(firestore);
batch.set(docRef, {});
await rt(firestore, async (transaction) => {
  transaction.set(docRef, {});
});
`,
    },
    // Promise.all with the client SDK in a non-zero position.
    {
      code: `
const [helpers, { firestore }, { writeBatch }] = await Promise.all([
  import('./helpers'),
  import('../../config/firebase-client/firestore'),
  import('firebase/firestore'),
]);
const batch = writeBatch(firestore);
batch.update(docRef, {});
`,
    },
    // Client batch behind a type assertion.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
const batch = writeBatch(firestore) as WriteBatch;
batch.set(docRef, {});
`,
    },
    // Client batch used inline without an intermediate variable.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
writeBatch(firestore).set(docRef, {});
`,
    },
    // The lite build is the same client SDK.
    {
      code: `
import { writeBatch } from 'firebase/firestore/lite';
const batch = writeBatch(firestore);
batch.set(docRef, {});
`,
    },
    // writeBatch has no admin counterpart, so an untraceable binding is still
    // client-SDK.
    {
      code: `
const batch = writeBatch(firestore);
batch.set(docRef, {});
`,
    },
    // A client batch that only commits must not be reported.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
const batch = writeBatch(firestore);
await batch.commit();
`,
    },
    // A batch reassigned from admin to client stops being reported afterwards.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
let batch = writeBatch(firestore);
batch.set(docRef, {});
batch = writeBatch(firestore);
batch.update(docRef, {});
`,
    },
  ],
  invalid: [
    // Issue #1348 false negative: an admin batch survives a rename.
    {
      code: `
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();
export const writeIt = async (data: { a: number }) => {
  const chunkWriter = db.batch();
  const docRef = db.collection('users').doc('u1');
  chunkWriter.update(docRef, data);
  await chunkWriter.commit();
};
`,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Admin batch off a root named "firestore" rather than "db".
    {
      code: `
import { getFirestore } from 'firebase-admin/firestore';
const firestore = getFirestore();
export const writeIt = async (data: { a: number }) => {
  const writer = firestore.batch();
  const docRef = firestore.collection('users').doc('u1');
  writer.update(docRef, data);
};
`,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Admin batch off app.firestore().
    {
      code: `
const writer = app.firestore().batch();
writer.set(docRef, {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Admin transaction whose callback parameter is not named "transaction".
    {
      code: `
await db.runTransaction(async (tx) => {
  const snapshot = await tx.get(docRef);
  tx.set(docRef, {});
});
`,
      errors: [{ messageId: 'noDirectGet' }, { messageId: 'noDirectSet' }],
    },
    // Admin transaction off a root named "firestore".
    {
      code: `
await firestore.runTransaction(async (trx) => {
  trx.update(docRef, {});
});
`,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // writeBatch bound to an unrelated module is not the client SDK.
    {
      code: `
import { writeBatch } from './my-admin-helpers';
const batch = writeBatch(db);
batch.set(docRef, {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // A free runTransaction that is not traceable to the client SDK keeps the
    // existing name-based detection.
    {
      code: `
await runTransaction(db, async (transaction) => {
  transaction.set(docRef, {});
});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // A batch reassigned from client to admin is reported again.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
let batch = writeBatch(firestore);
batch.set(docRef, {});
batch = db.batch();
batch.set(docRef, {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Both SDKs in one file: the admin batch is still reported.
    {
      code: `
import { writeBatch } from 'firebase/firestore';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();
const clientBatch = writeBatch(clientFirestore);
clientBatch.set(clientDocRef, {});
const adminBatch = db.batch();
adminBatch.set(db.collection('users').doc('u1'), {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Distinct parameter names keep the two SDKs apart in one file: the client
    // half is exempt while the admin half is still reported.
    {
      code: `
import { runTransaction } from 'firebase/firestore';
await runTransaction(clientFirestore, async (clientTx) => {
  clientTx.set(clientDocRef, {});
});
await db.runTransaction(async (adminTx) => {
  adminTx.set(db.collection('users').doc('u1'), {});
});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // A type-only client import carries no value binding, so it cannot exempt
    // an admin batch.
    {
      code: `
import type { WriteBatch } from 'firebase/firestore';
const batch = db.batch();
batch.set(db.collection('users').doc('u1'), {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // A client namespace import present in the file does not exempt receivers
    // that never come from it.
    {
      code: `
import * as fs from 'firebase/firestore';
const batch = db.batch();
batch.set(db.collection('users').doc('u1'), {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // admin.firestore() is not a recognized Firestore root, so this detection
    // rests entirely on the name fallback.
    {
      code: `
const batch = admin.firestore().batch();
batch.set(docRef, {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // The name fallback still catches receivers with no resolvable origin.
    {
      code: `
export function apply(batch, ref) {
  batch.set(ref, {});
}
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // An admin batch imported as a shared singleton.
    {
      code: `
import { batch } from './batch-singleton';
batch.set(docRef, {});
`,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Renamed admin batch whose name also fails the doc/ref substring test.
    {
      code: `
const chunkWriter = db.batch();
chunkWriter.delete(db.collection('users').doc('u1'));
`,
      errors: [{ messageId: 'noDirectDelete' }],
    },
  ],
});
