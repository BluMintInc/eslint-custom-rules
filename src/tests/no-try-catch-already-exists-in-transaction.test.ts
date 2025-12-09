import { ruleTesterTs } from '../utils/ruleTester';
import { noTryCatchAlreadyExistsInTransaction } from '../rules/no-try-catch-already-exists-in-transaction';

ruleTesterTs.run(
  'no-try-catch-already-exists-in-transaction',
  noTryCatchAlreadyExistsInTransaction,
  {
    valid: [
      // Catching already-exists outside the transaction callback is allowed
      {
        code: `
        try {
          await db.runTransaction(async (transaction) => {
            await creator.createTransaction(transaction);
          });
        } catch (error) {
          if (error.code === 'already-exists') {
            await appendToExisting();
          }
        }
        `,
      },
      // Catching a different error code inside the transaction
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 'permission-denied') {
              throw new Error('no access');
            }
          }
        });
        `,
      },
      // Rethrowing inside transaction without checking already-exists
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            console.error(error);
            throw error;
          }
        });
        `,
      },
      // No try/catch inside transaction
      `
      await db.runTransaction(async (transaction) => {
        await creator.createTransaction(transaction);
      });
      `,
      // Destructured code check for other errors
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch ({ code }) {
            if (code === 'permission-denied') {
              throw new Error('no access');
            }
          }
        });
        `,
      },
      // runTransaction helper style (v9) without try/catch
      `
      import { runTransaction } from 'firebase/firestore';
      await runTransaction(db, async (transaction) => {
        await creator.createTransaction(transaction);
      });
      `,
      // Nested try/catch that handles different code only
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            try {
              await fallback();
            } catch (innerError) {
              if (innerError.code === 'permission-denied') {
                throw innerError;
              }
            }
          }
        });
        `,
      },
      // Arrow function with expression body (no try/catch possible)
      `
      await db.runTransaction(async (transaction) => creator.createTransaction(transaction));
      `,
      // Logging errors only
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            logger.warn(error);
          }
        });
        `,
      },
      // Manual pattern: try/catch outside transaction callback
      {
        code: `
        try {
          await db.runTransaction(async (transaction) => {
            await creator.createTransaction(transaction);
          });
        } catch (error) {
          if (error.code === 'already-exists') {
            await appendAdvancementToExisting();
          }
        }
        `,
      },
      // Try/catch inside transaction checking unrelated field
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.details === 'rate-limit') {
              throw error;
            }
          }
        });
        `,
      },
      // Dynamic comparison value that is not a literal
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const alreadyExists = getCodeFromConfig();
            if (error.code === alreadyExists) {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
      },
      // Compare different object than catch param
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const otherError = getOtherError();
            if (otherError.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
      },
      // Optional chaining with non-matching literal
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error?.code === 'permission-denied') {
              throw error;
            }
          }
        });
        `,
      },
      // Switch on error code but using a variable discriminant different from catch param
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            switch (externalError.code) {
              case 'already-exists':
                await appendAdvancementToExisting(transaction);
                break;
              default:
                throw error;
            }
          }
        });
        `,
      },
    ],
    invalid: [
      // Simple already-exists check in transaction
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Numeric code check
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 6) {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Combined OR check
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 6 || error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Destructured catch parameter
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch ({ code }) {
            if (code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Type assertion alias
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const errorWithCode = error as { code?: number | string };
            if (errorWithCode.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Optional chaining on error code
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error?.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Nested try/catch inside transaction
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            try {
              await creator.createTransaction(transaction);
            } catch (error) {
              if (error.code === 'already-exists') {
                await appendAdvancementToExisting(transaction);
              }
            }
          } catch (outerError) {
            throw outerError;
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // runTransaction helper style (v9) with already-exists catch
      {
        code: `
        import { runTransaction } from 'firebase/firestore';
        await runTransaction(db, async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Switch statement on error code
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
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
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Destructuring inside catch body
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const { code } = error as { code?: string };
            if (code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Loose equality with numeric string
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code == '6') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Switch statement on numeric code
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            switch (error.code) {
              case 6:
                await appendAdvancementToExisting(transaction);
                break;
              default:
                throw error;
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Assignment alias then compare
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const err = error;
            if (err.code === 'ALREADY_EXISTS') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Destructuring alias in catch body
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            const { code: aliasedCode } = error as { code?: string };
            if (aliasedCode === 'already-exists') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Optional chaining with numeric string literal
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error?.code == '6') {
              await appendAdvancementToExisting(transaction);
            }
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
    ],
  },
);
