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
      // Valid: Direct Firestore methods (not transaction methods)
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          // This is a direct Firestore read, not a transaction read
          const snapshot = await docRef.get();

          return snapshot.data();
        });
        `,
      },
      // Valid: Non-transaction object with similar method names
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const docSnapshot = await transaction.get(docRef);

          // This is not a transaction method call
          const otherData = await someOtherObject.get(someRef);

          transaction.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Transaction methods in try/catch with proper order
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          try {
            const docSnapshot = await transaction.get(docRef);
            transaction.set(docRef, { status: 'processing' });
            return docSnapshot.data();
          } catch (error) {
            console.error(error);
            throw error;
          }
        });
        `,
      },
      // Valid: Switch statement with reads before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const docSnapshot = await transaction.get(docRef);

          switch (docSnapshot.data().type) {
            case 'typeA':
              transaction.set(docRef, { status: 'processedA' });
              break;
            case 'typeB':
              transaction.update(docRef, { status: 'processedB' });
              break;
            default:
              transaction.delete(docRef);
          }

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Nested transactions (different scopes)
      {
        code: `
        const outerResult = await firestore.runTransaction(async (outerTransaction) => {
          const outerSnapshot = await outerTransaction.get(docRef);

          const innerResult = await firestore.runTransaction(async (innerTransaction) => {
            innerTransaction.set(innerDocRef, { data: 'inner' });
            const innerSnapshot = await innerTransaction.get(innerDocRef2);
            return innerSnapshot.data();
          });

          outerTransaction.set(docRef, { status: 'outer' });

          return { outer: outerSnapshot.data(), inner: innerResult };
        });
        `,
      },
      // Valid: Complex async patterns with proper order
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshots = await Promise.allSettled([
            transaction.get(docRef1),
            transaction.get(docRef2),
            transaction.get(docRef3)
          ]);

          const validSnapshots = snapshots
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

          for (const snapshot of validSnapshots) {
            transaction.update(snapshot.ref, { processed: true });
          }

          return validSnapshots.map(s => s.data());
        });
        `,
      },
      // Valid: Arrow function with implicit return
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) =>
          transaction.get(docRef).then(snapshot => {
            transaction.set(docRef, { status: 'processing' });
            return snapshot.data();
          })
        );
        `,
      },
      // Valid: Destructured transaction parameter (should not be detected as transaction)
      {
        code: `
        const transactionResult = await firestore.runTransaction(async ({ get, set }) => {
          const docSnapshot = await get(docRef);
          set(docRef, { status: 'processing' });
          return docSnapshot.data();
        });
        `,
      },
      // Valid: Transaction parameter with different type annotation
      {
        code: `
        const transactionResult = await firestore.runTransaction(
          async (tx: Transaction) => {
            const docSnapshot = await tx.get(docRef);
            tx.set(docRef, { status: 'processing' });
            return docSnapshot.data();
          }
        );
        `,
      },
      // Valid: Transaction parameter with generic type
      {
        code: `
        const transactionResult = await firestore.runTransaction(
          async <T>(transaction: T) => {
            const docSnapshot = await transaction.get(docRef);
            transaction.set(docRef, { status: 'processing' });
            return docSnapshot.data();
          }
        );
        `,
      },
      // Valid: Reads in closure before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const readData = await (async () => {
            const snapshot1 = await transaction.get(docRef1);
            const snapshot2 = await transaction.get(docRef2);
            return { data1: snapshot1.data(), data2: snapshot2.data() };
          })();

          transaction.set(docRef1, { status: 'processed' });

          return readData;
        });
        `,
      },
      // Valid: Conditional reads all before writes
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          let snapshot1, snapshot2;

          if (condition1) {
            snapshot1 = await transaction.get(docRef1);
          }

          if (condition2) {
            snapshot2 = await transaction.get(docRef2);
          }

          // All writes after all possible reads
          if (snapshot1) {
            transaction.set(docRef1, { status: 'processed1' });
          }

          if (snapshot2) {
            transaction.set(docRef2, { status: 'processed2' });
          }

          return { data1: snapshot1?.data(), data2: snapshot2?.data() };
        });
        `,
      },
      // Valid: Reads in helper function called before writes
      {
        code: `
        async function getAllSnapshots(tx) {
          const snapshot1 = await tx.get(docRef1);
          const snapshot2 = await tx.get(docRef2);
          return [snapshot1, snapshot2];
        }

        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const snapshots = await getAllSnapshots(transaction);

          for (const snapshot of snapshots) {
            transaction.update(snapshot.ref, { processed: true });
          }

          return snapshots.map(s => s.data());
        });
        `,
      },
      // Valid: Complex nested loops with proper order
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const allSnapshots = [];

          // All reads first
          for (const category of categories) {
            for (const docRef of category.refs) {
              const snapshot = await transaction.get(docRef);
              allSnapshots.push(snapshot);
            }
          }

          // All writes after
          for (const snapshot of allSnapshots) {
            transaction.update(snapshot.ref, { processed: true });
          }

          return allSnapshots.map(s => s.data());
        });
        `,
      },
      // Valid: Modular SDK with different import pattern
      {
        code: `
        import { getFirestore } from 'firebase/firestore';
        import { runTransaction } from 'firebase/firestore';

        const db = getFirestore();
        const transactionResult = await runTransaction(db, async (transaction) => {
          const docSnapshot = await transaction.get(docRef);
          transaction.set(docRef, { status: 'processing' });
          return docSnapshot.data();
        });
        `,
      },
      // Valid: Transaction with computed property access (edge case)
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const methodName = 'get';
          const docSnapshot = await transaction[methodName](docRef);

          transaction.set(docRef, { status: 'processing' });

          return docSnapshot.data();
        });
        `,
      },
      // Valid: Transaction methods called through variable reference
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const tx = transaction;
          const docSnapshot = await tx.get(docRef);

          tx.set(docRef, { status: 'processing' });

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
      // Invalid: Read after write in try/catch block
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          try {
            transaction.set(docRef, { status: 'processing' });
            const docSnapshot = await transaction.get(otherDocRef);
            return docSnapshot.data();
          } catch (error) {
            console.error(error);
            throw error;
          }
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in catch block
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          try {
            transaction.set(docRef, { status: 'processing' });
            return { success: true };
          } catch (error) {
            const docSnapshot = await transaction.get(errorDocRef);
            return { error: docSnapshot.data() };
          }
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in switch statement
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          switch (type) {
            case 'typeA':
              const snapshotA = await transaction.get(docRefA);
              return snapshotA.data();
            case 'typeB':
              const snapshotB = await transaction.get(docRefB);
              return snapshotB.data();
            default:
              return null;
          }
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in nested loops
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          for (const category of categories) {
            for (const docRef of category.refs) {
              transaction.update(docRef, { processed: true });
            }

            // Read after writes in the inner loop
            const categorySnapshot = await transaction.get(category.ref);
            category.data = categorySnapshot.data();
          }

          return categories;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with Promise.all containing reads
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const [snapshot1, snapshot2] = await Promise.all([
            transaction.get(docRef1),
            transaction.get(docRef2)
          ]);

          return { data1: snapshot1.data(), data2: snapshot2.data() };
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in closure
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const readData = await (async () => {
            const snapshot = await transaction.get(otherDocRef);
            return snapshot.data();
          })();

          return readData;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with different transaction variable name
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (t) => {
          t.update(docRef, { count: 1 });

          const snapshot = await t.get(otherDocRef);

          return snapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write through variable reference
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          const tx = transaction;
          tx.set(docRef, { status: 'processing' });

          const snapshot = await tx.get(otherDocRef);

          return snapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in helper function with complex flow
      {
        code: `
        async function complexOperation(tx, shouldRead) {
          tx.set(docRef, { status: 'processing' });

          if (shouldRead) {
            const snapshot = await tx.get(otherDocRef);
            return snapshot.data();
          }

          return null;
        }

        const transactionResult = await firestore.runTransaction(async (transaction) => {
          return await complexOperation(transaction, true);
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in async generator pattern
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const results = [];
          for await (const ref of asyncDocRefs) {
            const snapshot = await transaction.get(ref);
            results.push(snapshot.data());
          }

          return results;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in ternary operation
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const snapshot = condition
            ? await transaction.get(docRef1)
            : await transaction.get(docRef2);

          return snapshot.data();
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write with logical operators
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const snapshot = (await transaction.get(docRef1)) || (await transaction.get(docRef2));

          return snapshot.data();
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in finally block
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          try {
            transaction.set(docRef, { status: 'processing' });
            return { success: true };
          } finally {
            const snapshot = await transaction.get(logDocRef);
            console.log('Log:', snapshot.data());
          }
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with array destructuring
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const [snapshot1, snapshot2] = await Promise.all([
            transaction.get(docRef1),
            transaction.get(docRef2)
          ]);

          return [snapshot1.data(), snapshot2.data()];
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write in object destructuring
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const { snapshot1, snapshot2 } = {
            snapshot1: await transaction.get(docRef1),
            snapshot2: await transaction.get(docRef2)
          };

          return { data1: snapshot1.data(), data2: snapshot2.data() };
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write with method chaining
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const data = await transaction.get(otherDocRef)
            .then(snapshot => snapshot.data())
            .then(data => ({ ...data, processed: true }));

          return data;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in nested function expression
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const result = await (function() {
            return transaction.get(otherDocRef);
          })();

          return result.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with setTimeout (async timing)
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          await new Promise(resolve => setTimeout(resolve, 100));

          const snapshot = await transaction.get(otherDocRef);

          return snapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in while loop
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          let i = 0;
          const snapshots = [];
          while (i < docRefs.length) {
            const snapshot = await transaction.get(docRefs[i]);
            snapshots.push(snapshot);
            i++;
          }

          return snapshots.map(s => s.data());
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in do-while loop
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          let i = 0;
          const snapshots = [];
          do {
            const snapshot = await transaction.get(docRefs[i]);
            snapshots.push(snapshot);
            i++;
          } while (i < docRefs.length);

          return snapshots.map(s => s.data());
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with complex conditional logic
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          let snapshot;
          if (condition1) {
            if (condition2) {
              snapshot = await transaction.get(docRef1);
            } else {
              snapshot = await transaction.get(docRef2);
            }
          } else {
            snapshot = await transaction.get(docRef3);
          }

          return snapshot.data();
        });
        `,
        errors: [
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
          { messageId: 'readsAfterWrites' },
        ],
      },
      // Invalid: Read after write with async/await in map
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const snapshots = await Promise.all(
            docRefs.map(async (ref) => {
              return await transaction.get(ref);
            })
          );

          return snapshots.map(s => s.data());
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write in reduce operation
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const result = await docRefs.reduce(async (accPromise, ref) => {
            const acc = await accPromise;
            const snapshot = await transaction.get(ref);
            acc.push(snapshot.data());
            return acc;
          }, Promise.resolve([]));

          return result;
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
      // Invalid: Read after write with computed property access
      {
        code: `
        const transactionResult = await firestore.runTransaction(async (transaction) => {
          transaction.set(docRef, { status: 'processing' });

          const methodName = 'get';
          const snapshot = await transaction[methodName](otherDocRef);

          return snapshot.data();
        });
        `,
        errors: [{ messageId: 'readsAfterWrites' }],
      },
    ],
  }
);
