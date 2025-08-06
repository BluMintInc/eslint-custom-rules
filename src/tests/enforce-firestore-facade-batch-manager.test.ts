import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run(
  'enforce-firestore-facade-batch-manager',
  enforceFirestoreFacade,
  {
    valid: [
      // Valid BatchManager.set() usage - should not trigger the rule
      {
        code: `
        export const setPendingChannelMembership = async ({
          userIds,
          channelId,
        }: SetPendingChannelMemershipProps) => {
          const batchManager = new BatchManager<ChannelMembership>();

          for (const userId of userIds) {
            const ref = db.doc(
              toChannelMembershipPath(userId),
            ) as DocumentReference<ChannelMembership>;

            // We must await each operation as BatchManager may commit internally
            await batchManager.set({
              ref,
              data: {
                id: CHANNEL_MEMBERSHIP_ID,
                channelsPending: FieldValue.arrayUnion(channelId),
              },
            });
          }

          await batchManager.commit();
        };
      `,
      },
      // Another valid BatchManager usage with different method name
      {
        code: `
        const customBatchManager = new BatchManager();
        await customBatchManager.set({ ref: docRef, data: { field: 'value' } });
      `,
      },

      // Edge Case 1: BatchManager with variable name that doesn't contain "Manager"
      {
        code: `
        const batch = new BatchManager<UserDocument>();
        await batch.set({ ref: docRef, data: { name: 'John' } });
        await batch.update({ ref: docRef, data: { age: 30 } });
        await batch.delete(docRef);
        await batch.commit();
      `,
      },

      // Edge Case 2: BatchManager with very short variable name
      {
        code: `
        const bm = new BatchManager();
        bm.delete(doc.ref);
        await bm.commit();
      `,
      },

      // Edge Case 3: BatchManager with generic variable name
      {
        code: `
        const writer = new BatchManager<UserDocument>();
        writer.set({ ref: docRef, data: { name: 'John' } });
        writer.delete(oldDocRef);
        await writer.commit();
      `,
      },

      // Edge Case 4: BatchManager with confusing variable name containing "doc"
      {
        code: `
        const docProcessor = new BatchManager<UserDocument>();
        await docProcessor.set({ ref: docRef, data: { name: 'John' } });
        await docProcessor.update({ ref: docRef, data: { age: 30 } });
        await docProcessor.delete(docRef);
      `,
      },

      // Edge Case 5: BatchManager with confusing variable name containing "ref"
      {
        code: `
        const refHandler = new BatchManager<UserDocument>();
        await refHandler.set({ ref: docRef, data: { name: 'John' } });
        await refHandler.delete(docRef);
      `,
      },

      // Edge Case 6: BatchManager reassignment
      {
        code: `
        let processor;
        processor = new BatchManager<UserDocument>();
        processor.delete(docRef);
        await processor.commit();
      `,
      },

      // Edge Case 7: BatchManager conditional assignment
      {
        code: `
        const manager = condition ? new BatchManager<UserDocument>() : new BatchManager<OrderDocument>();
        if (manager) {
          await manager.set({ ref: docRef, data: { name: 'John' } });
        }
      `,
      },

      // Edge Case 8: BatchManager from function return
      {
        code: `
        function createBatchManager() {
          return new BatchManager<UserDocument>();
        }
        const manager = createBatchManager();
        await manager.set({ ref: docRef, data: { name: 'John' } });
        await manager.delete(docRef);
      `,
      },

      // Edge Case 9: BatchManager accessed through object property
      {
        code: `
        const service = { batchManager: new BatchManager<UserDocument>() };
        await service.batchManager.set({ ref: docRef, data: { name: 'John' } });
        await service.batchManager.delete(docRef);
      `,
      },

      // Edge Case 10: BatchManager in array
      {
        code: `
        const managers = [new BatchManager<UserDocument>()];
        await managers[0].set({ ref: docRef, data: { name: 'John' } });
        await managers[0].delete(docRef);
      `,
      },

      // Edge Case 11: BatchManager with complex property access
      {
        code: `
        const config = {
          database: {
            batchManager: new BatchManager<UserDocument>()
          }
        };
        await config.database.batchManager.set({ ref: docRef, data: { name: 'John' } });
        await config.database.batchManager.delete(docRef);
      `,
      },

      // Edge Case 12: BatchManager with type assertion
      {
        code: `
        const manager = new BatchManager<UserDocument>() as any;
        await manager.set({ ref: docRef, data: { name: 'John' } });
        await manager.delete(docRef);
      `,
      },

      // Edge Case 13: BatchManager with method chaining
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        await batchManager.set({ ref: docRef, data: { name: 'John' } }).then(() => console.log('done'));
      `,
      },

      // Edge Case 14: Multiple BatchManager instances with different names
      {
        code: `
        const userBatch = new BatchManager<UserDocument>();
        const orderBatch = new BatchManager<OrderDocument>();
        const processor = new BatchManager<LogDocument>();

        await userBatch.set({ ref: userRef, data: { name: 'John' } });
        await orderBatch.set({ ref: orderRef, data: { total: 100 } });
        await processor.delete(logRef);

        await Promise.all([
          userBatch.commit(),
          orderBatch.commit(),
          processor.commit()
        ]);
      `,
      },

      // Edge Case 15: BatchManager with destructuring assignment
      {
        code: `
        const { batchManager } = { batchManager: new BatchManager<UserDocument>() };
        await batchManager.set({ ref: docRef, data: { name: 'John' } });
        await batchManager.delete(docRef);
      `,
      },

      // Edge Case 16: BatchManager in try-catch block
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        try {
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
          await batchManager.delete(oldRef);
          await batchManager.commit();
        } catch (error) {
          console.error('Batch operation failed:', error);
        }
      `,
      },

      // Edge Case 17: BatchManager in conditional block
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        if (shouldUpdate) {
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
        } else {
          await batchManager.delete(docRef);
        }
        await batchManager.commit();
      `,
      },

      // Edge Case 18: BatchManager with all methods
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        await batchManager.set({ ref: docRef1, data: { name: 'John' } });
        await batchManager.update({ ref: docRef2, data: { age: 30 } });
        await batchManager.delete(docRef3);
        await batchManager.commit();
      `,
      },

      // Edge Case 19: BatchManager with Promise.all
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        await Promise.all([
          batchManager.set({ ref: docRef1, data: { name: 'John' } }),
          batchManager.update({ ref: docRef2, data: { age: 30 } }),
          batchManager.delete(docRef3)
        ]);
        await batchManager.commit();
      `,
      },

      // Edge Case 20: BatchManager with async function
      {
        code: `
        async function processBatch() {
          const batchManager = new BatchManager<UserDocument>();
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
          await batchManager.delete(oldRef);
          return batchManager.commit();
        }
        await processBatch();
      `,
      },

      // Edge Case 21: BatchManager with arrow function
      {
        code: `
        const processBatch = async () => {
          const batchManager = new BatchManager<UserDocument>();
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
          await batchManager.delete(oldRef);
          return batchManager.commit();
        };
        await processBatch();
      `,
      },

      // Edge Case 22: BatchManager with class method
      {
        code: `
        class DataProcessor {
          async processBatch() {
            const batchManager = new BatchManager<UserDocument>();
            await batchManager.set({ ref: this.docRef, data: { name: 'John' } });
            await batchManager.delete(this.oldRef);
            return batchManager.commit();
          }
        }
      `,
      },

      // Edge Case 23: BatchManager with nested scopes
      {
        code: `
        function outerFunction() {
          const batchManager = new BatchManager<UserDocument>();

          function innerFunction() {
            return batchManager.set({ ref: docRef, data: { name: 'John' } });
          }

          return async () => {
            await innerFunction();
            await batchManager.delete(oldRef);
            return batchManager.commit();
          };
        }
      `,
      },

      // Edge Case 24: BatchManager with variable shadowing
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();

        function processData() {
          const batchManager = new BatchManager<OrderDocument>();
          return batchManager.set({ ref: orderRef, data: { total: 100 } });
        }

        await batchManager.set({ ref: userRef, data: { name: 'John' } });
        await processData();
      `,
      },

      // Edge Case 25: BatchManager with complex initialization
      {
        code: `
        const batchManager = new (class extends BatchManager<UserDocument> {})();
        await batchManager.set({ ref: docRef, data: { name: 'John' } });
        await batchManager.delete(oldRef);
      `,
      },
    ],
    invalid: [
      // This should still be invalid - direct DocumentReference.set() call
      {
        code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' });
      `,
        errors: [{ messageId: 'noDirectSet' }],
      },

      // Invalid: DocumentReference with misleading variable name "batchManager"
      {
        code: `
        const batchManager = db.collection('users').doc('user123');
        await batchManager.set({ name: 'John' });
      `,
        errors: [{ messageId: 'noDirectSet' }],
      },

      // Invalid: DocumentReference with misleading variable name "manager"
      {
        code: `
        const manager = db.collection('users').doc('user123');
        await manager.delete();
      `,
        errors: [{ messageId: 'noDirectDelete' }],
      },

      // Invalid: DocumentReference with misleading variable name "processor"
      {
        code: `
        const processor = db.collection('users').doc('user123');
        await processor.update({ age: 30 });
      `,
        errors: [{ messageId: 'noDirectUpdate' }],
      },

      // Invalid: Mixed valid BatchManager and invalid DocumentReference usage
      {
        code: `
        const validBatchManager = new BatchManager<UserDocument>();
        const invalidDocRef = db.collection('users').doc('user123');

        await validBatchManager.set({ ref: docRef, data: { name: 'John' } }); // Valid
        await invalidDocRef.set({ name: 'Jane' }); // Invalid
      `,
        errors: [{ messageId: 'noDirectSet' }],
      },

      // Invalid: DocumentReference operations should still be caught even with BatchManager present
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        const docRef = db.collection('users').doc('user123');

        await batchManager.set({ ref: someRef, data: { name: 'John' } }); // Valid
        await docRef.get(); // Invalid
        await docRef.update({ age: 30 }); // Invalid
        await docRef.delete(); // Invalid
      `,
        errors: [
          { messageId: 'noDirectGet' },
          { messageId: 'noDirectUpdate' },
          { messageId: 'noDirectDelete' }
        ],
      },

      // Invalid: Batch operations should still be caught
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();
        const batch = db.batch();

        await batchManager.set({ ref: docRef, data: { name: 'John' } }); // Valid
        batch.set(docRef, { name: 'Jane' }); // Invalid
        await batch.commit();
      `,
        errors: [{ messageId: 'noDirectSet' }],
      },

      // Invalid: Transaction operations should still be caught
      {
        code: `
        const batchManager = new BatchManager<UserDocument>();

        await db.runTransaction(async (transaction) => {
          await batchManager.set({ ref: docRef, data: { name: 'John' } }); // Valid
          transaction.set(docRef, { name: 'Jane' }); // Invalid
        });
      `,
        errors: [{ messageId: 'noDirectSet' }],
      },
    ],
  },
);
