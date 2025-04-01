import { ruleTesterTs } from '../utils/ruleTester';
import { firestoreTransactionReadsBeforeWrites } from '../rules/firestore-transaction-reads-before-writes';

ruleTesterTs.run(
  'firestore-transaction-reads-before-writes',
  firestoreTransactionReadsBeforeWrites,
  {
    valid: [
      // Valid: All reads before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          // All read operations performed first
          const docSnapshot = await transaction.get(docRef);
          const additionalSnapshot = await transaction.get(anotherDocRef);

          // All write operations performed after all reads
          transaction.set(docRef, { status: 'processing' });
          transaction.update(otherDocRef, { lastUpdated: Date.now() });

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Only read operations
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const docSnapshot = await transaction.get(docRef);
          const additionalSnapshot = await transaction.get(anotherDocRef);

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Only write operations
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });
          transaction.update(otherDocRef, { lastUpdated: Date.now() });

          return true;
        });
        `,
      },
      // Valid: Reads in helper function before writes
      {
        code: `
        async function readDocuments(tx) {
          const docSnapshot = await tx.get(docRef);
          return docSnapshot;
        }

        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshot = await readDocuments(transaction);

          transaction.set(docRef, { status: 'processing' });

          return snapshot.data();
        });
        `,
      },
      // Valid: Reads in conditional branches before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          let snapshot;

          if (condition) {
            snapshot = await transaction.get(docRef);
          } else {
            snapshot = await transaction.get(otherDocRef);
          }

          transaction.set(docRef, { status: 'processing' });

          return snapshot.data();
        });
        `,
      },
      // Valid: Reads in loops before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshots = [];

          for (const ref of docRefs) {
            const snapshot = await transaction.get(ref);
            snapshots.push(snapshot);
          }

          transaction.set(docRef, { status: 'processing' });

          return snapshots;
        });
        `,
      },
      // Valid: Reads with promise.all before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshots = await Promise.all(
            docRefs.map(ref => transaction.get(ref))
          );

          transaction.set(docRef, { status: 'processing' });

          return snapshots;
        });
        `,
      },
      // Valid: Different transaction parameter name
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (tx) => {
          const docSnapshot = await tx.get(docRef);

          tx.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Transaction with type annotation
      {
        code: `
        const transactionResult = await firestore.runTransaction(
          async (transaction: FirebaseFirestore.Transaction) => {
            const docSnapshot = await transaction.get(docRef);

            transaction.set(docRef, { status: 'processing' });

            return docSnapshot.data();
          }
        );
        `,
      },
      // Valid: Transaction in helper function with type annotation
      {
        code: `
        async function processTransaction(tx: FirebaseFirestore.Transaction) {
          const docSnapshot = await tx.get(docRef);

          tx.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        }

        const transactionResult = await firestore.runTransaction(processTransaction);
        `,
      },
      // Valid: Admin SDK transaction
      {
        code: `
        const transactionResult = await admin.firestore().runTransaction(async (transaction) => {
          const docSnapshot = await transaction.get(docRef);

          transaction.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        });
        `,
      },
      // Valid: v9 SDK transaction
      {
        code: `
        import { runTransaction, getFirestore } from 'firebase/firestore';

        const transactionResult = await runTransaction(getFirestore(), async (transaction) => {
          const docSnapshot = await transaction.get(docRef);

          transaction.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        });
        `,
      },
    ],
    invalid: [
      // Invalid: Read after write
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          // Write operation before read
          transaction.set(docRef, { status: 'processing' });

          // Read operation AFTER a write (problematic)
          const docSnapshot = await transaction.get(otherDocRef);

          return docSnapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Multiple reads after writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const docSnapshot1 = await transaction.get(otherDocRef1);
          const docSnapshot2 = await transaction.get(otherDocRef2);

          return { data1: docSnapshot1.data(), data2: docSnapshot2.data() };
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in conditional branch
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          let snapshot;
          if (condition) {
            snapshot = await transaction.get(otherDocRef1);
          } else {
            snapshot = await transaction.get(otherDocRef2);
          }

          return snapshot.data();
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in helper function
      {
        code: `
        async function readAfterWrite(tx) {
          tx.set(docRef, { status: 'processing' });
          const snapshot = await tx.get(otherDocRef);
          return snapshot;
        }

        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshot = await readAfterWrite(transaction);
          return snapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in loop
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const snapshots = [];
          for (const ref of docRefs) {
            const snapshot = await transaction.get(ref);
            snapshots.push(snapshot);
          }

          return snapshots;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with promise.all
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const snapshots = await Promise.all(
            docRefs.map(ref => transaction.get(ref))
          );

          return snapshots;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with different transaction parameter name
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (tx) => {
          tx.set(docRef, { status: 'processing' });

          const docSnapshot = await tx.get(otherDocRef);

          return docSnapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with type annotation
      {
        code: `
        const transactionResult = await firestore.runTransaction(
          async (transaction: FirebaseFirestore.Transaction) => {
            transaction.set(docRef, { status: 'processing' });

            const docSnapshot = await transaction.get(otherDocRef);

            return docSnapshot.data();
          }
        );
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in Admin SDK transaction
      {
        code: `
        const transactionResult = await admin.firestore().runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const docSnapshot = await transaction.get(otherDocRef);

          return docSnapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in v9 SDK transaction
      {
        code: `
        import { runTransaction, getFirestore } from 'firebase/firestore';

        const transactionResult = await runTransaction(getFirestore(), async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const docSnapshot = await transaction.get(otherDocRef);

          return docSnapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after multiple writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef1, { status: 'processing' });
          transaction.update(docRef2, { count: 1 });
          transaction.delete(docRef3);

          const docSnapshot = await transaction.get(otherDocRef);

          return docSnapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Interleaved reads and writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshot1 = await transaction.get(docRef1);
          transaction.set(docRef1, { status: 'processing' });

          const snapshot2 = await transaction.get(docRef2);

          return { data1: snapshot1.data(), data2: snapshot2.data() };
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
    ],
  }
);
