import { ruleTesterTs } from '../utils/ruleTester';
import { noTryCatchAlreadyExistsInTransaction } from '../rules/no-try-catch-already-exists-in-transaction';

ruleTesterTs.run(
  'no-try-catch-already-exists-in-transaction',
  noTryCatchAlreadyExistsInTransaction,
  {
    valid: [
      {
        code: `
        try {
          await db.runTransaction(async (transaction) => {
            await creator.createTransaction();
          });
        } catch (error) {
          const errorWithCode = error as { code?: string };
          if (errorWithCode.code === 'already-exists') {
            await appendOutside();
          }
        }
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            if (error.code === 'permission-denied') {
              throw new Error('unauthorized');
            }
            throw error;
          }
        });
        `,
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          await transaction.get(docRef);
          await transaction.set(docRef, { status: 'ok' });
        });
        `,
      },
      {
        code: `
        import { runTransaction, getFirestore } from 'firebase/firestore';

        await runTransaction(getFirestore(), async (transaction) => {
          try {
            await transaction.get(docRef);
          } catch (error) {
            if (error.code === 'not-found') {
              throw error;
            }
          }
        });
        `,
      },
      {
        code: `
        function handleAlreadyExists(error: { code?: string }) {
          if (error.code === 'already-exists') {
            // handled elsewhere, not inside a transaction
          }
        }

        await something();
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await doWork(transaction);
          } catch (error) {
            const code = error.code;
            if (code === 'resource-exhausted') {
              await logRateLimit();
            }
          }
        });
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await doWork(transaction);
          } catch (error) {
            if (isRetryable(error)) {
              return retry();
            }
            throw error;
          }
        });
        `,
      },
      {
        code: `
        const callback = async (transaction) => {
          await transaction.get(docRef);
        };

        await db.runTransaction(callback);
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await doWork(transaction);
          } catch (error) {
            switch (error.code) {
              case 'permission-denied':
                throw error;
              default:
                throw error;
            }
          }
        });
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          await doWork(transaction);
          const { code } = await readOutside();
          if (code === 'already-exists') {
            await handle();
          }
        });
        `,
      },
      {
        code: `
        function helper() {
          try {
            risky();
          } catch (error) {
            if (error.code === 'already-exists') {
              recover();
            }
          }
        }

        await db.runTransaction(async (transaction) => {
          await doWork(transaction);
          helper();
        });
        `,
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await doWork(transaction);
          } catch ({ code }) {
            if (code !== 'already-exists') {
              throw new Error('unexpected');
            }
            // no handling for already exists here
          }
        });
        `,
      },
    ],
    invalid: [
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            if (error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await transaction.set(docRef, { status: 'started' });
          } catch (error) {
            if (error.code === 6) {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            if (error.code === 'already-exists' || error.code === 6) {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch ({ code }) {
            if (code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            const errorWithCode = error as { code?: string | number };
            if (errorWithCode.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            const { code } = error as { code?: number };
            if (code == 6) {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            if (error?.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        import { runTransaction, getFirestore } from 'firebase/firestore';

        await runTransaction(getFirestore(), async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            switch (error.code) {
              case 'already-exists':
                await appendAdvancementToExisting(transaction);
                break;
              default:
                throw error;
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await transaction.get(docRef);
            try {
              await creator.createTransaction();
            } catch (error) {
              if (error.code === 'already-exists') {
                await appendAdvancementToExisting(transaction);
              }
            }
          } catch (error) {
            console.error(error);
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            const code = error.code;
            if (code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            if (error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
              return;
            }
            throw error;
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
      {
        code: `
        await firestore.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction();
          } catch (error) {
            const { code: errorCode } = error as { code?: string };
            if (errorCode === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'catchAlreadyExistsInTransaction' }],
      },
    ],
  },
);
