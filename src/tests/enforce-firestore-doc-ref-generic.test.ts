import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreDocRefGeneric } from '../rules/enforce-firestore-doc-ref-generic';

ruleTesterTs.run('enforce-firestore-doc-ref-generic', enforceFirestoreDocRefGeneric, {
  valid: [
    // Basic interface usage
    {
      code: `
        interface User {
          name: string;
          age: number;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    // Basic type alias usage
    {
      code: `
        type Profile = {
          bio: string;
          avatar: string;
        };
        const profileRef: DocumentReference<Profile> = db.collection('profiles').doc(profileId);
      `,
    },
    // Nested type usage
    {
      code: `
        interface Address {
          street: string;
          city: string;
        }
        interface User {
          name: string;
          addresses: Address[];
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    // Union types
    {
      code: `
        type Status = 'active' | 'inactive';
        interface User {
          status: Status;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    // Intersection types
    {
      code: `
        interface Timestamps {
          createdAt: Date;
          updatedAt: Date;
        }
        interface User {
          name: string;
        }
        const userRef: DocumentReference<User & Timestamps> = db.collection('users').doc(userId);
      `,
    },
    // Generic type parameters
    {
      code: `
        interface Collection<T> {
          data: T;
        }
        interface User {
          name: string;
        }
        const ref: DocumentReference<Collection<User>> = db.collection('collections').doc(id);
      `,
    },
    // Array of DocumentReferences
    {
      code: `
        interface User {
          name: string;
        }
        const refs: Array<DocumentReference<User>> = users.map(u => db.collection('users').doc(u.id));
      `,
    },
    // Promise of DocumentReference
    {
      code: `
        interface User {
          name: string;
        }
        async function getRef(): Promise<DocumentReference<User>> {
          return db.collection('users').doc(userId);
        }
      `,
    },
    // Complex object types
    {
      code: `
        interface User {
          name: string;
          metadata: {
            lastLogin: Date;
            preferences: {
              theme: 'light' | 'dark';
              notifications: boolean;
            };
          };
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    // Readonly types
    {
      code: `
        interface User {
          readonly id: string;
          name: string;
        }
        const userRef: DocumentReference<Readonly<User>> = db.collection('users').doc(userId);
      `,
    },
    // Optional properties
    {
      code: `
        interface User {
          name: string;
          middleName?: string;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
    },
    // Function return types
    {
      code: `
        interface User {
          name: string;
        }
        function getUserRef(id: string): DocumentReference<User> {
          return db.collection('users').doc(id);
        }
      `,
    },
    // Class member types
    {
      code: `
        interface User {
          name: string;
        }
        class UserService {
          private userRef: DocumentReference<User>;
          constructor(id: string) {
            this.userRef = db.collection('users').doc(id);
          }
        }
      `,
    },
    // Generic constraints
    {
      code: `
        interface BaseModel {
          id: string;
        }
        interface User extends BaseModel {
          name: string;
        }
        function getRef<T extends BaseModel>(id: string): DocumentReference<T> {
          return db.collection('users').doc(id);
        }
      `,
    },
    // Should not affect other generic types
    {
      code: `
        const data: Array<string> = ['test'];
      `,
    },
  ],
  invalid: [
    // Missing generic type
    {
      code: `const userRef: DocumentReference = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'missingGeneric' }],
    },
    // Using any
    {
      code: `const userRef: DocumentReference<any> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using empty object type
    {
      code: `const userRef: DocumentReference<{}> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using any in nested type
    {
      code: `
        interface User {
          data: any;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using empty object in array
    {
      code: `const refs: Array<DocumentReference<{}>> = docs.map(d => d.ref);`,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using any in Promise
    {
      code: `
        async function getRef(): Promise<DocumentReference<any>> {
          return db.collection('users').doc(userId);
        }
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using any in class member
    {
      code: `
        class Service {
          private ref: DocumentReference<any>;
          constructor(id: string) {
            this.ref = db.collection('users').doc(id);
          }
        }
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using empty object in function parameter
    {
      code: `
        function process(ref: DocumentReference<{}>) {
          return ref.get();
        }
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using any in intersection type
    {
      code: `
        interface Base {
          id: string;
        }
        const ref: DocumentReference<Base & any> = db.collection('users').doc(userId);
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
    // Using empty object in union type
    {
      code: `
        interface User {
          name: string;
        }
        const ref: DocumentReference<User | {}> = db.collection('users').doc(userId);
      `,
      errors: [{ messageId: 'invalidGeneric' }],
    },
  ],
});
