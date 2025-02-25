import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run('enforce-firestore-facade-parenthesized', enforceFirestoreFacade, {
  valid: [
    // Valid FirestoreFetcher usage
    {
      code: `
        const userFetcher = new FirestoreDocFetcher<UserDocument>(docRef);
        const userDoc = await userFetcher.get();
      `,
    },
  ],
  invalid: [
    // Invalid direct get with parentheses and type assertion
    {
      code: `
        const denormDocs = await (
          db.collection(
            toGroupDenormalizationCollectionPath(userId),
          ) as CollectionReference<GroupDenormalization>
        ).get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid direct get with just parentheses
    {
      code: `
        const subGroupDoc = await (
          db.doc(path)
        ).get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid direct get with nested parentheses and type assertions
    {
      code: `
        const doc = await (
          (
            db.collection('users').doc('user123') as DocumentReference<UserDocument>
          )
        ).get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid direct set with parentheses and type assertion
    {
      code: `
        await (
          db.doc(path) as DocumentReference<GroupInfo>
        ).set({ data: 'value' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
  ],
});
