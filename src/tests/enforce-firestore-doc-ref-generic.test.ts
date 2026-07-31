import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreDocRefGeneric } from '../rules/enforce-firestore-doc-ref-generic';

type MessageIds = 'missingGeneric' | 'invalidGeneric';

const missingGenericMessage = (type: string) =>
  [
    `What's wrong: ${type} is missing its document schema generic (the document data type).`,
    '',
    'Why it matters: Without the generic, Firestore references fall back to loose DocumentData, so TypeScript cannot catch field typos or missing required properties before they reach Firestore.',
    '',
    `How to fix: Add the document interface/type as the generic (e.g., const ref: ${type}<UserDoc> = ... or doc<UserDoc>(collection)).`,
  ].join('\n');

const invalidGenericMessage = (type: string) =>
  [
    `What's wrong: ${type} uses "any" or an empty object ({}) in its schema generic.`,
    '',
    'Why it matters: This erases the document schema and disables TypeScript checks on Firestore reads and writes, so malformed payloads and missing fields can pass silently.',
    '',
    'How to fix: Define a concrete interface/type for the document (e.g., interface UserDoc { name: string }) and use it as the generic instead of "any" or {}.',
  ].join('\n');

const missingGenericError = (
  type: string,
): TSESLint.TestCaseError<MessageIds> =>
  ({
    message: missingGenericMessage(type),
  } as unknown as TSESLint.TestCaseError<MessageIds>);

const invalidGenericError = (
  type: string,
): TSESLint.TestCaseError<MessageIds> =>
  ({
    message: invalidGenericMessage(type),
  } as unknown as TSESLint.TestCaseError<MessageIds>);

