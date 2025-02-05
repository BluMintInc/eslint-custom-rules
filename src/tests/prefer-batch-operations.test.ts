import { ruleTesterTs } from '../utils/ruleTester';
import { preferBatchOperations } from '../rules/prefer-batch-operations';

ruleTesterTs.run('prefer-batch-operations', preferBatchOperations, {
  valid: [
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
  ],
  invalid: [
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
  ],
});
