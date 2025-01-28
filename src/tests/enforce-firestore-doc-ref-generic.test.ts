import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreDocRefGeneric } from '../rules/enforce-firestore-doc-ref-generic';

ruleTesterTs.run('enforce-firestore-doc-ref-generic', enforceFirestoreDocRefGeneric, {
  valid: [
    // Basic interface usage with all reference types
    {
      code: `
        interface User {
          name: string;
          age: number;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
        const usersRef: CollectionReference<User> = db.collection('users');
        const userGroups: CollectionGroup<User> = db.collectionGroup('users');
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
    // Missing generic type for all reference types
    {
      code: `const userRef: DocumentReference = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }],
    },
    {
      code: `const usersRef: CollectionReference = db.collection('users');`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'CollectionReference' } }],
    },
    {
      code: `const userGroups: CollectionGroup = db.collectionGroup('users');`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'CollectionGroup' } }],
    },
    // Using any for all reference types
    {
      code: `const userRef: DocumentReference<any> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'DocumentReference' } }],
    },
    {
      code: `const usersRef: CollectionReference<any> = db.collection('users');`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'CollectionReference' } }],
    },
    {
      code: `const userGroups: CollectionGroup<any> = db.collectionGroup('users');`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'CollectionGroup' } }],
    },
    // Using empty object type for all reference types
    {
      code: `const userRef: DocumentReference<{}> = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'DocumentReference' } }],
    },
    {
      code: `const usersRef: CollectionReference<{}> = db.collection('users');`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'CollectionReference' } }],
    },
    {
      code: `const userGroups: CollectionGroup<{}> = db.collectionGroup('users');`,
      errors: [{ messageId: 'invalidGeneric', data: { typeName: 'CollectionGroup' } }],
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
    // No explicit type for DocumentReference
    {
      code: `const userRef = db.collection('users').doc(userId);`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }],
    },
    // No explicit type for CollectionReference
    {
      code: `const usersRef = db.collection('users');`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'CollectionReference' } }],
    },
    // No explicit type for CollectionGroup
    {
      code: `const userGroups = db.collectionGroup('users');`,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'CollectionGroup' } }],
    },
    // No explicit type in chained operations
    {
      code: `const userDoc = db.collection('users').doc(userId).collection('orders').doc(orderId);`,
      errors: [
        { messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } },
        { messageId: 'missingGeneric', data: { typeName: 'CollectionReference' } },
        { messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }
      ],
    },
    // No explicit type in variable assignment
    {
      code: `
        const collection = db.collection('users');
        const doc = collection.doc(userId);
      `,
      errors: [
        { messageId: 'missingGeneric', data: { typeName: 'CollectionReference' } },
        { messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }
      ],
    },
    // No explicit type in array operations
    {
      code: `
        const userIds = ['1', '2', '3'];
        const userRefs = userIds.map(id => db.collection('users').doc(id));
      `,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }],
    },
    // No explicit type in function return
    {
      code: `
        function getUserDoc(id: string) {
          return db.collection('users').doc(id);
        }
      `,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }],
    },
    // No explicit type in async function
    {
      code: `
        async function fetchUserDoc(id: string) {
          const doc = await db.collection('users').doc(id).get();
          return doc;
        }
      `,
      errors: [{ messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } }],
    },
    // No explicit type in object property
    {
      code: `
        const userService = {
          getUser: (id: string) => db.collection('users').doc(id),
          getOrders: (userId: string) => db.collection('users').doc(userId).collection('orders')
        };
      `,
      errors: [
        { messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } },
        { messageId: 'missingGeneric', data: { typeName: 'DocumentReference' } },
        { messageId: 'missingGeneric', data: { typeName: 'CollectionReference' } }
      ],
    },
  ],
});
