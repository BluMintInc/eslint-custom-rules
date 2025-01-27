import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreDocRefGeneric } from '../rules/enforce-firestore-doc-ref-generic';

ruleTesterTs.run('enforce-firestore-doc-ref-generic', enforceFirestoreDocRefGeneric, {
  valid: [
    {
      code: `
        interface User {
          name: string;
          age: number;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    {
      code: `
        type Profile = {
          bio: string;
          avatar: string;
        };
        const profileRef: DocumentReference<Profile> = db.collection('profiles').doc(profileId);
      `,
    },
    {
      // Should not affect other generic types
      code: `
        const data: Array<string> = ['test'];
      `,
    },
  ],
  invalid: [
    {
      code: `const userRef: DocumentReference = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'missingGeneric' }],
    },
    {
      code: `const userRef: DocumentReference<any> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    {
      code: `const userRef: DocumentReference<{}> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric' }],
    },
  ],
});
