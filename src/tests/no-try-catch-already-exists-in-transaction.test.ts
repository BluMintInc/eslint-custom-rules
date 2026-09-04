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
      // Inequality guard should not trigger
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code !== 'already-exists') {
              throw error;
            }
          }
        });
        `,
      },
      // Loose inequality guard should not trigger
      {
        code: `
        await db.runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code != 6) {
              throw error;
            }
          }
        });
        `,
      },
      // Realtime Database runTransaction: ALREADY_EXISTS is not part of its
      // error model and the suggested remedy has no RTDB analog
      {
        code: `
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
        `,
      },
      // Same shape under a different callee name stays silent
      {
        code: `
        import { runInBatch } from 'somewhere';
        await runInBatch(dbRef, (d) => {
          try {
            return d + 1;
          } catch (error) {
            if (error.code === 6) {
              return d;
            }
            throw error;
          }
        });
        `,
      },
      // Realtime Database import reached from a nested scope
      {
        code: `
        import { runTransaction } from 'firebase/database';
        export async function bumpCounter(dbRef) {
          return runTransaction(dbRef, (currentData) => {
            try {
              return currentData + 1;
            } catch (error) {
              if (error.code === 'already-exists') {
                return currentData;
              }
              throw error;
            }
          });
        }
        `,
      },
      // Realtime Database export aliased to the matched name still resolves to
      // its module, so the import trace decides rather than the spelling
      {
        code: `
        import { transaction as runTransaction } from 'firebase/database';
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
        `,
      },
      // Aliasing the Realtime Database import away from the matched name
      {
        code: `
        import { runTransaction as runRtdbTransaction } from 'firebase/database';
        await runRtdbTransaction(dbRef, (currentData) => {
          try {
            return currentData + 1;
          } catch (error) {
            if (error.code === 'already-exists') {
              return currentData;
            }
            throw error;
          }
        });
        `,
      },
      // Realtime Database namespace import used as the receiver
      {
        code: `
        import * as database from 'firebase/database';
        await database.runTransaction(dbRef, (currentData) => {
          try {
            return currentData + 1;
          } catch (error) {
            if (error.code === 'already-exists') {
              return currentData;
            }
            throw error;
          }
        });
        `,
      },
      // Realtime Database default import used as the receiver
      {
        code: `
        import rtdb from 'firebase/database';
        await rtdb.runTransaction(dbRef, (currentData) => {
          try {
            return currentData + 1;
          } catch (error) {
            if (error.code === 6) {
              return currentData;
            }
            throw error;
          }
        });
        `,
      },
      // Admin SDK Realtime Database surface
      {
        code: `
        import { runTransaction } from 'firebase-admin/database';
        await runTransaction(dbRef, (currentData) => {
          try {
            return currentData + 1;
          } catch (error) {
            if (error.code === 'ALREADY_EXISTS') {
              return currentData;
            }
            throw error;
          }
        });
        `,
      },
      // Scoped Realtime Database package
      {
        code: `
        import { runTransaction } from '@firebase/database';
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
        `,
      },
      // Pinned Realtime Database specifier: the version suffix does not make
      // the source unrecognizable
      {
        code: `
        import { runTransaction } from 'firebase@10.1.0/database';
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
        `,
      },
      // An unrelated package that exports the same name
      {
        code: `
        import { runTransaction } from 'some-orm/client';
        await runTransaction(session, (tx) => {
          try {
            return tx.insert(row);
          } catch (error) {
            if (error.code === 'already-exists') {
              return null;
            }
            throw error;
          }
        });
        `,
      },
      // Optional call on a Realtime Database namespace import
      {
        code: `
        import * as database from 'firebase/database';
        await database?.runTransaction(dbRef, (currentData) => {
          try {
            return currentData + 1;
          } catch (error) {
            if (error.code === 6) {
              return currentData;
            }
            throw error;
          }
        });
        `,
      },
      // A published package that is not a Firestore surface still refutes
      // provenance, so widening first-party paths to "unknown" must not widen
      // this to a report as well.
      {
        code: `
        import { runTransaction } from 'knex';
        await runTransaction(async (transaction) => {
          try {
            await creator.createTransaction(transaction);
          } catch (error) {
            if (error.code === 'already-exists') {
              await appendAdvancementToExisting(transaction);
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
      // Firestore modular runTransaction with a numeric already-exists check
      {
        code: `
        import { runTransaction } from 'firebase/firestore';
        await runTransaction(db, async (tx) => {
          try {
            tx.create(ref, {});
          } catch (error) {
            if (error.code === 6) {
              return;
            }
            throw error;
          }
        });
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Admin SDK Firestore surface
      {
        code: `
        import { runTransaction } from 'firebase-admin/firestore';
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
      // Server SDK Firestore surface
      {
        code: `
        import { runTransaction } from '@google-cloud/firestore';
        await runTransaction(db, async (transaction) => {
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
      // Firestore compat build
      {
        code: `
        import { runTransaction } from '@firebase/firestore-compat';
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
      // Firestore deep entry point
      {
        code: `
        import { runTransaction } from 'firebase/firestore/lite';
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
      // Pinned Firestore specifier
      {
        code: `
        import { runTransaction } from 'firebase@10.1.0/firestore';
        await runTransaction(db, async (transaction) => {
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
      // Firestore export aliased to the matched name
      {
        code: `
        import { legacyRunTransaction as runTransaction } from 'firebase/firestore';
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
      // Firestore namespace import used as the receiver
      {
        code: `
        import * as firestore from 'firebase/firestore';
        await firestore.runTransaction(db, async (transaction) => {
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
      // Firestore default import used as the receiver
      {
        code: `
        import firestore from 'firebase-admin/firestore';
        await firestore.runTransaction(db, async (transaction) => {
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
      // Bare call with no import: an untraceable binding keeps the report
      {
        code: `
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
      // A receiver re-exported from the project's own tree cannot refute Firestore
      {
        code: `
        import { db } from '../../config/firebaseAdmin';
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
      // A relative barrel re-exporting runTransaction keeps the report
      {
        code: `
        import { runTransaction } from './firebase';
        await runTransaction(async (transaction) => {
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
      // A path alias resolves into first-party code, so provenance stays unknown
      {
        code: `
        import { runTransaction } from '@/lib/firestore';
        await runTransaction(async (transaction) => {
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
      // A source-root alias is an alias, not a package named src
      {
        code: `
        import { db } from 'src/config/firebaseAdmin';
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
      // An absolute specifier is not a package specifier
      {
        code: `
        import { runTransaction } from '/lib/firestore';
        await runTransaction(async (transaction) => {
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
      // A locally declared runTransaction is not an import, so the report stands
      {
        code: `
        export function runTransaction(db, updateFunction) {
          return updateFunction(db);
        }
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
      // A local binding shadowing the Realtime Database import resolves to the
      // shadow, which carries no module provenance
      {
        code: `
        import { runTransaction } from 'firebase/database';
        export async function createOnce(db) {
          const runTransaction = (target, updateFunction) => updateFunction(target);
          return runTransaction(db, async (transaction) => {
            try {
              await creator.createTransaction(transaction);
            } catch (error) {
              if (error.code === 'already-exists') {
                await appendAdvancementToExisting(transaction);
              }
            }
          });
        }
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // A parameter shadowing the Realtime Database import
      {
        code: `
        import { runTransaction } from 'firebase/database';
        export async function createRecord(db, runTransaction) {
          return runTransaction(db, async (transaction) => {
            try {
              await creator.createTransaction(transaction);
            } catch (error) {
              if (error.code === 6) {
                await appendAdvancementToExisting(transaction);
              }
            }
          });
        }
        `,
        errors: [{ messageId: 'noAlreadyExistsCatchInTransaction' }],
      },
      // Optional call on a Firestore namespace import
      {
        code: `
        import * as firestore from 'firebase/firestore';
        await firestore?.runTransaction(db, async (transaction) => {
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
      // Non-null assertion on an unresolvable receiver
      {
        code: `
        await db!.runTransaction(async (transaction) => {
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
      // Receiver produced by a call carries no binding to trace
      {
        code: `
        import * as admin from 'firebase-admin';
        await admin.firestore().runTransaction(async (transaction) => {
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
    ],
  },
);
