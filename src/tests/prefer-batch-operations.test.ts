import { ruleTesterTs } from '../utils/ruleTester';
import { preferBatchOperations } from '../rules/prefer-batch-operations';

ruleTesterTs.run('prefer-batch-operations', preferBatchOperations, {
  valid: [
    // Different operations in Promise.all with conditional execution should not be flagged
    `
      class NotificationSender {
        private smsSendable: any;
        private emailSendable: any;
        private pushSendable: any;

        private async sendEmail() {
          // Email sending logic
        }

        private async sendPush() {
          // Push notification logic
        }

        public async send() {
          const SMS_DOC_SETTER = new DocSetter(collectionRef);
          await Promise.all([
            this.smsSendable && SMS_DOC_SETTER.set(this.smsSendable),
            this.emailSendable && this.sendEmail(),
            this.pushSendable && this.sendPush(),
          ]);
        }
      }
    `,
    // Map.set() calls should not be flagged
    `
      const seen = new Map();
      for (const hit of hits) {
        if (!seen.has(hit.objectID)) {
          seen.set(hit.objectID, true);
        }
      }
    `,
    // Map.set() in useMemo should not be flagged
    `
      import { useMemo } from 'react';
      import { Hit } from '../../../functions/src/types/Hit';

      export const useHitsDeduped = (hits: Hit[]) => {
        return useMemo(() => {
          const seen = new Map();
          return hits.filter((hit) => {
            if (!seen.has(hit.objectID)) {
              seen.set(hit.objectID, true);
              return true;
            }
            return false;
          });
        }, [hits]);
      };
    `,
    // Single set() call is allowed
    `
      const setter = new DocSetter(collectionRef);
      await setter.set(doc);
    `,
    // Single overwrite() call is allowed
    `
      const setter = new DocSetter(collectionRef);
      await setter.overwrite(doc);
    `,
    // Using setAll() is valid
    `
      const setter = new DocSetter(collectionRef);
      await setter.setAll(documents);
    `,
    // Using overwriteAll() is valid
    `
      const setter = new DocSetter(collectionRef);
      await setter.overwriteAll(documents);
    `,
    // Different method calls in loop are allowed
    `
      const setter = new DocSetter(collectionRef);
      for (const doc of documents) {
        await setter.validate(doc);
      }
    `,
    // Using setAll() with array methods
    `
      const setter = new DocSetter(collectionRef);
      await setter.setAll(documents.filter(doc => doc.shouldUpdate));
    `,
    // Using overwriteAll() with array methods
    `
      const setter = new DocSetter(collectionRef);
      await setter.overwriteAll(documents.map(doc => ({ ...doc, updated: true })));
    `,
    // Using setAll() with spread operator
    `
      const setter = new DocSetter(collectionRef);
      await setter.setAll([...documents, newDoc]);
    `,
    // Using setAll() with array destructuring
    `
      const setter = new DocSetter(collectionRef);
      const [first, ...rest] = documents;
      await setter.setAll(rest);
    `,
    // Using setAll() with async operations
    `
      const setter = new DocSetter(collectionRef);
      const docs = await fetchDocuments();
      await setter.setAll(docs);
    `,
    // Using setAll() with Promise.all
    `
      const setter = new DocSetter(collectionRef);
      const docs = await Promise.all(promises);
      await setter.setAll(docs);
    `,
  ],
  invalid: [
    // Different setter instances in loop are not allowed
    {
      code: `
        const userSetter = new DocSetter(usersRef);
        const orderSetter = new DocSetter(ordersRef);
        for (const doc of documents) {
          await userSetter.set(doc.user);
          await orderSetter.set(doc.order);
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For...of loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          await setter.set(doc);
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For...of loop with overwrite()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          await setter.overwrite(doc);
        }
      `,
      errors: [{ messageId: 'preferOverwriteAll' }],
    },
    // For await...of loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for await (const doc of documents) {
          await setter.set(doc);
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Array.forEach with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        documents.forEach(async doc => {
          await setter.set(doc);
        });
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Promise.all with map and set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(documents.map(doc => setter.set(doc)));
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Nested loops with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const batch of batches) {
          for (const doc of batch) {
            await setter.set(doc);
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Conditional set() in loop
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          if (doc.shouldUpdate) {
            await setter.set(doc);
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For...in loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const key in documents) {
          await setter.set(documents[key]);
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // While loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        let i = 0;
        while (i < documents.length) {
          await setter.set(documents[i]);
          i++;
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Do...while loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        let i = 0;
        do {
          await setter.set(documents[i]);
          i++;
        } while (i < documents.length);
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Array.map with overwrite()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(documents.map(doc => setter.overwrite(doc)));
      `,
      errors: [{ messageId: 'preferOverwriteAll' }],
    },
    // Array.filter and forEach with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        documents.filter(doc => doc.shouldUpdate).forEach(async doc => {
          await setter.set(doc);
        });
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // Nested Promise.all with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(batches.map(batch =>
          Promise.all(batch.map(doc => setter.set(doc)))
        ));
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For loop with set() and try-catch
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          try {
            await setter.set(doc);
          } catch (error) {
            console.error(error);
          }
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For loop with overwrite() and async IIFE
    {
      code: `
        const setter = new DocSetter(collectionRef);
        (async () => {
          for (const doc of documents) {
            await setter.overwrite(doc);
          }
        })();
      `,
      errors: [{ messageId: 'preferOverwriteAll' }],
    },
    // Array.reduce with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await documents.reduce(async (promise, doc) => {
          await promise;
          await setter.set(doc);
        }, Promise.resolve());
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For loop with set() and multiple statements
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          const id = doc.id;
          console.log(id);
          await setter.set(doc);
          console.log('Done');
        }
      `,
      errors: [{ messageId: 'preferSetAll' }],
    },
    // For loop with overwrite() and function call
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          await processDoc(doc);
          await setter.overwrite(doc);
        }
      `,
      errors: [{ messageId: 'preferOverwriteAll' }],
    },
  ],
});
