import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run('enforce-firestore-facade', enforceFirestoreFacade, {
  valid: [
    // Valid FirestoreFetcher usage
    {
      code: `
        const userFetcher = new FirestoreDocFetcher<UserDocument>(docRef);
        const userDoc = await userFetcher.fetch();
      `,
    },
    // Valid DocSetter usage
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));
        await userSetter.set({ id: 'user123', name: 'John' });
      `,
    },
    // Valid transaction usage with facade
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userTx = new DocSetterTransaction<UserDocument>(
            db.collection('users'),
            { transaction }
          );
          const userFetcher = new FirestoreDocFetcher<UserDocument>(docRef, { transaction });
          const userDoc = await userFetcher.fetch();
          userTx.set({ id: 'user123', score: 100 });
        });
      `,
    },
    // Valid collection/doc reference creation
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        const collectionRef = db.collection('users');
      `,
    },
  ],
  invalid: [
    // Invalid direct get usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        const userDoc = await docRef.get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid direct set usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid direct update usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.update({ score: 100 });
      `,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Invalid direct delete usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.delete();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid batch operations
    {
      code: `
        const batch = db.batch();
        batch.set(docRef, { name: 'John' });
        await batch.commit();
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid transaction operations
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(docRef);
          transaction.set(docRef, { score: 100 });
        });
      `,
      errors: [
        { messageId: 'noDirectGet' },
        { messageId: 'noDirectSet' },
      ],
    },
  ],
});
