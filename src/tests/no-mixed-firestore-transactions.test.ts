import { ruleTesterTs } from '../utils/ruleTester';
import { noMixedFirestoreTransactions } from '../rules/no-mixed-firestore-transactions';

ruleTesterTs.run('no-mixed-firestore-transactions', noMixedFirestoreTransactions, {
  valid: [
    // Valid: Using transaction-aware classes inside transaction
    {
      code: `
        await db.runTransaction(async (tx) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          txSetter.set(doc1);
          txSetter.set(doc2);
        });
      `,
    },
    // Valid: Using non-transactional classes outside transaction
    {
      code: `
        const setter = new DocSetter(ref);
        await setter.set(doc);
      `,
    },
    // Valid: Using transaction-aware classes in helper function
    {
      code: `
        async function updateUser(tx: FirebaseFirestore.Transaction) {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          txSetter.set(doc1);
        }

        await db.runTransaction(async (tx) => {
          await updateUser(tx);
        });
      `,
    },
    // Valid: Using non-Firestore classes inside transaction
    {
      code: `
        await db.runTransaction(async (tx) => {
          const logger = new Logger();
          logger.log("Transaction started");
        });
      `,
    },
    // Valid: Multiple transactions with correct usage
    {
      code: `
        await db.runTransaction(async (tx1) => {
          const txSetter1 = new DocSetterTransaction(ref, { transaction: tx1 });
          txSetter1.set(doc1);
        });

        await db.runTransaction(async (tx2) => {
          const txSetter2 = new DocSetterTransaction(ref, { transaction: tx2 });
          txSetter2.set(doc2);
        });
      `,
    },
  ],
  invalid: [
    // Invalid: Using DocSetter inside transaction
    {
      code: `
        await db.runTransaction(async (tx) => {
          const regularSetter = new DocSetter(ref);
          await regularSetter.set(doc);
        });
      `,
      errors: [{
        messageId: 'noMixedTransactions',
        data: {
          className: 'DocSetter',
          transactionalClass: 'DocSetterTransaction',
        },
      }],
    },
    // Invalid: Using FirestoreDocFetcher inside transaction
    {
      code: `
        await db.runTransaction(async (tx) => {
          const fetcher = new FirestoreDocFetcher(ref);
          await fetcher.fetch();
        });
      `,
      errors: [{
        messageId: 'noMixedTransactions',
        data: {
          className: 'FirestoreDocFetcher',
          transactionalClass: 'FirestoreDocFetcherTransaction',
        },
      }],
    },
    // Invalid: Using FirestoreFetcher inside transaction
    {
      code: `
        await db.runTransaction(async (tx) => {
          const fetcher = new FirestoreFetcher(ref);
          await fetcher.fetch();
        });
      `,
      errors: [{
        messageId: 'noMixedTransactions',
        data: {
          className: 'FirestoreFetcher',
          transactionalClass: 'FirestoreFetcherTransaction',
        },
      }],
    },
    // Invalid: Mixing transactional and non-transactional operations
    {
      code: `
        await db.runTransaction(async (tx) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          const regularSetter = new DocSetter(ref);

          txSetter.set(doc1);
          await regularSetter.set(doc2);
        });
      `,
      errors: [{
        messageId: 'noMixedTransactions',
        data: {
          className: 'DocSetter',
          transactionalClass: 'DocSetterTransaction',
        },
      }],
    },
  ],
});