ruleTesterTs.run(
  'enforce-firestore-doc-ref-generic',
  enforceFirestoreDocRefGeneric,
  {
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
      // CollectionReference with proper generic type
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const usersCollection: CollectionReference<User> = db.collection('users');
      `,
      },
      // CollectionGroup with proper generic type
      {
        code: `
        interface Product {
          name: string;
          price: number;
        }
        const productsGroup: CollectionGroup<Product> = db.collectionGroup('products');
      `,
      },
      // Complex types with CollectionReference
      {
        code: `
        interface User {
          name: string;
          metadata: {
            lastLogin: Date;
            preferences: {
              theme: 'light' | 'dark';
            };
          };
        }
        const usersCollection: CollectionReference<User> = db.collection('users');
      `,
      },
      // Complex types with CollectionGroup
      {
        code: `
        interface Comment {
          text: string;
          author: {
            id: string;
            name: string;
          };
          createdAt: Date;
        }
        const commentsGroup: CollectionGroup<Comment> = db.collectionGroup('comments');
      `,
      },
      // Valid method calls with explicit generics
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const userRef = db.collection<User>('users').doc<User>(userId);
      `,
      },
      // Type assertions using 'as' keyword for DocumentReference
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const userRef = db.doc(toUserPath(userId)) as DocumentReference<User>;
      `,
      },
      // Type assertions using 'as' keyword for CollectionReference
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const usersCollection = db.collection('users') as CollectionReference<User>;
      `,
      },
      // Type assertions using 'as' keyword for CollectionGroup
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const usersGroup = db.collectionGroup('users') as CollectionGroup<User>;
      `,
      },
      {
        code: `
        interface Product {
          name: string;
          price: number;
        }
        const productsCollection = db.collection<Product>('products');
      `,
      },
      {
        code: `
        interface Comment {
          text: string;
          author: string;
        }
        const commentsGroup = db.collectionGroup<Comment>('comments');
      `,
      },
      // Method calls with complex types
      {
        code: `
        interface User {
          name: string;
          metadata: {
            lastLogin: Date;
            preferences: {
              theme: 'light' | 'dark';
            };
          };
        }
        const userRef = db.collection<User>('users').doc<User>(userId);
      `,
      },
      // CollectionReference.doc() should inherit type from collection - this is the bug case
      {
        code: `
        interface SomeType {
          name: string;
          value: number;
        }
        class TestClass {
          private collectionRef: CollectionReference<SomeType>;

          constructor() {
            this.collectionRef = db.collection<SomeType>('test');
          }

          private get docRef() {
            return this.collectionRef.doc(this.pathHashed);
          }
        }
      `,
      },
      // Another case: typed collection reference calling doc()
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const usersCollection: CollectionReference<User> = db.collection<User>('users');
        const userDoc = usersCollection.doc('user123');
      `,
      },
      // Method chaining with typed collection
      {
        code: `
        interface Product {
          name: string;
          price: number;
        }
        const productDoc = db.collection<Product>('products').doc('product123');
      `,
      },
      // Class property with CollectionReference type calling doc()
      {
        code: `
        interface Order {
          id: string;
          total: number;
        }
        class OrderService {
          private ordersCollection: CollectionReference<Order>;

          constructor() {
            this.ordersCollection = db.collection<Order>('orders');
          }

          getOrder(id: string) {
            return this.ordersCollection.doc(id);
          }
        }
      `,
      },
      // Exact bug reproduction case - getter with CollectionReference.doc()
      {
        code: `
        interface SomeType {
          name: string;
          value: number;
        }
        class TestClass {
          private collectionRef: CollectionReference<SomeType>;
          private pathHashed: string;

          constructor() {
            this.collectionRef = db.collection<SomeType>('test');
            this.pathHashed = 'hashed-path';
          }

          private get docRef() {
            return this.collectionRef.doc(this.pathHashed);
          }
        }
      `,
      },
      // CollectionReference from function parameter
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        function getDocFromCollection(collection: CollectionReference<User>, id: string) {
          return collection.doc(id);
        }
      `,
      },
      // CollectionReference from variable with type annotation
      {
        code: `
        interface Product {
          name: string;
          price: number;
        }
        const productsCollection: CollectionReference<Product> = getProductsCollection();
        const productDoc = productsCollection.doc('product-123');
      `,
      },
      // CollectionReference from arrow function return
      {
        code: `
        interface Comment {
          text: string;
          author: string;
        }
        const getCommentDoc = (collection: CollectionReference<Comment>, id: string) => {
          return collection.doc(id);
        };
      `,
      },
      // Nested property access with CollectionReference
      {
        code: `
        interface Task {
          title: string;
          completed: boolean;
        }
        class ProjectService {
          private collections: {
            tasks: CollectionReference<Task>;
          };

          constructor() {
            this.collections = {
              tasks: db.collection<Task>('tasks')
            };
          }

          getTask(id: string) {
            return this.collections.tasks.doc(id);
          }
        }
      `,
      },
      // CollectionReference in array
      {
        code: `
        interface Event {
          name: string;
          date: Date;
        }
        class EventManager {
          private eventCollections: CollectionReference<Event>[];

          constructor() {
            this.eventCollections = [
              db.collection<Event>('events-2023'),
              db.collection<Event>('events-2024')
            ];
          }

          getEvent(collectionIndex: number, id: string) {
            return this.eventCollections[collectionIndex].doc(id);
          }
        }
      `,
      },
      // CollectionReference with computed property access
      {
        code: `
        interface Log {
          message: string;
          timestamp: Date;
        }
        class LogService {
          private collections: Record<string, CollectionReference<Log>>;

          constructor() {
            this.collections = {
              'error': db.collection<Log>('error-logs'),
              'info': db.collection<Log>('info-logs')
            };
          }

          getLog(type: string, id: string) {
            return this.collections[type].doc(id);
          }
        }
      `,
      },
      // CollectionReference from method return
      {
        code: `
        interface Settings {
          theme: string;
          language: string;
        }
        class ConfigService {
          private getSettingsCollection(): CollectionReference<Settings> {
            return db.collection<Settings>('settings');
          }

          getSettingsDoc(id: string) {
            return this.getSettingsCollection().doc(id);
          }
        }
      `,
      },
      // CollectionReference with inheritance
      {
        code: `
        interface BaseDocument {
          id: string;
          createdAt: Date;
        }
        interface UserDocument extends BaseDocument {
          name: string;
          email: string;
        }
        class UserService {
          private usersCollection: CollectionReference<UserDocument>;

          constructor() {
            this.usersCollection = db.collection<UserDocument>('users');
          }

          getUser(id: string) {
            return this.usersCollection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with generic class
      {
        code: `
        interface Document {
          data: any;
        }
        class GenericService<T extends Document> {
          private collection: CollectionReference<T>;

          constructor(collectionName: string) {
            this.collection = db.collection<T>(collectionName);
          }

          getDocument(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with union types
      {
        code: `
        interface AdminUser {
          type: 'admin';
          permissions: string[];
        }
        interface RegularUser {
          type: 'regular';
          preferences: Record<string, any>;
        }
        type User = AdminUser | RegularUser;

        class UserService {
          private usersCollection: CollectionReference<User>;

          constructor() {
            this.usersCollection = db.collection<User>('users');
          }

          getUser(id: string) {
            return this.usersCollection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with intersection types
      {
        code: `
        interface Timestamps {
          createdAt: Date;
          updatedAt: Date;
        }
        interface UserData {
          name: string;
          email: string;
        }
        type UserWithTimestamps = UserData & Timestamps;

        class UserService {
          private usersCollection: CollectionReference<UserWithTimestamps>;

          constructor() {
            this.usersCollection = db.collection<UserWithTimestamps>('users');
          }

          getUser(id: string) {
            return this.usersCollection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with conditional types
      {
        code: `
        interface BaseDoc {
          id: string;
        }
        interface ExtendedDoc extends BaseDoc {
          data: string;
        }
        type ConditionalDoc<T> = T extends string ? ExtendedDoc : BaseDoc;

        class ConditionalService<T> {
          private collection: CollectionReference<ConditionalDoc<T>>;

          constructor(collectionName: string) {
            this.collection = db.collection<ConditionalDoc<T>>(collectionName);
          }

          getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with mapped types
      {
        code: `
        interface BaseUser {
          name: string;
          age: number;
        }
        type PartialUser = Partial<BaseUser>;

        class PartialUserService {
          private collection: CollectionReference<PartialUser>;

          constructor() {
            this.collection = db.collection<PartialUser>('partial-users');
          }

          getUser(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with utility types
      {
        code: `
        interface FullUser {
          id: string;
          name: string;
          email: string;
          password: string;
        }
        type PublicUser = Omit<FullUser, 'password'>;

        class PublicUserService {
          private collection: CollectionReference<PublicUser>;

          constructor() {
            this.collection = db.collection<PublicUser>('public-users');
          }

          getUser(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference in async context
      {
        code: `
        interface AsyncDoc {
          data: string;
          processed: boolean;
        }
        class AsyncService {
          private collection: CollectionReference<AsyncDoc>;

          constructor() {
            this.collection = db.collection<AsyncDoc>('async-docs');
          }

          async getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with Promise return type
      {
        code: `
        interface PromiseDoc {
          value: string;
        }
        class PromiseService {
          private collection: CollectionReference<PromiseDoc>;

          constructor() {
            this.collection = db.collection<PromiseDoc>('promise-docs');
          }

          getDocPromise(id: string): Promise<DocumentReference<PromiseDoc>> {
            return Promise.resolve(this.collection.doc(id));
          }
        }
      `,
      },

      // CollectionReference with closure
      {
        code: `
        interface ClosureDoc {
          data: string;
        }
        function createDocGetter(collection: CollectionReference<ClosureDoc>) {
          return function(id: string) {
            return collection.doc(id);
          };
        }
      `,
      },
      // CollectionReference with callback
      {
        code: `
        interface CallbackDoc {
          message: string;
        }
        class CallbackService {
          private collection: CollectionReference<CallbackDoc>;

          constructor() {
            this.collection = db.collection<CallbackDoc>('callbacks');
          }

          processDoc(id: string, callback: (doc: DocumentReference<CallbackDoc>) => void) {
            callback(this.collection.doc(id));
          }
        }
      `,
      },
      // CollectionReference with higher-order function
      {
        code: `
        interface HOFDoc {
          data: any;
        }
        function withCollection<T>(collection: CollectionReference<T>) {
          return {
            getDoc: (id: string) => collection.doc(id)
          };
        }
      `,
      },
      // CollectionReference with static method
      {
        code: `
        interface StaticDoc {
          value: string;
        }
        class StaticService {
          private static collection: CollectionReference<StaticDoc> = db.collection<StaticDoc>('static');

          static getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with getter method
      {
        code: `
        interface GetterDoc {
          content: string;
        }
        class GetterService {
          private _collection: CollectionReference<GetterDoc>;

          constructor() {
            this._collection = db.collection<GetterDoc>('getter');
          }

          get collection() {
            return this._collection;
          }

          getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      // CollectionReference with setter method
      {
        code: `
        interface SetterDoc {
          data: string;
        }
        class SetterService {
          private _collection: CollectionReference<SetterDoc>;

          constructor() {
            this._collection = db.collection<SetterDoc>('setter');
          }

          set collection(value: CollectionReference<SetterDoc>) {
            this._collection = value;
          }

          getDoc(id: string) {
            return this._collection.doc(id);
          }
        }
      `,
      },
      // Typed collection bound to a const, then .doc() (the documented example)
      {
        code: `
        interface UserData {
          name: string;
        }
        const typedUsersCollection = db.collection<UserData>('users');
        const typedUserDoc = typedUsersCollection.doc('123');
      `,
      },
      // Typed collection bound to a const, then .doc() inside a function body
      {
        code: `
        interface UserData {
          name: string;
        }
        function loadUser(id: string) {
          const usersCollection = db.collection<UserData>('users');
          return usersCollection.doc(id);
        }
      `,
      },
      // Typed collection const declared in an outer scope, .doc() in an inner scope
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = db.collection<UserData>('users');
        function loadUser(id: string) {
          return usersCollection.doc(id);
        }
      `,
      },
      // Const annotated CollectionReference<T>, then .doc()
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection: CollectionReference<UserData> = db.collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
      },
      // Const annotated with a namespaced CollectionReference<T>, then .doc()
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection: firestore.CollectionReference<UserData> = getUsersCollection();
        const userDoc = usersCollection.doc('123');
      `,
      },
      // Typed collection const, then .doc() with an explicit valid generic
      {
        code: `
        interface UserData {
          name: string;
        }
        interface AdminData {
          role: string;
        }
        const usersCollection = db.collection<UserData>('users');
        const adminDoc = usersCollection.doc<AdminData>('123');
      `,
      },
      // Const asserted as CollectionReference<T>, then .doc()
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = getUsersCollection() as CollectionReference<UserData>;
        const userDoc = usersCollection.doc('123');
      `,
      },
      // Typed collection const consumed by a nested arrow function
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = db.collection<UserData>('users');
        const loadUsers = (ids: string[]) => ids.map((id) => usersCollection.doc(id));
      `,
      },
      // Typed collection const inside a class method
      {
        code: `
        interface UserData {
          name: string;
        }
        class UserService {
          getDoc(id: string) {
            const usersCollection = db.collection<UserData>('users');
            return usersCollection.doc(id);
          }
        }
      `,
      },
      // Const initialized from a typed sub-collection chain, then .doc()
      {
        code: `
        interface TenantData {
          name: string;
        }
        interface UserData {
          name: string;
        }
        const usersCollection = db
          .collection<TenantData>('tenants')
          .doc('1')
          .collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
      },
    ],
    invalid: [
      // Missing generic type - DocumentReference
      {
        code: `const userRef: DocumentReference = db.collection('users').doc(userId);`,
        errors: [missingGenericError('DocumentReference')],
      },
      // Missing generic type - CollectionReference
      {
        code: `const usersCollection: CollectionReference = db.collection('users');`,
        errors: [missingGenericError('CollectionReference')],
      },
      // Missing generic type - CollectionGroup
      {
        code: `const productsGroup: CollectionGroup = db.collectionGroup('products');`,
        errors: [missingGenericError('CollectionGroup')],
      },
      // Missing generic type in .doc() call
      {
        code: `const userRef = db.collection('users').doc(userId);`,
        errors: [missingGenericError('DocumentReference')],
      },
      // Missing generic type in .collection() call
      {
        code: `const usersCollection = db.collection('users');`,
        errors: [missingGenericError('CollectionReference')],
      },
      // Missing generic type in .collectionGroup() call
      {
        code: `const productsGroup = db.collectionGroup('products');`,
        errors: [missingGenericError('CollectionGroup')],
      },
      // Invalid generic type in .doc() call
      {
        code: `const userRef = db.collection<User>('users').doc<any>(userId);`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Invalid generic type in .collection() call
      {
        code: `const usersCollection = db.collection<{}>("users");`,
        errors: [invalidGenericError('CollectionReference')],
      },
      // Invalid generic type in .collectionGroup() call
      {
        code: `const productsGroup = db.collectionGroup<any>('products');`,
        errors: [invalidGenericError('CollectionGroup')],
      },
      // Using any - DocumentReference
      {
        code: `const userRef: DocumentReference<any> = db.collection('users').doc(userId);`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using any - CollectionReference
      {
        code: `const usersCollection: CollectionReference<any> = db.collection('users');`,
        errors: [invalidGenericError('CollectionReference')],
      },
      // Using any - CollectionGroup
      {
        code: `const productsGroup: CollectionGroup<any> = db.collectionGroup('products');`,
        errors: [invalidGenericError('CollectionGroup')],
      },
      // Using empty object type - DocumentReference
      {
        code: `const userRef: DocumentReference<{}> = db.collection('users').doc(userId);`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using empty object type - CollectionReference
      {
        code: `const usersCollection: CollectionReference<{}> = db.collection('users');`,
        errors: [invalidGenericError('CollectionReference')],
      },
      // Using empty object type - CollectionGroup
      {
        code: `const productsGroup: CollectionGroup<{}> = db.collectionGroup('products');`,
        errors: [invalidGenericError('CollectionGroup')],
      },
      // Using any in nested type
      {
        code: `
        interface User {
          data: any;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using empty object in array
      {
        code: `const refs: Array<DocumentReference<{}>> = docs.map(d => d.ref);`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using any in Promise
      {
        code: `
        async function getRef(): Promise<DocumentReference<any>> {
          return db.collection('users').doc(userId);
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
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
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using empty object in function parameter
      {
        code: `
        function process(ref: DocumentReference<{}>) {
          return ref.get();
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using any in intersection type
      {
        code: `
        interface Base {
          id: string;
        }
        const ref: DocumentReference<Base & any> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Using empty object in union type
      {
        code: `
        interface User {
          name: string;
        }
        const ref: DocumentReference<User | {}> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Invalid generic on typed collection should still be caught
      {
        code: `
        interface User {
          name: string;
          age: number;
        }
        const usersCollection: CollectionReference<User> = db.collection<User>('users');
        const userDoc = usersCollection.doc<any>('user123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Invalid generic on method chained typed collection should still be caught
      {
        code: `
        interface Product {
          name: string;
          price: number;
        }
        const productDoc = db.collection<Product>('products').doc<{}>('product123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Standalone doc() function call should still require generics
      {
        code: `const docRef = doc(firestore, 'collection/docId');`,
        errors: [missingGenericError('DocumentReference')],
      },
      // Standalone doc() function call with invalid generic
      {
        code: `const docRef = doc<any>(firestore, 'collection/docId');`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Untyped CollectionReference calling doc() should still require generics
      {
        code: `
        const untypedCollection = db.collection('untyped');
        const docRef = untypedCollection.doc('doc-id');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // CollectionReference without type annotation calling doc()
      {
        code: `
        class UntypedService {
          private collection;

          constructor() {
            this.collection = db.collection('untyped');
          }

          getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Function parameter without type annotation
      {
        code: `
        function getDocFromUntypedCollection(collection, id: string) {
          return collection.doc(id);
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Variable without type annotation
      {
        code: `
        const untypedCollection = db.collection('test');
        const doc = untypedCollection.doc('id');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Method returning untyped collection
      {
        code: `
        class UntypedCollectionService {
          getCollection() {
            return db.collection('untyped');
          }

          getDoc(id: string) {
            return this.getCollection().doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Array of untyped collections
      {
        code: `
        const collections = [db.collection('test1'), db.collection('test2')];
        const doc = collections[0].doc('id');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Object with untyped collection property
      {
        code: `
        const collections = {
          users: db.collection('users'),
          posts: db.collection('posts')
        };
        const userDoc = collections.users.doc('user-id');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Control: untyped collection bound to a const, then .doc()
      {
        code: `
        const usersCollection = db.collection('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // A let reassigned to an untyped collection is not provably typed
      {
        code: `
        interface UserData {
          name: string;
        }
        let usersCollection = db.collection<UserData>('users');
        usersCollection = db.collection('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // Only one hop is followed: an alias of a typed collection is not resolved
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = db.collection<UserData>('users');
        const aliasCollection = usersCollection;
        const userDoc = aliasCollection.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Shadowing: the inner binding is untyped even though the outer one is typed
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = db.collection<UserData>('users');
        function loadUser(id: string) {
          const usersCollection = db.collection('users');
          return usersCollection.doc(id);
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // An untyped function parameter resolves to no declarator, so it still reports
      {
        code: `
        function loadUser(usersCollection, id: string) {
          return usersCollection.doc(id);
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A mutable binding is refused even when it is never reassigned
      {
        code: `
        interface UserData {
          name: string;
        }
        let usersCollection = db.collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A destructured binding has no resolvable collection initializer
      {
        code: `
        interface UserData {
          name: string;
        }
        const { users } = getCollections<UserData>();
        const userDoc = users.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A collection typed with any is reported once, on the collection call
      {
        code: `
        const usersCollection = db.collection<any>('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [invalidGenericError('CollectionReference')],
      },
      // An imported collection cannot be proven typed in this file
      {
        code: `
        import { usersCollection } from './collections';
        const userDoc = usersCollection.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A typed collection const does not excuse an invalid generic on .doc()
      {
        code: `
        interface UserData {
          name: string;
        }
        const usersCollection = db.collection<UserData>('users');
        const userDoc = usersCollection.doc<any>('123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
    ],
  },
);
