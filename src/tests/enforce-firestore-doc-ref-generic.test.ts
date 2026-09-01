import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import type { TSESLint } from '@typescript-eslint/utils';
import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreDocRefGeneric } from '../rules/enforce-firestore-doc-ref-generic';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';

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
      // The return annotation states the schema regardless of which function
      // spelling carries it, so each of the three forms below is the twin of a
      // declaration-spelled fixture and must draw the same silence (#1909).
      {
        code: `
        interface User {
          name: string;
        }
        const getRef = async (): Promise<DocumentReference<User>> => {
          return db.collection('users').doc(userId);
        };
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const getRef = async function (): Promise<DocumentReference<User>> {
          return db.collection('users').doc(userId);
        };
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = (id: string): DocumentReference<User> => {
          return db.collection('users').doc(id);
        };
      `,
      },
      // A concise body is the returned expression, with no ReturnStatement to
      // carry the annotation's evidence.
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = (id: string): DocumentReference<User> =>
          db.collection('users').doc(id);
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = async (id: string): Promise<DocumentReference<User>> =>
          db.collection('users').doc(id);
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const getUsers = (): CollectionReference<User> => db.collection('users');
      `,
      },
      {
        code: `
        interface Post {
          title: string;
        }
        const getPosts = (): CollectionGroup<Post> => db.collectionGroup('posts');
      `,
      },
      // Generic constraints, arrow twin of the declaration fixture below.
      {
        code: `
        interface BaseModel {
          id: string;
        }
        interface User extends BaseModel {
          name: string;
        }
        const getRef = <T extends BaseModel>(id: string): DocumentReference<T> =>
          db.collection('users').doc(id);
      `,
      },
      // A return annotation spelled as a type alias resolves to the same
      // statement of intent.
      {
        code: `
        interface User {
          name: string;
        }
        type UserRef = DocumentReference<User>;
        const getUserRef = (id: string): UserRef => db.collection('users').doc(id);
      `,
      },
      // An annotated method, getter and object-literal member each carry the
      // annotation on a FunctionExpression rather than a FunctionDeclaration.
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          getRef(id: string): DocumentReference<User> {
            return db.collection('users').doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          get ref(): DocumentReference<User> {
            return db.collection('users').doc(this.id);
          }
        }
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const userRepository = {
          getRef(id: string): DocumentReference<User> {
            return db.collection('users').doc(id);
          },
        };
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const userRepository = {
          getRef: (id: string): DocumentReference<User> =>
            db.collection('users').doc(id),
        };
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          getRef = (id: string): DocumentReference<User> =>
            db.collection('users').doc(id);
        }
      `,
      },
      // A return annotation constrains every return path, not just the ones
      // written directly in the function body.
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = (id: string): DocumentReference<User> => {
          if (id) {
            return db.collection('users').doc(id);
          }
          return db.collection('users').doc('fallback');
        };
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        function getUserRef(id: string): DocumentReference<User> {
          if (id) {
            return db.collection('users').doc(id);
          }
          return db.collection('users').doc('fallback');
        }
      `,
      },
      // A concise body reached through a wrapper node — the `ChainExpression`
      // an optional link interposes, or an `await` — is still the body.
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = (id: string): DocumentReference<User> =>
          db?.collection('users').doc(id);
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const getUserRef = async (id: string): Promise<DocumentReference<User>> =>
          await db.collection('users').doc(id);
      `,
      },
      // An immediately invoked arrow annotates its result the same way.
      {
        code: `
        interface User {
          name: string;
        }
        const userRef = ((): DocumentReference<User> =>
          db.collection('users').doc(userId))();
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
      // Compat Firestore from @firebase/rules-unit-testing accepts NO type argument
      // on .doc()/.collection() — TS2558 — so the generic is impossible to supply.
      {
        code: `
    import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

    const run = async () => {
      const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
      const db = testEnv.authenticatedContext('owner-uid').firestore();
      return db.doc('User/uid/OverlaySettings/uid').get();
    };
  `,
      },
      // The compat handle used inline, with no intermediate variable
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const ref = testEnv.authenticatedContext('u').firestore().doc('User/uid');
          return ref.get();
        };
      `,
      },
      // Unauthenticated rules-test context yields the same compat Firestore
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.unauthenticatedContext().firestore();
          return db.doc('User/uid').get();
        };
      `,
      },
      // Seed callback whose parameter is annotated with the module's context type
      {
        code: `
        import { initializeTestEnvironment, RulesTestContext } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          await testEnv.withSecurityRulesDisabled(async (ctx: RulesTestContext) => {
            await ctx.firestore().doc('User/uid').set({ hidden: true });
          });
        };
      `,
      },
      // Type-only import of the context type still identifies the compat surface
      {
        code: `
        import type { RulesTestContext } from '@firebase/rules-unit-testing';
        export const seed = (ctx: RulesTestContext) => ctx.firestore().doc('User/uid');
      `,
      },
      // Inline type specifier is equivalent to a type-only import declaration
      {
        code: `
        import { initializeTestEnvironment, type RulesTestContext } from '@firebase/rules-unit-testing';
        export const seed = (ctx: RulesTestContext) => ctx.firestore().doc('User/uid');
        export const init = initializeTestEnvironment;
      `,
      },
      // .collection() on a compat Firestore is equally impossible to parameterize
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          const users = db.collection('User');
          return users.get();
        };
      `,
      },
      // .collectionGroup() on a compat Firestore
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          const settings = db.collectionGroup('OverlaySettings');
          return settings.get();
        };
      `,
      },
      // Aliased named import
      {
        code: `
        import { initializeTestEnvironment as initTestEnv } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initTestEnv({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
      },
      // Namespace import
      {
        code: `
        import * as rut from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await rut.initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
      },
      // Namespace-qualified parameter annotation
      {
        code: `
        import * as rut from '@firebase/rules-unit-testing';
        export const seed = (ctx: rut.RulesTestContext) => ctx.firestore().doc('User/uid');
      `,
      },
      // Default import
      {
        code: `
        import rulesUnitTesting from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await rulesUnitTesting.initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
      },
      // Multi-hop const chain from the test environment to the compat Firestore
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const ctx = testEnv.authenticatedContext('u');
          const db = ctx.firestore();
          return db.doc('User/uid').get();
        };
      `,
      },
      // The receiver reached through an `as` assertion still traces
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore() as CompatFirestore;
          return db.doc('User/uid').get();
        };
      `,
      },
      // Non-null assertion between the context and the compat Firestore
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore()!;
          return db.doc('User/uid').get();
        };
      `,
      },
      // Optional chaining between the context and the compat Firestore
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u')?.firestore();
          return db?.doc('User/uid').get();
        };
      `,
      },
      // The reported shape from the issue: the reference nested inside assertSucceeds
      {
        code: `
        import { assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('owner-uid').firestore();
          await assertSucceeds(db.doc('User/uid/OverlaySettings/uid').get());
        };
      `,
      },
      // A compat Firestore declared with the module's own Firestore type
      {
        code: `
        import type { RulesTestContext } from '@firebase/rules-unit-testing';
        const seed = (ctx: RulesTestContext) => {
          const db = ctx.firestore();
          return db.collection('User').doc('uid').set({ hidden: true });
        };
      `,
      },
      // The environment handle is created in beforeAll, so it cannot be a const.
      // Its annotation binds every assignment, which a plain initializer cannot.
      {
        code: `
        import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
        let testEnv: RulesTestEnvironment;
        beforeAll(async () => {
          testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
        });
        it('reads', async () => {
          const db = testEnv.authenticatedContext('owner-uid').firestore();
          await db.doc('User/uid/OverlaySettings/uid').get();
        });
      `,
      },
      // The same annotated let reaching collection and collectionGroup
      {
        code: `
        import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
        let testEnv: RulesTestEnvironment;
        export const read = async () => {
          const db = testEnv.unauthenticatedContext().firestore();
          await db.collection('User').get();
          await db.collectionGroup('OverlaySettings').get();
        };
      `,
      },
      // A namespace-qualified annotation roots at the namespace binding
      {
        code: `
        import * as rut from '@firebase/rules-unit-testing';
        let testEnv: rut.RulesTestEnvironment;
        export const read = async () => {
          const db = testEnv.authenticatedContext('u').firestore();
          await db.doc('User/uid').get();
        };
      `,
      },
      // The documented withSecurityRulesDisabled spelling leaves the parameter
      // unannotated, so the call it belongs to is the only evidence of surface
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await ctx.firestore().doc('User/uid').set({ hidden: true });
          });
        };
      `,
      },
      // The unannotated callback parameter reached through an annotated let
      {
        code: `
        import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
        let testEnv: RulesTestEnvironment;
        beforeEach(async () => {
          await testEnv.withSecurityRulesDisabled(async (context) => {
            const seed = context.firestore();
            await seed.doc('User/owner-uid').set({ username: 'owner' });
            await seed.collection('User').doc('other-uid').set({ username: 'x' });
          });
        });
      `,
      },
      // A helper hop: what the helper returns decides the surface
      {
        code: `
        import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
        let testEnv: RulesTestEnvironment;
        const getDb = () => testEnv.authenticatedContext('u').firestore();
        export const read = async () => {
          const db = getDb();
          await db.doc('User/uid').get();
        };
      `,
      },
      // The same helper written with a block body and an explicit return
      {
        code: `
        import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
        let testEnv: RulesTestEnvironment;
        function getDb() {
          return testEnv.unauthenticatedContext().firestore();
        }
        export const read = async () => {
          await getDb().doc('User/uid').get();
        };
      `,
      },
      // The environment is provisioned by a shared module of the project rather
      // than constructed here. That module hands back the same compat handle,
      // so `.doc()` still takes zero type arguments; the chain carries the
      // evidence through the boundary this rule declines to cross.
      {
        code: `
        import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
        import { provisionRulesTestEnvironment } from './util/rulesTestEnvironment';

        const getTestEnv = provisionRulesTestEnvironment('demo-project');

        const getOwnerDb = () => {
          return getTestEnv().authenticatedContext('owner-uid').firestore();
        };

        export const seed = async () => {
          await getTestEnv().withSecurityRulesDisabled(async (context) => {
            const seedDb = context.firestore();
            await seedDb.doc('Tournament/t1').set({ ownerUserId: 'owner-uid' });
          });
        };

        export const probe = async () => {
          await assertSucceeds(getOwnerDb().doc('Tournament/t1').get());
          await assertFails(
            getOwnerDb().doc('Tournament/t1').update({ isEnabled: 'not-a-bool' }),
          );
        };
      `,
      },
      // The shared module re-exports the assertions too, so the linted file
      // holds no rules-unit-testing import of its own
      {
        code: `
        import { getTestEnv, assertFails } from './util/rulesTestEnvironment';

        export const probe = async () => {
          await assertFails(
            getTestEnv().unauthenticatedContext().firestore().doc('Tournament/t1').get(),
          );
        };
      `,
      },
      // The environment crosses the boundary as a value rather than an accessor
      {
        code: `
        import { assertSucceeds } from '@firebase/rules-unit-testing';
        import { testEnv } from './util/rulesTestEnvironment';

        export const probe = async () => {
          await assertSucceeds(
            testEnv.authenticatedContext('u').firestore().doc('Tournament/t1').get(),
          );
        };
      `,
      },
      // .collection() and .collectionGroup() cross the boundary on the same terms
      {
        code: `
        import { getTestEnv } from './util/rulesTestEnvironment';
        export const read = async () => {
          const db = getTestEnv().authenticatedContext('u').firestore();
          await db.collection('Tournament').get();
          await db.collectionGroup('Match').get();
        };
      `,
      },
      // A parent-relative specifier names a module of the project just as a
      // sibling-relative one does
      {
        code: `
        import { getTestEnv } from '../util/rulesTestEnvironment';
        export const read = async () => {
          await getTestEnv().unauthenticatedContext().firestore().doc('Tournament/t1').get();
        };
      `,
      },
      // A class method with no return annotation still supplies the schema
      // through the expression it returns. `no-explicit-return-type` deletes
      // the annotation, so the annotation cannot be the only evidence read.
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          private getSettingsCollection() {
            return db.collection<Settings>('settings');
          }

          getSettingsDoc(id: string) {
            return this.getSettingsCollection().doc(id);
          }
        }
      `,
      },
      // The getter form of the same shape
      {
        code: `
        interface Doc {
          value: string;
        }
        class DocService {
          private get typedCollection() {
            return db.collection<Doc>('things');
          }

          getDoc(id: string) {
            return this.typedCollection.doc(id);
          }
        }
      `,
      },
      // An expression-bodied arrow property returning a typed collection
      {
        code: `
        interface Doc {
          value: string;
        }
        class DocService {
          private typedCollection = () => db.collection<Doc>('things');

          getDoc(id: string) {
            return this.typedCollection().doc(id);
          }
        }
      `,
      },
      // A method returning a typed collection held in a const still resolves
      {
        code: `
        interface Doc {
          value: string;
        }
        const typedCollection = db.collection<Doc>('things');
        class DocService {
          private getCollection() {
            return typedCollection;
          }

          getDoc(id: string) {
            return this.getCollection().doc(id);
          }
        }
      `,
      },
      // A method hop: the inner method carries the evidence, the outer relays it
      {
        code: `
        interface Doc {
          value: string;
        }
        class DocService {
          private getInner() {
            return db.collection<Doc>('things');
          }

          private getOuter() {
            return this.getInner();
          }

          getDoc(id: string) {
            return this.getOuter().doc(id);
          }
        }
      `,
      },
      // An explicit annotation still wins where it is present
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          private getSettingsCollection(): CollectionReference<Settings> {
            return getSettings();
          }

          getSettingsDoc(id: string) {
            return this.getSettingsCollection().doc(id);
          }
        }
      `,
      },

      // Alias twins of the interface controls above. Named-generic resolution
      // reads both spellings, so a compliant schema stays silent whichever one
      // it is written in.
      // Nested alias referenced from another alias
      {
        code: `
        type Address = {
          street: string;
          city: string;
        };
        type User = {
          name: string;
          addresses: Address[];
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // Intersection of two aliases
      {
        code: `
        type Timestamps = {
          createdAt: Date;
          updatedAt: Date;
        };
        type User = {
          name: string;
        };
        const userRef: DocumentReference<User & Timestamps> = db.collection('users').doc(userId);
      `,
      },
      // Alias carrying its own type parameter
      {
        code: `
        type Collection<T> = {
          data: T;
        };
        type User = {
          name: string;
        };
        const ref: DocumentReference<Collection<User>> = db.collection('collections').doc(id);
      `,
      },
      // Deeply nested object members
      {
        code: `
        type User = {
          name: string;
          metadata: {
            lastLogin: Date;
            preferences: {
              theme: 'light' | 'dark';
              notifications: boolean;
            };
          };
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // Optional properties
      {
        code: `
        type User = {
          name: string;
          middleName?: string;
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // Readonly applied at the reference
      {
        code: `
        type User = {
          readonly id: string;
          name: string;
        };
        const userRef: DocumentReference<Readonly<User>> = db.collection('users').doc(userId);
      `,
      },
      // Readonly applied inside the alias: one field-preserving wrapper is
      // looked through, so the members are read and found compliant
      {
        code: `
        type User = Readonly<{
          name: string;
          age: number;
        }>;
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // Alias on a class member annotation
      {
        code: `
        type User = {
          name: string;
        };
        class UserService {
          private userRef: DocumentReference<User>;
          constructor(id: string) {
            this.userRef = db.collection('users').doc(id);
          }
        }
      `,
      },
      // Alias on CollectionReference
      {
        code: `
        type User = {
          name: string;
          age: number;
        };
        const usersCollection: CollectionReference<User> = db.collection('users');
      `,
      },
      // Alias on CollectionGroup
      {
        code: `
        type Product = {
          name: string;
          price: number;
        };
        const productsGroup: CollectionGroup<Product> = db.collectionGroup('products');
      `,
      },
      // Alias supplied at the call site
      {
        code: `
        type User = {
          name: string;
          age: number;
        };
        const userRef = db.collection<User>('users').doc<User>(userId);
      `,
      },
      // Alias schema on a typed collection bound to a const, then .doc()
      {
        code: `
        type UserData = {
          name: string;
        };
        const typedUsersCollection = db.collection<UserData>('users');
        const typedUserDoc = typedUsersCollection.doc('123');
      `,
      },
      // Alias schema reached through a class member's returned expression
      {
        code: `
        type Settings = {
          theme: string;
        };
        class ConfigService {
          private getSettingsCollection() {
            return db.collection<Settings>('settings');
          }

          getSettingsDoc(id: string) {
            return this.getSettingsCollection().doc(id);
          }
        }
      `,
      },
      // A self-referential alias must terminate rather than recurse forever
      {
        code: `
        type TreeNode = {
          label: string;
          child: TreeNode;
        };
        const nodeRef: DocumentReference<TreeNode> = db.collection('nodes').doc(id);
      `,
      },

      // Boundaries of named-generic resolution. Each of these leaves the
      // schema unresolved, which is silence by design: the rule prefers a
      // missed nested `any` to a report it cannot justify syntactically.
      // An alias to a union has no single member list to read
      {
        code: `
        type User = { data: any } | { name: string };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // An alias to an imported type resolves to nothing in this file
      {
        code: `
        import { UserData } from './types';
        type User = UserData;
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
      },
      // An imported name used as the generic directly is declared in another
      // file, which this rule does not open. Widening the search to every
      // enclosing scope must not be read as reaching across the import.
      {
        code: `
        import { UserData } from './types';
        const userRef: DocumentReference<UserData> = db.collection('users').doc(userId);
      `,
      },
      {
        code: `
        import type { UserData } from './types';
        function scope() {
          const userRef: DocumentReference<UserData> = db.collection('users').doc('1');
          return userRef;
        }
      `,
      },
      // A wrapper that can drop fields stays unresolved wherever it is
      // declared: an exported `Omit` alias is no more readable than a local one
      {
        code: `
        export type BaseUser = {
          name: string;
          audit: any;
        };
        export type SafeUser = Omit<BaseUser, 'audit'>;
        const userRef: DocumentReference<SafeUser> = db.collection('users').doc(id);
      `,
      },
      // A wrapper that can drop fields is not looked through: the members it
      // is given are not the document's members
      {
        code: `
        type BaseUser = {
          name: string;
          audit: any;
        };
        type PartialUser = Partial<BaseUser>;
        const userRef: DocumentReference<PartialUser> = db.collection('users').doc(id);
      `,
      },
      // A name declared in a sibling scope is not in scope at the reference,
      // so it resolves to nothing and the generic goes unchecked
      {
        code: `
        function elsewhere() {
          type User = {
            data: any;
          };
          return null as unknown as User;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc('1');
      `,
      },
      // An inner declaration shadows the same name declared outside, so the
      // clean inner shape is what decides
      {
        code: `
        type User = {
          data: any;
        };
        function scope() {
          type User = {
            data: string;
          };
          const userRef: DocumentReference<User> = db.collection('users').doc('1');
          return userRef;
        }
      `,
      },
      // A named empty declaration is not the inline `{}` the invalid-generic
      // check targets, so neither spelling reports it
      {
        code: `
        interface Empty {}
        const userRef: DocumentReference<Empty> = db.collection('users').doc(userId);
      `,
      },
      {
        code: `
        type Empty = {};
        const userRef: DocumentReference<Empty> = db.collection('users').doc(userId);
      `,
      },
      // A properly-typed namespaced reference is as correct as the bare form —
      // the #1754 widening must not turn agora's 7 existing qualified,
      // correctly-generic references into reports.
      {
        code: `const userRef: FirebaseFirestore.DocumentReference<User> = db.collection('users').doc(userId);`,
      },
      {
        code: `const usersCollection: admin.firestore.CollectionReference<User> = db.collection('users');`,
      },
      {
        code: `const groupRef = doc as FirebaseFirestore.DocumentReference<TGroup>;`,
      },
      /**
       * Optional links (issue #1826). `a?.b` interposes a `ChainExpression`
       * between the member/call and its parent, and that link perturbs
       * nullability, not the document schema: `db?.collection<T>('x')` is
       * `CollectionReference<T> | undefined`, still carrying `T`. Every
       * `.doc()` below therefore inherits a schema and needs no generic of its
       * own — asking for one is uncompilable, since `CollectionReference<T>
       * .doc(path: string)` declares zero type parameters.
       */
      {
        code: `
        interface Product {
          name: string;
        }
        const productsCollection = db?.collection<Product>('products');
        const productRef = productsCollection.doc('id');
      `,
      },
      {
        code: `
        interface Product {
          name: string;
        }
        db?.collection<Product>('products').doc('id');
      `,
      },
      {
        code: `
        interface Product {
          name: string;
        }
        db.collection<Product>('products')?.doc('id');
      `,
      },
      // An optional link in the middle of a multi-line chain: the schema the
      // last `.collection<UserData>` states is what the trailing `.doc()`
      // inherits, whichever link is optional.
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
          ?.collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
      },
      {
        code: `
        interface TenantData {
          name: string;
        }
        interface UserData {
          name: string;
        }
        const usersCollection = db
          ?.collection<TenantData>('tenants')
          .doc('1')
          .collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
      },
      // A typed class property reached through an optional link.
      {
        code: `
        interface TaskDoc {
          title: string;
        }
        class TaskService {
          private _collection: CollectionReference<TaskDoc>;
          constructor() {
            this._collection = db.collection<TaskDoc>('tasks');
          }
          getDoc(id: string) {
            return this._collection?.doc(id);
          }
        }
      `,
      },
      // Parenthesizing ends the chain, so the ChainExpression lands directly on
      // the `.doc()` receiver rather than wrapping the whole expression.
      {
        code: `
        interface Product {
          name: string;
        }
        const productRef = (db?.collection<Product>('products')).doc('id');
      `,
      },
      // The getter's returned expression is the fallback evidence once
      // `no-explicit-return-type` has stripped the annotation, and an optional
      // link does not change the collection it hands back.
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
            return this?._collection;
          }
          getDoc(id: string) {
            return this.collection.doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Doc {
          value: string;
        }
        class DocService {
          private getInner() {
            return db.collection<Doc>('things');
          }
          private getOuter() {
            return this?.getInner();
          }
          getDoc(id: string) {
            return this.getOuter().doc(id);
          }
        }
      `,
      },
      /**
       * A member declared with the ECMA `#` spelling holds the same schema
       * evidence as the `private` spelling of the same declaration, and the two
       * are mutually exclusive: `private #foo` is TS18010, so an author on the
       * `#` side cannot opt back into resolution by adding the modifier. Each
       * case below is the `private` fixture above respelled, and must stay
       * silent for the same reason (#1936).
       */
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          #userRef: DocumentReference<User>;
          constructor(id: string) {
            this.#userRef = db.collection('users').doc(id);
          }
        }
      `,
      },
      // Isolation control: renaming the member while keeping `private` leaves
      // the verdict unchanged, so the delta above belongs to the key node type
      // rather than to the member's name.
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          private zzzRef: DocumentReference<User>;
          constructor(id: string) {
            this.zzzRef = db.collection('users').doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          #users: CollectionReference<User> = db.collection<User>('users');
          getUser(id: string) {
            return this.#users.doc(id);
          }
        }
      `,
      },
      // The rule's own documented "Correct" example, respelled with `#`.
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          #getSettingsCollection() {
            return db.collection<Settings>('settings');
          }
          getSettingsDoc(id: string) {
            return this.#getSettingsCollection().doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          #getSettingsCollection(): CollectionReference<Settings> {
            return db.collection<Settings>('settings');
          }
          getSettingsDoc(id: string) {
            return this.#getSettingsCollection().doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          get #settings() {
            return db.collection<Settings>('settings');
          }
          getSettingsDoc(id: string) {
            return this.#settings.doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          #settings = () => db.collection<Settings>('settings');
          getSettingsDoc(id: string) {
            return this.#settings().doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          static #settings() {
            return db.collection<Settings>('settings');
          }
          static getSettingsDoc(id: string) {
            return this.#settings().doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Task {
          id: string;
        }
        class TaskService {
          #collections: { tasks: CollectionReference<Task> } = {
            tasks: db.collection<Task>('tasks'),
          };
          getTask(id: string) {
            return this.#collections.tasks.doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Doc {
          value: string;
        }
        class DocService {
          #getInner() {
            return db.collection<Doc>('things');
          }
          #getOuter() {
            return this.#getInner();
          }
          getDoc(id: string) {
            return this.#getOuter().doc(id);
          }
        }
      `,
      },
      /**
       * `#settings` and a sibling public `settings` are two distinct members,
       * so resolution has to agree on the spelling as well as the bare word.
       * Matching on the name alone would answer for the private member using
       * the public member's evidence — here the public sibling carries none,
       * and a name-only lookup finds it first and reports.
       */
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          settings;
          #settings: CollectionReference<Settings> = db.collection<Settings>('settings');
          getSettingsDoc(id: string) {
            return this.#settings.doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          getCollection() {
            return externalCollection;
          }
          #getCollection() {
            return db.collection<Settings>('settings');
          }
          getSettingsDoc(id: string) {
            return this.#getCollection().doc(id);
          }
        }
      `,
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          get collection() {
            return externalCollection;
          }
          get #collection() {
            return db.collection<Settings>('settings');
          }
          getSettingsDoc(id: string) {
            return this.#collection.doc(id);
          }
        }
      `,
      },
      /**
       * The boundary the #2007 narrowing must not cross: an assertion that
       * names a Firestore reference type states the schema wherever it sits,
       * so distance is not what disqualifies `as const` — naming no reference
       * type is. Every spelling below keeps its exemption.
       */
      {
        code: `
        interface User {
          name: string;
        }
        const usersCollections = [
          db.collection('users'),
          db.collection('admins'),
        ] as CollectionReference<User>[];
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const collections = {
          users: db.collection('users'),
        } as Record<string, CollectionReference<User>>;
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const userRef = db.doc('users/123') as unknown as DocumentReference<User>;
      `,
      },
      {
        code: `
        interface User {
          name: string;
        }
        const userRef = db.collection('users').doc('123') as FirebaseFirestore.DocumentReference<User>;
      `,
      },
      // A local alias for the reference type states the same schema the type it
      // stands for does, so the assertion is resolved before it is judged.
      {
        code: `
        interface User {
          name: string;
        }
        type UsersCollection = CollectionReference<User>;
        const usersCollection = db.collection('users') as UsersCollection;
      `,
      },
      // `Query` carries the same document generic as the reference types it is
      // the supertype of, so asserting to it states the schema too.
      {
        code: `
        interface User {
          name: string;
        }
        const activeUsers = db.collection('users') as Query<User>;
      `,
      },
      /**
       * An assertion on the receiver states the schema `.doc()` inherits, so
       * asking for a generic there is uncompilable: `CollectionReference<T>
       * .doc(path)` declares zero type parameters. The exemption has to come
       * from the receiver, not from an enclosing annotation that happens to
       * cover the statement — once `as const` stops standing in for one, that
       * cover is gone.
       */
      {
        code: `
        interface Mapping {
          placement: number;
        }
        const priorMappingRef = (
          matchRef.collection('mappings') as CollectionReference<Mapping>
        ).doc(matchId);
      `,
      },
      {
        code: `
        interface Mapping {
          placement: number;
        }
        const REFS = [
          (matchRef.collection('mappings') as CollectionReference<Mapping>).doc(matchId),
        ] as const;
      `,
      },
      /**
       * A Firestore reference type declared as an interface MEMBER states the
       * document schema exactly as the same member states it in the type alias
       * `prefer-type-over-interface --fix` rewrites that interface into. Reading
       * only the `extends` clause made the two spellings disagree, so an
       * assertion naming the member drew a report the file already answers, and
       * the suggested remedy was uncompilable: the operand `db.doc(path)`
       * declares no type parameters for a generic to go in (#2189).
       */
      {
        code: `
        type User = { name: string };
        interface Schema { user: DocumentReference<User> }
        const userRef = db.doc('users/1') as Schema['user'];
      `,
      },
      // The alias spelling of the same declaration, which one `eslint --fix`
      // pass turns the case above into with no semantic change. It is the
      // control the interface arm has to answer alike.
      {
        code: `
        type User = { name: string };
        type Schema = { user: DocumentReference<User> };
        const userRef = db.doc('users/1') as Schema['user'];
      `,
      },
      {
        code: `
        type User = { name: string };
        interface Schema { users: CollectionReference<User> }
        const usersCollection = db.collection('users') as Schema['users'];
      `,
      },
      // The member holding the schema may be declared on a base interface, so
      // the heritage clause and the body have to be read on the same walk
      // rather than as alternatives.
      {
        code: `
        type User = { name: string };
        interface Base { user: DocumentReference<User> }
        interface Schema extends Base {}
        const userRef = db.doc('users/1') as Schema['user'];
      `,
      },
      // `export` is not a distinction the document shape knows anything about.
      {
        code: `
        type User = { name: string };
        export interface Schema { user: DocumentReference<User> }
        const userRef = db.doc('users/1') as Schema['user'];
      `,
      },
      // The heritage arm this fix widens rather than replaces: a reference type
      // named in `extends` states the schema of the interface that inherits it.
      {
        code: `
        type User = { name: string };
        interface UserRef extends DocumentReference<User> {}
        const userRef = db.doc('users/1') as UserRef;
      `,
      },

      // A type parameter shadows a same-named declaration for every type
      // position inside it, so the outer `any`-carrying alias says nothing
      // about this reference and cannot justify a report (#2258). Spelled as an
      // alias rather than an interface because the shadow is independent of the
      // declaration spelling, and the interface spelling would enlarge this
      // suite's documented disagreement with `prefer-type-over-interface`
      // without testing anything further.
      {
        code: `
        type User = { data: any };
        function getUserRef<User>(id: string) {
          const userRef: DocumentReference<User> = db.collection('users').doc(id);
          return userRef;
        }
      `,
      },

      // The same shadowing where the binder is a class rather than a function.
      {
        code: `
        type User = { data: any };
        class Repo<User> {
          ref!: DocumentReference<User>;
        }
      `,
      },
    ],
    invalid: [
      // Over-decline control for the shadow test (#2258): a PARAMETER named
      // `User` binds only in value space, so the interface still answers here
      // and the report must survive. Declining on any same-named binder would
      // silence this.
      {
        code: `
        type User = { data: any };
        function getUserRef(User: string) {
          const userRef: DocumentReference<User> = db.collection('users').doc(User);
          return userRef;
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },

      /**
       * Crediting the return annotation on every function spelling (#1909) is
       * bounded by two things: the annotation has to exist, and it has to
       * describe the value the expression becomes. The cases below hold each
       * boundary from the arrow side, where the widening applies.
       */
      // No annotation to credit, in any of the three spellings.
      {
        code: `
        const getRef = async () => {
          return db.collection('users').doc(userId);
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `const getRef = (id: string) => db.collection('users').doc(id);`,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        const getRef = function (id: string) {
          return db.collection('users').doc(id);
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `const getUsers = () => db.collection('users');`,
        errors: [missingGenericError('CollectionReference')],
      },
      {
        code: `const getPosts = () => db.collectionGroup('posts');`,
        errors: [missingGenericError('CollectionGroup')],
      },
      // An annotation that names the reference type without a schema is still
      // the violation this rule exists to report, in both spellings.
      {
        code: `
        const getRef = async (): Promise<DocumentReference> =>
          db.collection('users').doc(userId);
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        async function getRef(): Promise<DocumentReference> {
          return db.collection('users').doc(userId);
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        const getRef = (): DocumentReference<any> =>
          db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A reference built inside an annotated function but never returned is
      // described by nothing, so the annotation must not exempt it.
      {
        code: `
        interface User {
          name: string;
        }
        const getId = (): string => {
          const ref = db.collection('users').doc(userId);
          return ref.id;
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        interface User {
          name: string;
        }
        const logRef = (): void => {
          db.collection('users').doc(userId);
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // An inner function owns its own returns, so the outer annotation says
      // nothing about them.
      {
        code: `
        interface User {
          name: string;
        }
        const getRef = (): DocumentReference<User> => {
          const getLog = () => db.collection('logs').doc(logId);
          return db.collection('users').doc(userId);
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        interface User {
          name: string;
        }
        class UserService {
          getRef(id: string): DocumentReference<User> {
            const getLog = function () {
              return db.collection('logs').doc(id);
            };
            return db.collection('users').doc(id);
          }
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      /**
       * Namespaced spellings of the same types (issue #1754). The namespace is
       * arbitrary — `FirebaseFirestore.`, `admin.firestore.` and any
       * `import * as fs from 'firebase-admin/firestore'` alias all name these
       * types — so detection keys on the rightmost segment.
       */
      {
        code: `const userRef: FirebaseFirestore.DocumentReference = db.collection('users').doc(userId);`,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `const usersCollection: FirebaseFirestore.CollectionReference = db.collection('users');`,
        errors: [missingGenericError('CollectionReference')],
      },
      {
        code: `const productsGroup: FirebaseFirestore.CollectionGroup = db.collectionGroup('products');`,
        errors: [missingGenericError('CollectionGroup')],
      },
      {
        code: `const userRef: admin.firestore.DocumentReference = db.collection('users').doc(userId);`,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `const userRef: FirebaseFirestore.DocumentReference<any> = db.collection('users').doc(userId);`,
        errors: [invalidGenericError('DocumentReference')],
      },
      // The two shapes agora actually writes: a parameter, and an array of them.
      {
        code: `function handler(roundRef: FirebaseFirestore.DocumentReference) { return roundRef; }`,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `function handler(refs: readonly FirebaseFirestore.DocumentReference[]) { return refs; }`,
        errors: [missingGenericError('DocumentReference')],
      },
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
      // The same invalid generic on a .doc() call whose receiver is an UNTYPED
      // collection. A typed receiver short-circuits into its own branch, so this
      // is the only shape that reaches the invalid-generic check on the
      // untyped-receiver path.
      {
        code: `const userRef = db.collection('users').doc<any>('user123');`,
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
      // The alias twin of the case above. `prefer-type-over-interface` ships in
      // the same recommended config and is fixable, so this is the spelling a
      // codebase running the config actually has.
      {
        code: `
        type User = {
          data: any;
        };
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
      // The Admin SDK supports the generic, so the same shape keeps reporting
      {
        code: `
        import { getFirestore } from 'firebase-admin/firestore';
        const run = async () => {
          const db = getFirestore();
          return db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // The exemption keys on the module specifier, not on the call shape
      {
        code: `
        import { initializeTestEnvironment } from 'firebase/firestore';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Without the import there is nothing to trace the receiver back to
      {
        code: `
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A mutable receiver can be reassigned to an Admin SDK handle, so it is refused
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          let db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A mutable binding anywhere along the chain breaks the trace
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          let testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          return db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // The gate is the receiver, not the file: an Admin handle in a rules test reports
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import { getFirestore } from 'firebase-admin/firestore';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const compatDb = testEnv.authenticatedContext('u').firestore();
          const adminDb = getFirestore();
          await compatDb.doc('User/uid').get();
          return adminDb.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // The same receiver gate applies to .collection() and .collectionGroup()
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import { getFirestore } from 'firebase-admin/firestore';
        const adminDb = getFirestore();
        const users = adminDb.collection('User');
        const settings = adminDb.collectionGroup('OverlaySettings');
        export const env = initializeTestEnvironment;
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('CollectionGroup'),
        ],
      },
      // The modular doc() function does accept the generic, so it keeps reporting
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import { doc, getFirestore } from 'firebase/firestore';
        const db = getFirestore();
        const ref = doc(db, 'User/uid');
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // An explicit DocumentReference annotation still needs its generic
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          const db = testEnv.authenticatedContext('u').firestore();
          const ref: DocumentReference = db.doc('User/uid');
          return ref.get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // withSecurityRulesDisabled on a receiver unrelated to the module
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const harness = {
          withSecurityRulesDisabled: (fn: (ctx: any) => void) => fn(null),
        };
        export const seed = () => {
          harness.withSecurityRulesDisabled((ctx) => {
            ctx.firestore().doc('User/uid').set({ hidden: true });
          });
        };
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A different callback method on a traced environment is not the context API
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          await (testEnv as any).withSomeOtherCallback(async (ctx) => {
            await ctx.firestore().doc('User/uid').set({ hidden: true });
          });
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // An annotated let whose type is an Admin SDK surface is not exempt
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import type { Firestore } from 'firebase-admin/firestore';
        let adminDb: Firestore;
        export const read = async () => {
          await adminDb.doc('User/uid').get();
        };
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A helper returning an Admin SDK handle is not exempt
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import { getFirestore } from 'firebase-admin/firestore';
        const getAdminDb = () => getFirestore();
        export const read = async () => {
          const db = getAdminDb();
          await db.doc('User/uid').get();
        };
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A helper whose block body returns an Admin SDK handle is not exempt
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import { getFirestore } from 'firebase-admin/firestore';
        const getAdminDb = () => {
          return getFirestore();
        };
        export const read = async () => {
          const db = getAdminDb();
          await db.doc('User/uid').get();
        };
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Crossing a project module is not on its own a reason to exempt: an
      // Admin handle imported from one supports the generic and keeps reporting
      {
        code: `
        import { adminDb } from './util/adminFirestore';
        export const seed = async () => {
          await adminDb.doc('Tournament/t1').set({ ownerUserId: 'owner-uid' });
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A `firestore()` with no context factory before it is the Admin spelling,
      // so half the context signature exempts nothing
      {
        code: `
        import { getApp } from './util/firebaseApp';
        export const read = async () => {
          await getApp().firestore().doc('Tournament/t1').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // The context signature is not credited on its own either: a bare
      // specifier names a package whose Firestore surface takes the generic
      {
        code: `
        import { getTestEnv } from 'some-testing-package';
        export const probe = async () => {
          await getTestEnv().authenticatedContext('u').firestore().doc('Tournament/t1').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A locally declared type that merely shares the name is not the compat
      // surface, whatever else the file imports
      {
        code: `
        import { PROJECT_ID } from './util/constants';
        type RulesTestEnvironment = {
          authenticatedContext(uid: string): {
            firestore(): { doc(path: string): { get(): Promise<unknown> } };
          };
        };
        let env: RulesTestEnvironment;
        export const probe = async () => {
          await env.authenticatedContext(PROJECT_ID).firestore().doc('Tournament/t1').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A mutable binding breaks the trace across the boundary exactly as it
      // does within the file
      {
        code: `
        import { testEnv } from './util/rulesTestEnvironment';
        export const read = async () => {
          let db = testEnv.authenticatedContext('u').firestore();
          await db.doc('Tournament/t1').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // An unannotated let assigned from the environment stays reportable,
      // because nothing constrains a later assignment to the same surface
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        const run = async () => {
          const testEnv = await initializeTestEnvironment({ projectId: 'demo-x' });
          let db = testEnv.authenticatedContext('u').firestore();
          await db.doc('User/uid').get();
        };
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A parameter annotated with an unrelated type is not exempt
      {
        code: `
        import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
        import type { Firestore } from 'firebase-admin/firestore';
        export const seed = (db: Firestore) => db.doc('User/uid');
        export const env = initializeTestEnvironment;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Inferring from the returned expression is not an amnesty: a getter that
      // hands back an untyped collection supplies no schema, so both the
      // collection call and the derived document reference keep reporting.
      {
        code: `
        class DocService {
          private get untypedCollection() {
            return db.collection('things');
          }

          getDoc(id: string) {
            return this.untypedCollection.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // The same for a method hop that never reaches a typed collection
      {
        code: `
        class DocService {
          private getInner() {
            return db.collection('things');
          }

          private getOuter() {
            return this.getInner();
          }

          getDoc(id: string) {
            return this.getOuter().doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      // A self-referential getter must terminate rather than recurse forever,
      // and supplies no schema, so the reference still reports.
      {
        code: `
        class DocService {
          get selfReferential() {
            return this.selfReferential;
          }

          getDoc(id: string) {
            return this.selfReferential.doc(id);
          }
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // Mutually recursive methods must terminate for the same reason
      {
        code: `
        class DocService {
          private first() {
            return this.second();
          }

          private second() {
            return this.first();
          }

          getDoc(id: string) {
            return this.first().doc(id);
          }
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // A reference returned from a function carrying no annotation and no
      // call-site generic has no recoverable schema anywhere, so the return
      // position is not itself an exemption.
      {
        code: `
        function getUserRef(id: string) {
          return db.collection('users').doc(id);
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },

      // The issue's exact spelling, paired: the interface control fires and the
      // alias must fire identically.
      {
        code: `
        interface User {
          data: any;
        }
        declare const ref: DocumentReference<User>;
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          data: any;
        };
        declare const ref: DocumentReference<User>;
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // An empty object as a member erases that field either way
      {
        code: `
        interface User {
          config: {};
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          config: {};
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Resolution chains across aliases
      {
        code: `
        type Audit = {
          entries: any;
        };
        type User = {
          name: string;
          audit: Audit;
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // One field-preserving wrapper is looked through, so the erased field is
      // still found
      {
        code: `
        type User = Readonly<{
          data: any;
        }>;
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A declaration is hoisted, so its position relative to the reference
      // does not decide whether it resolves
      {
        code: `
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
        type User = {
          data: any;
        };
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A self-referential alias must terminate and still report the erased
      // field beside the cycle
      {
        code: `
        type TreeNode = {
          child: TreeNode;
          data: any;
        };
        const nodeRef: DocumentReference<TreeNode> = db.collection('nodes').doc(id);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // An exported declaration is the same declaration one node deeper, inside
      // its `export` statement. The `export` keyword says nothing about the
      // document shape, so both spellings report exactly as the bare ones do.
      {
        code: `
        export type User = {
          data: any;
        };
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        export interface User {
          data: any;
        }
        const userRef: DocumentReference<User> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A declaration written in a function body is in scope at a reference in
      // that body, in both spellings
      {
        code: `
        function scope() {
          type User = {
            data: any;
          };
          const userRef: DocumentReference<User> = db.collection('users').doc('1');
          return userRef;
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        function scope() {
          interface User {
            data: any;
          }
          const userRef: DocumentReference<User> = db.collection('users').doc('1');
          return userRef;
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A namespace body is a statement container like any other
      {
        code: `
        namespace Schemas {
          type User = {
            data: any;
          };
          export const userRef: DocumentReference<User> = db.collection('users').doc('1');
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // The search runs outward from the reference, so an outer exported
      // declaration is reached from a reference several scopes in
      {
        code: `
        export type User = {
          data: any;
        };
        const load = async () => {
          if (enabled) {
            const userRef: DocumentReference<User> = db.collection('users').doc('1');
            return userRef;
          }
          return undefined;
        };
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A bare block and a class static block are statement containers too
      {
        code: `
        {
          type User = {
            data: any;
          };
          const userRef: DocumentReference<User> = db.collection('users').doc('1');
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        class Loader {
          static {
            type User = {
              data: any;
            };
            const userRef: DocumentReference<User> = db.collection('users').doc('1');
          }
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // A switch case holds its statements in `consequent` rather than in a
      // block, so it is reached by its own branch of the container list
      {
        code: `
        switch (kind) {
          case 'user':
            type User = {
              data: any;
            };
            const userRef: DocumentReference<User> = db.collection('users').doc('1');
            break;
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // The alias reached through a call-site generic
      {
        code: `
        type User = {
          data: any;
        };
        const usersCollection = db.collection<User>('users');
      `,
        errors: [invalidGenericError('CollectionReference')],
      },
      {
        code: `
        type Product = {
          price: any;
        };
        const productsGroup = db.collectionGroup<Product>('products');
      `,
        errors: [invalidGenericError('CollectionGroup')],
      },
      // A typed collection does not excuse an erased schema on .doc()
      {
        code: `
        type UserData = {
          name: string;
        };
        type AuditData = {
          entries: any;
        };
        const userDoc = db.collection<UserData>('users').doc<AuditData>('123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      // Alias twins of the remaining interface-based invalid cases
      {
        code: `
        type User = {
          data: any;
        };
        class Service {
          private ref: DocumentReference<User>;
          constructor(id: string) {
            this.ref = db.collection('users').doc(id);
          }
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          data: any;
        };
        function process(ref: DocumentReference<User>) {
          return ref.get();
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          data: any;
        };
        async function getRef(): Promise<DocumentReference<User>> {
          return db.collection('users').doc(userId);
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type Base = {
          id: string;
        };
        const ref: DocumentReference<Base & any> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          name: string;
        };
        const ref: DocumentReference<User | {}> = db.collection('users').doc(userId);
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type User = {
          name: string;
          age: number;
        };
        const usersCollection: CollectionReference<User> = db.collection<User>('users');
        const userDoc = usersCollection.doc<any>('user123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type Product = {
          name: string;
          price: number;
        };
        const productDoc = db.collection<Product>('products').doc<{}>('product123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      {
        code: `
        type UserData = {
          name: string;
        };
        let usersCollection = db.collection<UserData>('users');
        usersCollection = db.collection('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        type UserData = {
          name: string;
        };
        const usersCollection = db.collection<UserData>('users');
        const aliasCollection = usersCollection;
        const userDoc = aliasCollection.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        type UserData = {
          name: string;
        };
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
      {
        code: `
        type UserData = {
          name: string;
        };
        let usersCollection = db.collection<UserData>('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        type UserData = {
          name: string;
        };
        const { users } = getCollections<UserData>();
        const userDoc = users.doc('123');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        type UserData = {
          name: string;
        };
        const usersCollection = db.collection<UserData>('users');
        const userDoc = usersCollection.doc<any>('123');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      /**
       * The mirrors of the optional-link valid cases (issue #1826). Looking
       * through a `ChainExpression` must not become a blanket exemption: a
       * chained receiver with no schema to inherit still has to report, or the
       * unwrap would silently switch the rule off for every `?.` spelling.
       */
      {
        code: `
        const productsCollection = db?.collection('products');
        const productRef = productsCollection.doc('id');
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `db?.collection('products').doc('id');`,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `db.collection('products')?.doc('id');`,
        errors: [missingGenericError('DocumentReference')],
      },
      // A reassignable binding can hold an untyped collection by the time it
      // reaches `.doc()`, and an optional link does not make it immutable.
      {
        code: `
        type Product = {
          name: string;
        };
        let productsCollection = db?.collection<Product>('products');
        const productRef = productsCollection.doc('id');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // An explicit `any` on the derived document reference is reported whether
      // or not the collection it came from was reached through `?.`.
      {
        code: `
        type Product = {
          name: string;
        };
        const productsCollection = db?.collection<Product>('products');
        const productRef = productsCollection.doc<any>('id');
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      /**
       * The dedup contract holds across an optional link: an `any` argument is
       * reported once, on the collection call that states it, and not a second
       * time on the document reference derived from it. The error count is the
       * assertion that matters here.
       */
      {
        code: `
        const usersCollection = db?.collection<any>('users');
        const userDoc = usersCollection.doc('123');
      `,
        errors: [invalidGenericError('CollectionReference')],
      },
      /**
       * Resolving the ECMA `#` spelling (#1936) widens which declarations are
       * read, not which references are excused: a `#` member that states no
       * schema keeps reporting exactly as its `private` counterpart does.
       */
      {
        code: `
        class UserService {
          #userRef;
          constructor(id: string) {
            this.#userRef = db.collection('users').doc(id);
          }
        }
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        class UserService {
          #users: CollectionReference = db.collection('users');
          getUser(id: string) {
            return this.#users.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        class ConfigService {
          #getSettingsCollection() {
            return db.collection('settings');
          }
          getSettingsDoc(id: string) {
            return this.#getSettingsCollection().doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        class ConfigService {
          get #settings() {
            return db.collection('settings');
          }
          getSettingsDoc(id: string) {
            return this.#settings.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      /**
       * An annotation stating `any` is reported once, on the annotation that
       * states it. Reading the `#` declaration is what keeps the derived
       * document reference from drawing a second, contradictory report saying
       * the same generic is missing.
       */
      {
        code: `
        class Service {
          #ref: DocumentReference<any>;
          constructor(id: string) {
            this.#ref = db.collection('users').doc(id);
          }
        }
      `,
        errors: [invalidGenericError('DocumentReference')],
      },
      /**
       * The mirror of the sibling-spelling cases in `valid`: a typed public
       * member is not evidence about the `#` member reached at the call site,
       * so the document reference still reports. A name-only lookup would find
       * the public sibling and silence the second error here.
       */
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          settings: CollectionReference<Settings> = db.collection<Settings>('settings');
          #settings = db.collection('settings');
          getSettingsDoc(id: string) {
            return this.#settings.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          getCollection() {
            return db.collection<Settings>('settings');
          }
          #getCollection() {
            return db.collection('settings');
          }
          getSettingsDoc(id: string) {
            return this.#getCollection().doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        interface Settings {
          theme: string;
        }
        class ConfigService {
          get collection() {
            return db.collection<Settings>('settings');
          }
          get #collection() {
            return db.collection('settings');
          }
          getSettingsDoc(id: string) {
            return this.#collection.doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      {
        code: `
        class DocService {
          #getInner() {
            return db.collection('things');
          }
          #getOuter() {
            return this.#getInner();
          }
          getDoc(id: string) {
            return this.#getOuter().doc(id);
          }
        }
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('DocumentReference'),
        ],
      },
      /**
       * A const assertion states no type (#2007). `as const` keeps the
       * operand's own inferred type and only makes it readonly, so every
       * reference beneath one still carries the loose `DocumentData` schema
       * this rule exists to reject — the violation is byte-for-byte
       * unrepaired. `global-const-style` ships `error` in the same recommended
       * config and is fixable, and its fix appends exactly this assertion to a
       * module-scope literal, so an exemption keyed on the mere presence of an
       * ancestor assertion lets one `eslint --fix` pass silence the rule.
       */
      {
        code: `const COLLECTIONS = [db.collection('users'), db.collection('posts')] as const;`,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('CollectionReference'),
        ],
      },
      {
        code: `
        const COLLECTIONS = {
          users: db.collection('users'),
          posts: db.collection('posts'),
        } as const;
      `,
        errors: [
          missingGenericError('CollectionReference'),
          missingGenericError('CollectionReference'),
        ],
      },
      // The minimal repro: the const assertion is the call's own parent, which
      // is why proximity cannot be what distinguishes a typing assertion.
      {
        code: `const usersCollection = db.collection('users') as const;`,
        errors: [missingGenericError('CollectionReference')],
      },
      {
        code: `const userDoc = db.doc('users/123') as const;`,
        errors: [missingGenericError('DocumentReference')],
      },
      // A `.doc()` call nested inside an asserted literal
      {
        code: `const REFS = { user: db.collection('users').doc('123') } as const;`,
        errors: [missingGenericError('DocumentReference')],
      },
      // Three levels of literal between the call and the assertion
      {
        code: `
        const CONFIG = {
          firestore: {
            collections: [db.collection('users')],
          },
        } as const;
      `,
        errors: [missingGenericError('CollectionReference')],
      },
      // `as const` on the declarator whose initializer holds the call, with the
      // reference reached through a nested arrow rather than a literal
      {
        code: `
        const HANDLERS = {
          load: (id: string) => db.collection('users').doc(id),
        } as const;
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `const GROUPS = [db.collectionGroup('comments')] as const;`,
        errors: [missingGenericError('CollectionGroup')],
      },
      // An assertion naming no Firestore reference type states nothing about
      // the document schema either, so it earns no exemption.
      {
        code: `const refs = [db.collection('users')] as unknown[];`,
        errors: [missingGenericError('CollectionReference')],
      },
      {
        code: `const paths = [db.collection('users').doc('1').path] as string[];`,
        errors: [missingGenericError('DocumentReference')],
      },
      // The receiver exemption is bounded by the same question: an assertion
      // that states no schema hands none to the `.doc()` built on it.
      {
        code: `const ref = (matchRef.collection('mappings') as any).doc(matchId);`,
        errors: [missingGenericError('DocumentReference')],
      },
      /**
       * Reading an interface's members (#2189) is bounded by the same question
       * the alias arm answers: the declaration has to actually name a Firestore
       * reference surface. An interface whose members name none states no
       * document schema, so an assertion onto one earns no exemption.
       */
      {
        code: `
        type User = { name: string };
        interface Schema { user: User }
        const userRef = db.doc('users/1') as Schema['user'];
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      {
        code: `
        interface Config { retries: number }
        const usersCollection = db.collection('users') as unknown as Config;
      `,
        errors: [missingGenericError('CollectionReference')],
      },
      // A member that refers back to the interface it is declared on has to
      // terminate the member walk rather than exhaust the stack, and it states
      // no schema on the way out.
      {
        code: `
        interface Loop { self: Loop }
        const userRef = db.doc('users/1') as Loop['self'];
      `,
        errors: [missingGenericError('DocumentReference')],
      },
      // The declaration alone exempts nothing: without an assertion naming it,
      // an interface that states a schema perfectly well is not evidence about
      // a reference built beside it.
      {
        code: `
        type User = { name: string };
        interface Schema { user: DocumentReference<User> }
        const userRef = db.doc('users/1');
      `,
        errors: [missingGenericError('DocumentReference')],
      },
    ],
  },
);

// Both rules ship in the recommended config and `no-explicit-return-type` is
// fixable, so a single `eslint --fix` pass deletes the return annotations this
// rule reads. Schema evidence that lives in the returned expression must
// therefore survive that pass.
describe('enforce-firestore-doc-ref-generic after no-explicit-return-type --fix', () => {
  const TARGET_ID = '@blumintinc/blumint/enforce-firestore-doc-ref-generic';
  const STRIPPER_ID = '@blumintinc/blumint/no-explicit-return-type';
  const FILENAME = 'src/services/ConfigService.ts';

  const SOURCE = [
    'interface Settings {',
    '  theme: string;',
    '}',
    '',
    'export class ConfigService {',
    '  private getSettingsCollection(): CollectionReference<Settings> {',
    "    return db.collection<Settings>('settings');",
    '  }',
    '',
    '  getSettingsDoc(id: string) {',
    '    return this.getSettingsCollection().doc(id);',
    '  }',
    '}',
    '',
  ].join('\n');

  // The remedy this rule asks for lives at the call site, where no fixer in the
  // recommended config can remove it.
  const REMEDIED_SOURCE = [
    'interface User {',
    '  name: string;',
    '}',
    '',
    'export async function getRef(): Promise<DocumentReference<User>> {',
    "  return db.collection<User>('users').doc(userId);",
    '}',
    '',
  ].join('\n');

  const UNTYPED_SOURCE = [
    'export class ConfigService {',
    '  private getSettingsCollection(): CollectionReference {',
    "    return db.collection('settings');",
    '  }',
    '',
    '  getSettingsDoc(id: string) {',
    '    return this.getSettingsCollection().doc(id);',
    '  }',
    '}',
    '',
  ].join('\n');

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      TARGET_ID,
      enforceFirestoreDocRefGeneric as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      STRIPPER_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  it('reports nothing before or after the return annotation is stripped', () => {
    const linter = makeLinter();
    expect(
      linter.verify(SOURCE, configFor({ [TARGET_ID]: 'error' }), FILENAME),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(
      SOURCE,
      configFor({ [STRIPPER_ID]: 'error' }),
      FILENAME,
    );
    // Without this assertion the test passes vacuously whenever the stripper
    // stops rewriting the annotation it is here to remove.
    expect(fixed.output).not.toContain('CollectionReference<Settings>');
    expect(fixed.output).toContain('private getSettingsCollection() {');
    expect(
      linter.verify(
        fixed.output,
        configFor({ [TARGET_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(0);
  });

  it('keeps a call-site generic silent through the same pipeline', () => {
    const linter = makeLinter();
    expect(
      linter.verify(
        REMEDIED_SOURCE,
        configFor({ [TARGET_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(0);

    const fixed = linter.verifyAndFix(
      REMEDIED_SOURCE,
      configFor({ [STRIPPER_ID]: 'error' }),
      FILENAME,
    );
    expect(fixed.output).not.toContain('Promise<DocumentReference<User>>');
    expect(
      linter.verify(
        fixed.output,
        configFor({ [TARGET_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(0);
  });

  it('still reports a genuinely untyped reference through the same pipeline', () => {
    const linter = makeLinter();
    const fixed = linter.verifyAndFix(
      UNTYPED_SOURCE,
      configFor({ [STRIPPER_ID]: 'error' }),
      FILENAME,
    );
    const messages = linter.verify(
      fixed.output,
      configFor({ [TARGET_ID]: 'error' }),
      FILENAME,
    );
    expect(messages.map((message) => message.messageId)).toEqual([
      'missingGeneric',
      'missingGeneric',
    ]);
  });
});

/**
 * `meta.docs.requiresTypeChecking` is load-bearing beyond documentation: it
 * tells consumers to configure a `parserOptions.project`, and repo guards
 * account for their own coverage along that axis — `docs-examples-conformance`
 * counts the "incorrect" fences the declaring rules contribute and floors how
 * many of them report. A rule that declares the flag without consuming type
 * services misstates its contract in both places (#1730).
 *
 * The flag grants no exemption anywhere. A skip would rest on the premise that a
 * `Linter` without a project cannot exercise a type-aware rule at all, and that
 * premise is measured false (#2243) — the parser hands back an isolated
 * single-file program, so the checker answers.
 *
 * The invariant asserted here is agreement, in both directions, between the
 * declaration and the implementation.
 */
describe('requiresTypeChecking must match the implementation (#1730)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-firestore-doc-ref-generic';
  const TYPE_SERVICE = /getParserServices|getTypeChecker|parserServices/;

  const ruleSource = () =>
    readFileSync(
      resolvePath(__dirname, '../rules/enforce-firestore-doc-ref-generic.ts'),
      'utf8',
    );

  it('does not claim type information it never requests', () => {
    const declared =
      enforceFirestoreDocRefGeneric.meta.docs?.requiresTypeChecking === true;
    const consumesTypes = TYPE_SERVICE.test(ruleSource());

    // Non-vacuity: the probe must be able to see a type service where one
    // exists, or "consumesTypes === false" proves nothing about the regex.
    expect(
      TYPE_SERVICE.test(
        readFileSync(
          resolvePath(__dirname, '../rules/no-usememo-for-pass-by-value.ts'),
          'utf8',
        ),
      ),
    ).toBe(true);

    expect(consumesTypes).toBe(false);
    expect(declared).toBe(false);
  });

  it('reports the shapes its docs call incorrect with no program available', () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceFirestoreDocRefGeneric as unknown as Rule.RuleModule,
    );

    // Deliberately no `project`/`tsconfigRootDir`: this is the configuration
    // the flag claims is insufficient, so a report here is the disproof.
    const messages = linter.verify(
      [
        "const userDocRef: DocumentReference = db.doc('users/123');",
        "const usersCollectionUntyped = db.collection('users');",
        "const productDocRef: DocumentReference<any> = db.doc('products/123');",
        "const auditLogDocRef: DocumentReference<{}> = db.doc('audit/123');",
      ].join('\n'),
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2022 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' },
      },
      'src/services/firestore.ts',
    );

    expect(messages.some((message) => message.fatal)).toBe(false);
    expect(messages.map((message) => message.messageId)).toEqual([
      'missingGeneric',
      'missingGeneric',
      'invalidGeneric',
      'invalidGeneric',
    ]);
  });
});
