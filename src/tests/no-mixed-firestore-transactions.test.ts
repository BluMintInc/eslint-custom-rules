import { ruleTesterTs } from '../utils/ruleTester';
import { noMixedFirestoreTransactions } from '../rules/no-mixed-firestore-transactions';

const messageTemplate =
  'Non-transactional Firestore helper "{{ className }}" is instantiated inside a transaction callback, so its reads and writes bypass the transaction context. That breaks Firestore\'s atomicity guarantees and can commit partial updates. Use the transaction-safe "{{ transactionalClass }}" and pass the provided transaction so every operation participates in the same commit.';

describe('no-mixed-firestore-transactions messages', () => {
  it('explains why transaction-safe helpers are required', () => {
    expect(
      noMixedFirestoreTransactions.meta.messages.noMixedTransactions,
    ).toBe(messageTemplate);
  });
});

ruleTesterTs.run(
  'no-mixed-firestore-transactions',
  noMixedFirestoreTransactions,
  {
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
      // Valid: Nested transactions with correct usage
      {
        code: `
        await db.runTransaction(async (outerTx) => {
          const outerSetter = new DocSetterTransaction(ref, { transaction: outerTx });
          await outerSetter.set(doc1);

          await db.runTransaction(async (innerTx) => {
            const innerSetter = new DocSetterTransaction(ref, { transaction: innerTx });
            await innerSetter.set(doc2);
          });
        });
      `,
      },
      // Valid: Transaction with try-catch using transaction-aware classes
      {
        code: `
        await db.runTransaction(async (tx) => {
          try {
            const txSetter = new DocSetterTransaction(ref, { transaction: tx });
            await txSetter.set(doc);
          } catch (error) {
            const errorHandler = new DocSetterTransaction(ref, { transaction: tx });
            await errorHandler.set(errorDoc);
          }
        });
      `,
      },
      // Valid: Transaction with array methods using transaction-aware classes
      {
        code: `
        await db.runTransaction(async (tx) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          await Promise.all(docs.map(async (doc) => {
            await txSetter.set(doc);
          }));
        });
      `,
      },
      // Valid: Transaction with object methods
      {
        code: `
        const obj = {
          async process(tx: FirebaseFirestore.Transaction) {
            const txSetter = new DocSetterTransaction(ref, { transaction: tx });
            await txSetter.set(doc);
          }
        };
        await db.runTransaction(async (tx) => {
          await obj.process(tx);
        });
      `,
      },
      // Valid: Transaction with destructured parameters
      {
        code: `
        await db.runTransaction(async ({ _firestore }) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: _firestore });
          await txSetter.set(doc);
        });
      `,
      },
      // Valid: Transaction with IIFE
      {
        code: `
        await db.runTransaction(async (tx) => {
          await (async () => {
            const txSetter = new DocSetterTransaction(ref, { transaction: tx });
            await txSetter.set(doc);
          })();
        });
      `,
      },
      // Valid: Transaction in class method
      {
        code: `
        class TransactionManager {
          async execute() {
            await db.runTransaction(async (tx) => {
              const txSetter = new DocSetterTransaction(ref, { transaction: tx });
              await txSetter.set(doc);
            });
          }
        }
      `,
      },
      // Valid: Transaction with promise chains
      {
        code: `
        await db.runTransaction(async (tx) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          return txSetter.set(doc1)
            .then(() => txSetter.set(doc2))
            .then(() => txSetter.set(doc3));
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
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Using FirestoreDocFetcher inside transaction
      {
        code: `
        await db.runTransaction(async (tx) => {
          const fetcher = new FirestoreDocFetcher(ref);
          await fetcher.fetch();
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'FirestoreDocFetcher',
              transactionalClass: 'FirestoreDocFetcherTransaction',
            },
          },
        ],
      },
      // Invalid: Using FirestoreFetcher inside transaction
      {
        code: `
        await db.runTransaction(async (tx) => {
          const fetcher = new FirestoreFetcher(ref);
          await fetcher.fetch();
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'FirestoreFetcher',
              transactionalClass: 'FirestoreFetcherTransaction',
            },
          },
        ],
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
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Multiple non-transactional classes in the same transaction
      {
        code: `
        await db.runTransaction(async (tx) => {
          const setter = new DocSetter(ref);
          const fetcher = new FirestoreDocFetcher(ref);
          const listFetcher = new FirestoreFetcher(ref);

          await setter.set(doc);
          await fetcher.fetch();
          await listFetcher.fetch();
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'FirestoreDocFetcher',
              transactionalClass: 'FirestoreDocFetcherTransaction',
            },
          },
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'FirestoreFetcher',
              transactionalClass: 'FirestoreFetcherTransaction',
            },
          },
        ],
      },
      // Invalid: Conditional instantiation of non-transactional class
      {
        code: `
        await db.runTransaction(async (tx) => {
          const txSetter = new DocSetterTransaction(ref, { transaction: tx });
          if (condition) {
            const regularSetter = new DocSetter(ref);
            await regularSetter.set(doc);
          }
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Non-transactional class in try-catch
      {
        code: `
        await db.runTransaction(async (tx) => {
          try {
            const regularSetter = new DocSetter(ref);
            await regularSetter.set(doc);
          } catch (error) {
            const errorHandler = new FirestoreDocFetcher(ref);
            await errorHandler.fetch();
          }
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'FirestoreDocFetcher',
              transactionalClass: 'FirestoreDocFetcherTransaction',
            },
          },
        ],
      },
      // Invalid: Non-transactional class in array method callback
      {
        code: `
        await db.runTransaction(async (tx) => {
          await Promise.all(docs.map(async (doc) => {
            const regularSetter = new DocSetter(ref);
            await regularSetter.set(doc);
          }));
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Non-transactional class in object method
      {
        code: `
        const obj = {
          async process(tx: FirebaseFirestore.Transaction) {
            const regularSetter = new DocSetter(ref);
            await regularSetter.set(doc);
          }
        };
        await db.runTransaction(async (tx) => {
          await obj.process(tx);
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Non-transactional class in IIFE
      {
        code: `
        await db.runTransaction(async (tx) => {
          await (async () => {
            const regularSetter = new DocSetter(ref);
            await regularSetter.set(doc);
          })();
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
      // Invalid: Non-transactional class in promise chain
      {
        code: `
        await db.runTransaction(async (tx) => {
          const regularSetter = new DocSetter(ref);
          return regularSetter.set(doc1)
            .then(() => regularSetter.set(doc2))
            .then(() => regularSetter.set(doc3));
        });
      `,
        errors: [
          {
            messageId: 'noMixedTransactions',
            data: {
              className: 'DocSetter',
              transactionalClass: 'DocSetterTransaction',
            },
          },
        ],
      },
    ],
  },
);
