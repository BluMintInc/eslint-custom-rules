import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { preferBatchOperations } from '../rules/prefer-batch-operations';

const buildMessage = (
  setterMethod: 'set()' | 'overwrite()',
  contextDescription: string,
) =>
  `DocSetter.${setterMethod} is invoked repeatedly inside ${contextDescription}, which issues separate Firestore writes per document and can leave partial updates when later calls fail. Batch the documents with DocSetter.${
    setterMethod === 'set()' ? 'setAll()' : 'overwriteAll()'
  } so the writes stay grouped and latency stays predictable.`;

type MessageIds = 'preferBatch';
type ErrorExpectation = TSESLint.TestCaseError<MessageIds>;

const expectSetAll = (contextDescription: string): ErrorExpectation =>
  ({
    message: buildMessage('set()', contextDescription),
  } as unknown as ErrorExpectation);

const expectOverwriteAll = (contextDescription: string): ErrorExpectation =>
  ({
    message: buildMessage('overwrite()', contextDescription),
  } as unknown as ErrorExpectation);

ruleTesterTs.run('prefer-batch-operations', preferBatchOperations, {
  valid: [
    /**
     * A direct `Promise.all([...])` writes its elements out, so a lone call is
     * a single write — which the docs call valid (issue #1757). The deferred
     * "report on the second occurrence" branch that enforces this used to be
     * unreachable, because Promise.all was routed through the array-method
     * branch and reported on the first call.
     */
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([setter.set(doc1)]);
      `,
    },
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([setter.overwrite(doc1)]);
      `,
    },
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
    // Different operations with OR conditional operator
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        condition1 || setter.set(doc1),
        condition2 || this.sendEmail(),
        condition3 || this.sendPush(),
      ]);
    `,
    // Mixed operations with ternary operators
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        shouldSendSms ? setter.set(smsDoc) : null,
        shouldSendEmail ? this.sendEmail() : null,
        shouldSendPush ? this.sendPush() : null,
      ]);
    `,
    // Complex conditional expressions with different operation types
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        (condition1 && condition2) && setter.set(doc),
        (condition3 || condition4) && this.processData(),
        condition5 && this.validateInput(),
      ]);
    `,
    // Nested conditional expressions with mixed operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        user.isActive && (user.hasPermission && setter.set(userDoc)),
        email.isValid && (email.shouldSend && this.sendEmail()),
        push.isEnabled && this.sendPush(),
      ]);
    `,
    // Function calls that return different operation types
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        shouldUpdate && setter.set(doc),
        shouldNotify && this.getNotificationService().send(),
        shouldLog && this.getLogger().log(),
      ]);
    `,
    // Mixed synchronous and asynchronous operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        condition1 && setter.set(doc),
        condition2 && this.syncOperation(),
        condition3 && this.asyncOperation(),
      ]);
    `,
    // Different method names on the same object
    `
      const service = new NotificationService();
      await Promise.all([
        condition1 && service.sendSms(data),
        condition2 && service.sendEmail(data),
        condition3 && service.sendPush(data),
      ]);
    `,
    // Operations on different properties of the same object
    `
      const services = {
        sms: new DocSetter(smsRef),
        email: new EmailService(),
        push: new PushService(),
      };
      await Promise.all([
        condition1 && services.sms.set(doc),
        condition2 && services.email.send(),
        condition3 && services.push.send(),
      ]);
    `,
    // Chained method calls with different operation types
    `
      const factory = new ServiceFactory();
      await Promise.all([
        condition1 && factory.getSetter().set(doc),
        condition2 && factory.getEmailService().send(),
        condition3 && factory.getPushService().send(),
      ]);
    `,
    // Array spread with mixed operations
    `
      const setter = new DocSetter(collectionRef);
      const operations = [
        condition1 && setter.set(doc),
        condition2 && this.sendEmail(),
      ];
      await Promise.all([
        ...operations,
        condition3 && this.sendPush(),
      ]);
    `,
    // Complex member expressions with different operation types
    `
      const context = {
        services: {
          firestore: new DocSetter(collectionRef),
          email: new EmailService(),
        }
      };
      await Promise.all([
        condition1 && context.services.firestore.set(doc),
        condition2 && context.services.email.send(),
        condition3 && this.sendPush(),
      ]);
    `,
    // Multiple setter instances with different operation types
    `
      const userSetter = new DocSetter(usersRef);
      const orderSetter = new DocSetter(ordersRef);
      await Promise.all([
        condition1 && userSetter.set(userDoc),
        condition2 && orderSetter.set(orderDoc),
        condition3 && this.sendEmail(),
        condition4 && this.sendPush(),
      ]);
    `,
    // Conditional execution with if statements (not in Promise.all)
    `
      const setter = new DocSetter(collectionRef);
      if (condition1) {
        await setter.set(doc1);
      }
      if (condition2) {
        await this.sendEmail();
      }
    `,
    // Mixed operations without conditionals should not be flagged if they're different types
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        setter.set(doc),
        this.sendEmail(),
        this.sendPush(),
      ]);
    `,
    // Single setter call with other operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        setter.set(doc),
        this.processData(),
        this.validateInput(),
      ]);
    `,
    // Different setter methods on same instance with other operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        setter.set(doc1),
        setter.validate(doc2),
        this.sendEmail(),
      ]);
    `,
    // Nested Promise.all with mixed operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        Promise.all([
          condition1 && setter.set(doc1),
          condition2 && this.sendEmail(),
        ]),
        condition3 && this.sendPush(),
      ]);
    `,
    // Promise.all with only null values should not be flagged
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        condition1 ? null : setter.set(doc),
        condition2 ? null : this.sendEmail(),
      ]);
    `,
    // Promise.all with complex expressions and mixed operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        condition1 && condition2 && setter.set(doc),
        condition3 || condition4 || this.sendEmail(),
        this.sendPush(),
      ]);
    `,
    // Promise.all with method chaining and mixed operations
    `
      const setter = new DocSetter(collectionRef);
      await Promise.all([
        condition1 && setter.set(doc),
        condition2 && this.getService().sendEmail(),
        condition3 && this.getService().sendPush(),
      ]);
    `,
    // Promise.all with object method calls and mixed operations
    `
      const setter = new DocSetter(collectionRef);
      const service = { send: () => {} };
      await Promise.all([
        condition1 && setter.set(doc),
        condition2 && service.send(),
        condition3 && this.processData(),
      ]);
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
    /**
     * A parameter sharing the outer setter's name is an opaque value, never
     * proven to hold a `DocSetter`, so repeated `set()` calls on it are not a
     * batchable write (#2264). Resolution stops at the binder that introduces
     * the name, and a function parameter carries no statement — a walk over
     * statement containers alone reaches past it to the module-scope
     * `new DocSetter(...)` and reports a call the rule cannot vouch for.
     */
    `
      const setter = new DocSetter(collectionRef);
      async function writeAll(setter) {
        for (const doc of documents) {
          await setter.set(doc);
        }
      }
    `,
  ],
  invalid: [
    /**
     * Where the setter is CONSTRUCTED must not change the verdict (issue
     * #1759). `findVariableDeclaration` climbed the parent chain but only
     * inspected `Program.body`, so a setter built inside the function that uses
     * it — how production code is written — was never resolved and the rule
     * returned early. Every fixture in this file used to be top-level, which is
     * the one side of that boundary where the rule worked.
     */
    {
      code: `
        async function writeAll() {
          const setter = new DocSetter(collectionRef);
          for (const doc of documents) {
            await setter.set(doc);
          }
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
    {
      code: `
        const writeAll = async () => {
          const setter = new DocSetter(collectionRef);
          for (const doc of documents) {
            await setter.set(doc);
          }
        };
      `,
      errors: [expectSetAll('for...of loop')],
    },
    {
      code: `
        class Writer {
          async writeAll() {
            const setter = new DocSetter(collectionRef);
            for (const doc of documents) {
              await setter.set(doc);
            }
          }
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
    {
      code: `
        async function writeAll() {
          const setter = new DocSetter(collectionRef);
          await Promise.all([setter.set(doc1), setter.set(doc2)]);
        }
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    /**
     * The other side of #1757: excluding Promise.all from the array-method
     * branch must not silence the shapes that ARE repeated writes. Two elements
     * is the boundary the deferred branch keys on, and a `map` callback inside
     * Promise.all is a genuine loop even with one syntactic call — it resolves
     * to the `map` node, which carries no Promise.all flag.
     */
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([setter.set(doc1), setter.set(doc2)]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(docs.map((doc) => setter.set(doc)));
      `,
      errors: [expectSetAll('map() callback')],
    },
    // Multiple setter calls of the same type in Promise.all should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          setter.set(doc1),
          setter.set(doc2),
          setter.set(doc3),
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    // Multiple conditional setter calls of the same type should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          condition1 && setter.set(doc1),
          condition2 && setter.set(doc2),
          condition3 && setter.set(doc3),
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    // Multiple overwrite calls should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          setter.overwrite(doc1),
          setter.overwrite(doc2),
        ]);
      `,
      errors: [expectOverwriteAll('Promise.all()')],
    },
    // Multiple setter calls with ternary operators should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          condition1 ? setter.set(doc1) : null,
          condition2 ? setter.set(doc2) : null,
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    // Multiple setter calls with complex conditionals should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          (condition1 && condition2) && setter.set(doc1),
          (condition3 && condition4) && setter.set(doc2),
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    // Multiple setter calls with OR conditionals should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          condition1 || setter.set(doc1),
          condition2 || setter.set(doc2),
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
    // Multiple setter calls with nested ternary should be flagged
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all([
          condition1 ? (condition2 ? setter.set(doc1) : null) : null,
          condition3 ? setter.set(doc2) : null,
        ]);
      `,
      errors: [expectSetAll('Promise.all()')],
    },
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
      errors: [expectSetAll('for...of loop')],
    },
    // For...of loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          await setter.set(doc);
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
    // For...of loop with overwrite()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const doc of documents) {
          await setter.overwrite(doc);
        }
      `,
      errors: [expectOverwriteAll('for...of loop')],
    },
    // For await...of loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for await (const doc of documents) {
          await setter.set(doc);
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
    // Array.forEach with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        documents.forEach(async doc => {
          await setter.set(doc);
        });
      `,
      errors: [expectSetAll('forEach() callback')],
    },
    // Promise.all with map and set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(documents.map(doc => setter.set(doc)));
      `,
      errors: [expectSetAll('map() callback')],
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
      errors: [expectSetAll('for...of loop')],
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
      errors: [expectSetAll('for...of loop')],
    },
    // For...in loop with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        for (const key in documents) {
          await setter.set(documents[key]);
        }
      `,
      errors: [expectSetAll('for...in loop')],
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
      errors: [expectSetAll('while loop')],
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
      errors: [expectSetAll('do...while loop')],
    },
    // Array.map with overwrite()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(documents.map(doc => setter.overwrite(doc)));
      `,
      errors: [expectOverwriteAll('map() callback')],
    },
    // Array.filter and forEach with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        documents.filter(doc => doc.shouldUpdate).forEach(async doc => {
          await setter.set(doc);
        });
      `,
      errors: [expectSetAll('forEach() callback')],
    },
    // Nested Promise.all with set()
    {
      code: `
        const setter = new DocSetter(collectionRef);
        await Promise.all(batches.map(batch =>
          Promise.all(batch.map(doc => setter.set(doc)))
        ));
      `,
      errors: [expectSetAll('map() callback')],
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
      errors: [expectSetAll('for...of loop')],
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
      errors: [expectOverwriteAll('for...of loop')],
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
      errors: [expectSetAll('reduce() callback')],
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
      errors: [expectSetAll('for...of loop')],
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
      errors: [expectOverwriteAll('for...of loop')],
    },
    /**
     * The over-decline control for the shadowed fixture in `valid` (#2264): the
     * same loop in the same nested function with the parameter dropped. The
     * setter still resolves outward across the function boundary, so stopping
     * at a shadowing binder must not amount to abandoning the outward walk.
     */
    {
      code: `
        const setter = new DocSetter(collectionRef);
        async function writeAll() {
          for (const doc of documents) {
            await setter.set(doc);
          }
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
    /**
     * The namespace control for #2264: a shadow is specific to one declaration
     * space. A type parameter takes `setter` in TYPE space only, while the
     * call resolves it as a VALUE, so the module-scope `DocSetter` still
     * answers and the batchable write is still reported. Treating any
     * same-named binder as a shadow would silence this.
     */
    {
      code: `
        const setter = new DocSetter(collectionRef);
        async function writeAll<setter>() {
          for (const doc of documents) {
            await setter.set(doc);
          }
        }
      `,
      errors: [expectSetAll('for...of loop')],
    },
  ],
});
