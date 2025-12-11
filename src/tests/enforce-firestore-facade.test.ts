import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreFacade } from '../rules/enforce-firestore-facade';

ruleTesterTs.run('enforce-firestore-facade', enforceFirestoreFacade, {
  valid: [
    // Valid usage of Set.prototype.delete() - should not trigger the rule
    {
      code: `
        export const PENDING_WRITES_DOCUMENT_IDS = new Set<string>();

        export const addPendingWrite = (docId: string) => {
          PENDING_WRITES_DOCUMENT_IDS.add(docId);
        };

        export const removePendingWrite = (docId: string) => {
          PENDING_WRITES_DOCUMENT_IDS.delete(docId); // This should not trigger an ESLint error
        };

        export const hasPendingWrite = (docId: string) => {
          return PENDING_WRITES_DOCUMENT_IDS.has(docId);
        };
      `,
    },
    // Valid usage of Set.prototype.delete() with variable assignment
    {
      code: `
        let mySet;

        function initializeSet() {
          mySet = new Set<string>();
          mySet.add('item1');
          mySet.add('item2');
        }

        function removeItem(item: string) {
          mySet.delete(item); // This should not trigger an ESLint error
        }

        initializeSet();
        removeItem('item1');
      `,
    },
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
    // Valid FirestoreFetcher with custom name
    {
      code: `
        const customFetcher = new FirestoreDocFetcher<UserDocument>(docRef);
        const data = await customFetcher.fetch();
      `,
    },
    // Valid DocSetter with custom name
    {
      code: `
        const customSetter = new DocSetter<UserDocument>(db.collection('users'));
        await customSetter.set({ id: 'user123', name: 'John' });
      `,
    },
    // Valid nested collection/doc reference
    {
      code: `
        const nestedRef = db.collection('users').doc('user123').collection('orders').doc('order456');
      `,
    },
    // Valid FirestoreFetcher with type parameters
    {
      code: `
        const typedFetcher = new FirestoreDocFetcher<UserDocument, 'users'>(docRef);
        const typedData = await typedFetcher.fetch();
      `,
    },
    // Valid DocSetter with options
    {
      code: `
        const optionsSetter = new DocSetter<UserDocument>(db.collection('users'), { merge: true });
        await optionsSetter.set({ id: 'user123', name: 'John' });
      `,
    },
    // Valid transaction with multiple operations
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userTx = new DocSetterTransaction<UserDocument>(
            db.collection('users'),
            { transaction }
          );
          const orderTx = new DocSetterTransaction<OrderDocument>(
            db.collection('orders'),
            { transaction }
          );
          const userFetcher = new FirestoreDocFetcher<UserDocument>(userRef, { transaction });
          const orderFetcher = new FirestoreDocFetcher<OrderDocument>(orderRef, { transaction });

          const userData = await userFetcher.fetch();
          const orderData = await orderFetcher.fetch();

          userTx.set({ id: 'user123', score: userData.score + 10 });
          orderTx.set({ id: 'order456', status: 'completed' });
        });
      `,
    },
    // Valid FirestoreFetcher with array response
    {
      code: `
        const arrayFetcher = new FirestoreFetcher<UserDocument[]>(collectionRef);
        const users = await arrayFetcher.fetch();
      `,
    },
    // Valid DocSetter with conditional update
    {
      code: `
        const setter = new DocSetter<UserDocument>(db.collection('users'));
        if (condition) {
          await setter.set({ id: 'user123', name: 'John' });
        } else {
          await setter.set({ id: 'user123', name: 'Jane' });
        }
      `,
    },
    // Valid realtimeDb.ref().get() usage - should not trigger the rule
    {
      code: `
        import { realtimeDb } from '../../../config/firebaseAdmin';
        import { ONLINE_STATUSES } from '../../../types/realtimeDb/Status';
        import { toStatusPath } from '../../../types/realtimeDb/Status/path';

        export async function fetchOnlineStatus(uid: string) {
          const onlineStatusRef = realtimeDb.ref(toStatusPath(uid));
          const onlineStatusSnapshot = await onlineStatusRef.get();
          const status = onlineStatusSnapshot.val();
          return ONLINE_STATUSES.includes(status) ? status : null;
        }
      `,
    },
    // Valid realtimeDb reference with variable
    {
      code: `
        import { realtimeDb } from '../../../config/firebaseAdmin';

        export async function fetchData(path: string) {
          const ref = realtimeDb.ref(path);
          const snapshot = await ref.get();
          return snapshot.val();
        }
      `,
    },
    // Valid realtimeDb reference with nested paths
    {
      code: `
        import { realtimeDb } from '../../../config/firebaseAdmin';

        export async function fetchNestedData(userId: string) {
          const userRef = realtimeDb.ref('users/' + userId);
          const statusRef = userRef.child('status');
          const snapshot = await statusRef.get();
          return snapshot.val();
        }
      `,
    },
    // Valid BatchManager usage (bug report test case)
    {
      code: `
        import { db } from './config/firebaseAdmin';
        import { BatchManager } from './utils/BatchManager';
        import { ChannelMembership } from './types/firestore/ChannelMembership';
        import { DocumentReference, FieldValue } from 'firebase-admin/firestore';

        const CHANNEL_MEMBERSHIP_ID = 'channel-membership';

        interface SetPendingChannelMemershipProps {
          userIds: string[];
          channelId: string;
        }

        const toChannelMembershipPath = (userId: string) => \`users/\${userId}/channelMembership/membership\`;

        export const setPendingChannelMembership = async ({
          userIds,
          channelId,
        }: SetPendingChannelMemershipProps) => {
          const batchManager = new BatchManager<ChannelMembership>();

          for (const userId of userIds) {
            const ref = db.doc(
              toChannelMembershipPath(userId),
            ) as DocumentReference<ChannelMembership>;

            // We must await each operation as BatchManager may commit internally
            await batchManager.set({
              ref,
              data: {
                id: CHANNEL_MEMBERSHIP_ID,
                channelsPending: FieldValue.arrayUnion(channelId),
              },
            });
          }

          await batchManager.commit();
        };
      `,
    },
    // Valid BatchManager with different variable names
    {
      code: `
        const bm = new BatchManager<UserDocument>();
        await bm.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with camelCase
    {
      code: `
        const batchMgr = new BatchManager<UserDocument>();
        await batchMgr.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with snake_case
    {
      code: `
        const batch_manager = new BatchManager<UserDocument>();
        await batch_manager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager accessed through property
    {
      code: `
        const service = { batchManager: new BatchManager<UserDocument>() };
        await service.batchManager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with method chaining
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        await batchManager.set({ ref: docRef, data: { name: 'John' } }).then(() => console.log('done'));
      `,
    },
    // Valid BatchManager returned from function
    {
      code: `
        function createBatchManager() {
          return new BatchManager<UserDocument>();
        }
        const manager = createBatchManager();
        await manager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with type assertion
    {
      code: `
        const manager = new BatchManager<UserDocument>() as any;
        await manager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with variable name that doesn't contain "Manager" (bug fix test)
    {
      code: `
        const batch = new BatchManager<UserDocument>();
        await batch.set({ ref: docRef, data: { name: 'John' } });
        await batch.update({ ref: docRef, data: { age: 30 } });
        await batch.delete(docRef);
        await batch.commit();
      `,
    },
    // Valid BatchManager with short variable name (bug fix test)
    {
      code: `
        const bm = new BatchManager();
        bm.delete(doc.ref);
        await bm.commit();
      `,
    },
    // Valid BatchManager with generic variable name (bug fix test)
    {
      code: `
        const writer = new BatchManager<UserDocument>();
        writer.set({ ref: docRef, data: { name: 'John' } });
        writer.delete(oldDocRef);
      `,
    },
    // Valid BatchManager reassignment (bug fix test)
    {
      code: `
        let processor;
        processor = new BatchManager<UserDocument>();
        processor.delete(docRef);
        await processor.commit();
      `,
    },
    // Valid custom wrapper class with set method
    {
      code: `
        class CustomWrapper {
          set(data: any) { return Promise.resolve(); }
        }
        const wrapper = new CustomWrapper();
        await wrapper.set({ name: 'John' });
      `,
    },
    // Valid object with set method (not DocumentReference)
    {
      code: `
        const myObject = {
          set: (data: any) => Promise.resolve()
        };
        await myObject.set({ name: 'John' });
      `,
    },
    // Valid Map.set() call
    {
      code: `
        const map = new Map();
        map.set('key', 'value');
      `,
    },
    // Valid Set.add() call (different method but similar pattern)
    {
      code: `
        const set = new Set();
        set.add('value');
      `,
    },
    // Valid WeakMap.set() call
    {
      code: `
        const weakMap = new WeakMap();
        const obj = {};
        weakMap.set(obj, 'value');
      `,
    },
    // Valid localStorage.set() call
    {
      code: `
        localStorage.set('key', 'value');
      `,
    },
    // Valid sessionStorage.set() call
    {
      code: `
        sessionStorage.set('key', 'value');
      `,
    },
    // Valid custom service with set method
    {
      code: `
        class UserService {
          set(userData: any) { return Promise.resolve(); }
        }
        const userService = new UserService();
        await userService.set({ name: 'John' });
      `,
    },
    // Valid destructured BatchManager
    {
      code: `
        const { batchManager } = { batchManager: new BatchManager<UserDocument>() };
        await batchManager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager in array
    {
      code: `
        const managers = [new BatchManager<UserDocument>()];
        await managers[0].set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with complex property access
    {
      code: `
        const config = {
          database: {
            batchManager: new BatchManager<UserDocument>()
          }
        };
        await config.database.batchManager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid generic wrapper with set method
    {
      code: `
        interface Setter<T> {
          set(data: T): Promise<void>;
        }
        class GenericSetter<T> implements Setter<T> {
          set(data: T) { return Promise.resolve(); }
        }
        const setter = new GenericSetter<UserDocument>();
        await setter.set({ name: 'John' });
      `,
    },
    // Valid third-party library with set method
    {
      code: `
        import { SomeLibrary } from 'some-library';
        const lib = new SomeLibrary();
        await lib.set({ config: 'value' });
      `,
    },
    // Valid DocSetter usage with uppercase naming (bug report case)
    {
      code: `
        const SMS_DOC_SETTER = new DocSetter<Sms>(
          db.collection(toSmsCollection()) as CollectionReference<Sms>,
        );

        async function send() {
          await Promise.all([
            this.smsSendable && SMS_DOC_SETTER.set(this.smsSendable),
            this.emailSendable && this.sendEmail(),
            this.pushSendable && this.sendPush(),
          ]);
        }
      `,
    },
    // Valid DocSetter usage with different naming patterns
    {
      code: `
        const EMAIL_DOC_SETTER = new DocSetter<Email>(db.collection('emails'));
        const PUSH_DOC_SETTER = new DocSetter<Push>(db.collection('pushes'));

        async function sendNotifications() {
          await EMAIL_DOC_SETTER.set({ id: '1', content: 'Hello' });
          await PUSH_DOC_SETTER.update({ id: '2', status: 'sent' });
        }
      `,
    },
    // Valid DocSetterTransaction usage
    {
      code: `
        const USER_DOC_SETTER_TX = new DocSetterTransaction<User>(
          db.collection('users'),
          { transaction }
        );

        async function updateUser() {
          await USER_DOC_SETTER_TX.set({ id: 'user1', name: 'John' });
          await USER_DOC_SETTER_TX.update({ id: 'user2', age: 30 });
          await USER_DOC_SETTER_TX.delete('user3');
        }
      `,
    },
    // Valid mixed DocSetter and DocSetterTransaction usage
    {
      code: `
        const docSetter = new DocSetter<User>(db.collection('users'));
        const txSetter = new DocSetterTransaction<Order>(db.collection('orders'), { transaction });

        async function processData() {
          await docSetter.set({ id: '1', name: 'Alice' });
          await txSetter.set({ id: '2', total: 100 });
        }
      `,
    },
    // Valid DocSetter with conditional assignment
    {
      code: `
        const docSetter = condition ? new DocSetter<User>(db.collection('users')) : null;
        if (docSetter) {
          await docSetter.set({ id: '1', name: 'John' });
        }
      `,
    },
    // Valid DocSetter in different scopes
    {
      code: `
        function createSetter() {
          const docSetter = new DocSetter<User>(db.collection('users'));
          return docSetter;
        }

        async function useSetter() {
          const setter = createSetter();
          await setter.set({ id: '1', name: 'John' });
        }
      `,
    },
    // Valid DocSetter accessed through object properties
    {
      code: `
        const services = {
          userSetter: new DocSetter<User>(db.collection('users')),
          orderSetter: new DocSetter<Order>(db.collection('orders'))
        };

        async function updateUser() {
          await services.userSetter.set({ id: '1', name: 'John' });
          await services.orderSetter.update({ id: '2', status: 'completed' });
        }
      `,
    },
    // Valid DocSetter stored in array
    {
      code: `
        const setters = [
          new DocSetter<User>(db.collection('users')),
          new DocSetter<Order>(db.collection('orders'))
        ];

        async function updateData() {
          await setters[0].set({ id: '1', name: 'John' });
          await setters[1].set({ id: '2', total: 100 });
        }
      `,
    },
    // Valid DocSetter passed as function parameter
    {
      code: `
        async function updateWithSetter(setter: DocSetter<User>, userData: User) {
          await setter.set(userData);
          await setter.update({ id: userData.id, lastModified: new Date() });
        }

        const userSetter = new DocSetter<User>(db.collection('users'));
        await updateWithSetter(userSetter, { id: '1', name: 'John' });
      `,
    },
    // Valid DocSetter with destructuring
    {
      code: `
        const { userSetter, orderSetter } = {
          userSetter: new DocSetter<User>(db.collection('users')),
          orderSetter: new DocSetter<Order>(db.collection('orders'))
        };

        async function processData() {
          await userSetter.set({ id: '1', name: 'John' });
          await orderSetter.set({ id: '2', total: 100 });
        }
      `,
    },
    // Valid DocSetter with method chaining
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        async function updateUser() {
          await userSetter.set({ id: '1', name: 'John' }).then(() => console.log('User updated'));
          await userSetter.update({ id: '1', age: 30 }).catch(error => console.error(error));
        }
      `,
    },
    // Valid DocSetter in class methods
    {
      code: `
        class UserService {
          private userSetter = new DocSetter<User>(db.collection('users'));
          private orderSetter = new DocSetter<Order>(db.collection('orders'));

          async createUser(userData: User) {
            await this.userSetter.set(userData);
          }

          async updateUser(userId: string, updates: Partial<User>) {
            await this.userSetter.update({ id: userId, ...updates });
          }

          async deleteUser(userId: string) {
            await this.userSetter.delete(userId);
          }

          async createOrder(orderData: Order) {
            await this.orderSetter.set(orderData);
          }
        }
      `,
    },
    // Valid DocSetter in nested function calls
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        async function processUser() {
          await Promise.resolve().then(async () => {
            await userSetter.set({ id: '1', name: 'John' });
          });
        }

        async function batchProcess() {
          await Promise.all([
            userSetter.set({ id: '1', name: 'John' }),
            userSetter.set({ id: '2', name: 'Jane' })
          ]);
        }
      `,
    },
    // Valid DocSetter in Promise contexts
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));
        const orderSetter = new DocSetter<Order>(db.collection('orders'));

        async function processData() {
          await Promise.all([
            userSetter.set({ id: '1', name: 'John' }),
            orderSetter.set({ id: '2', total: 100 })
          ]);

          await Promise.race([
            userSetter.update({ id: '1', age: 30 }),
            orderSetter.update({ id: '2', status: 'pending' })
          ]);
        }
      `,
    },
    // Valid DocSetter in error handling
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        async function safeUpdate() {
          try {
            await userSetter.set({ id: '1', name: 'John' });
            await userSetter.update({ id: '1', age: 30 });
          } catch (error) {
            console.error('Failed to update user:', error);
            await userSetter.delete('1');
          } finally {
            console.log('Update operation completed');
          }
        }
      `,
    },
    // Valid DocSetter in loop contexts
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));
        const users = [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }];

        async function batchCreateUsers() {
          for (const user of users) {
            await userSetter.set(user);
          }

          users.forEach(async (user) => {
            await userSetter.update({ id: user.id, lastModified: new Date() });
          });

          for (let i = 0; i < users.length; i++) {
            await userSetter.delete(users[i].id);
          }
        }
      `,
    },
    // Valid DocSetter in callback functions
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        function processUsers(users: User[], callback: (setter: DocSetter<User>) => Promise<void>) {
          return callback(userSetter);
        }

        await processUsers([], async (setter) => {
          await setter.set({ id: '1', name: 'John' });
        });
      `,
    },
    // Valid DocSetter in arrow functions
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        const updateUser = async (userData: User) => {
          await userSetter.set(userData);
        };

        const batchUpdate = async (users: User[]) =>
          Promise.all(users.map(user => userSetter.set(user)));

        const conditionalUpdate = async (condition: boolean) => {
          if (condition) {
            await userSetter.update({ id: '1', active: true });
          }
        };
      `,
    },
    // Valid DocSetter with template literals
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users'));

        async function updateUserWithMessage(userId: string, name: string) {
          await userSetter.set({
            id: userId,
            name: name,
            message: \`Hello \${name}, welcome!\`
          });
        }
      `,
    },
    // Valid DocSetter with type assertions
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users')) as DocSetter<User>;
        const typedSetter = userSetter as any;

        async function updateUser() {
          await (userSetter as DocSetter<User>).set({ id: '1', name: 'John' });
          await typedSetter.update({ id: '1', age: 30 });
        }
      `,
    },
    // Valid DocSetter with complex generics
    {
      code: `
        interface UserWithMetadata<T = any> extends User {
          metadata: T;
        }

        const userSetter = new DocSetter<UserWithMetadata<{ source: string }>>(
          db.collection('users')
        );

        async function updateUserWithMetadata() {
          await userSetter.set({
            id: '1',
            name: 'John',
            metadata: { source: 'api' }
          });
        }
      `,
    },
    // Valid DocSetter in inheritance scenarios
    {
      code: `
        abstract class BaseService<T> {
          protected setter: DocSetter<T>;

          constructor(collection: string) {
            this.setter = new DocSetter<T>(db.collection(collection));
          }

          async create(data: T) {
            await this.setter.set(data);
          }
        }

        class UserService extends BaseService<User> {
          constructor() {
            super('users');
          }

          async updateUser(userId: string, updates: Partial<User>) {
            await this.setter.update({ id: userId, ...updates });
          }
        }
      `,
    },
    // Valid DocSetter with module-like patterns
    {
      code: `
        const UserModule = {
          setter: new DocSetter<User>(db.collection('users')),

          async create(userData: User) {
            await this.setter.set(userData);
          },

          async update(userId: string, updates: Partial<User>) {
            await this.setter.update({ id: userId, ...updates });
          }
        };

        await UserModule.create({ id: '1', name: 'John' });
      `,
    },
    // Valid DocSetter with complex object structures
    {
      code: `
        const database = {
          users: {
            setter: new DocSetter<User>(db.collection('users')),
            fetcher: new FirestoreDocFetcher<User>(db.collection('users').doc('1'))
          },
          orders: {
            setter: new DocSetter<Order>(db.collection('orders')),
            fetcher: new FirestoreDocFetcher<Order>(db.collection('orders').doc('1'))
          }
        };

        async function processData() {
          await database.users.setter.set({ id: '1', name: 'John' });
          await database.orders.setter.set({ id: '2', total: 100 });
        }
      `,
    },
    // Valid DocSetter with async initialization
    {
      code: `
        let userSetter: DocSetter<User>;

        async function initializeSetter() {
          userSetter = new DocSetter<User>(db.collection('users'));
        }

        async function useSetterAfterInit() {
          await initializeSetter();
          await userSetter.set({ id: '1', name: 'John' });
        }
      `,
    },
    // Valid DocSetter with factory pattern
    {
      code: `
        function createDocSetter<T>(collectionName: string): DocSetter<T> {
          return new DocSetter<T>(db.collection(collectionName));
        }

        const userSetter = createDocSetter<User>('users');
        const orderSetter = createDocSetter<Order>('orders');

        async function updateData() {
          await userSetter.set({ id: '1', name: 'John' });
          await orderSetter.set({ id: '2', total: 100 });
        }
      `,
    },
    // Valid DocSetter with singleton pattern
    {
      code: `
        class SetterManager {
          private static userSetter: DocSetter<User>;

          static getUserSetter(): DocSetter<User> {
            if (!this.userSetter) {
              this.userSetter = new DocSetter<User>(db.collection('users'));
            }
            return this.userSetter;
          }
        }

        async function updateUser() {
          const setter = SetterManager.getUserSetter();
          await setter.set({ id: '1', name: 'John' });
        }
      `,
    },
    // Valid DocSetter with dependency injection pattern
    {
      code: `
        interface IUserService {
          updateUser(userData: User): Promise<void>;
        }

        class UserService implements IUserService {
          constructor(private userSetter: DocSetter<User>) {}

          async updateUser(userData: User) {
            await this.userSetter.set(userData);
          }
        }

        const userSetter = new DocSetter<User>(db.collection('users'));
        const userService = new UserService(userSetter);
        await userService.updateUser({ id: '1', name: 'John' });
      `,
    },
    // Valid conditional BatchManager usage
    {
      code: `
        const batchManager = condition ? new BatchManager<UserDocument>() : null;
        if (batchManager) {
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
        }
      `,
    },
    // Valid BatchManager with async/await in different contexts
    {
      code: `
        async function processBatch() {
          const batchManager = new BatchManager<UserDocument>();
          try {
            await batchManager.set({ ref: docRef, data: { name: 'John' } });
          } catch (error) {
            console.error(error);
          }
        }
      `,
    },
    // Valid BatchManager with Promise.all
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        await Promise.all([
          batchManager.set({ ref: docRef1, data: { name: 'John' } }),
          batchManager.set({ ref: docRef2, data: { name: 'Jane' } })
        ]);
      `,
    },
    // Valid BatchManager with different generic types
    {
      code: `
        const userBatchManager = new BatchManager<UserDocument>();
        const orderBatchManager = new BatchManager<OrderDocument>();
        await userBatchManager.set({ ref: userRef, data: { name: 'John' } });
        await orderBatchManager.set({ ref: orderRef, data: { status: 'pending' } });
      `,
    },
    // Valid BatchManager with confusing variable name containing "doc" (edge case)
    {
      code: `
        const docProcessor = new BatchManager<UserDocument>();
        await docProcessor.set({ ref: docRef, data: { name: 'John' } });
        await docProcessor.update({ ref: docRef, data: { age: 30 } });
        await docProcessor.delete(docRef);
      `,
    },
    // Valid BatchManager with confusing variable name containing "ref" (edge case)
    {
      code: `
        const refHandler = new BatchManager<UserDocument>();
        await refHandler.set({ ref: docRef, data: { name: 'John' } });
        await refHandler.delete(docRef);
      `,
    },
    // Valid BatchManager with variable name that could be confused with DocumentReference (edge case)
    {
      code: `
        const docRef = new BatchManager<UserDocument>();
        await docRef.set({ ref: actualDocRef, data: { name: 'John' } });
        await docRef.delete(actualDocRef);
      `,
    },
    // Valid BatchManager with method chaining (edge case)
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        await batchManager.set({ ref: docRef, data: { name: 'John' } }).then(() => console.log('done'));
      `,
    },
    // Valid BatchManager in complex nested structure (edge case)
    {
      code: `
        const services = {
          database: {
            writers: {
              batchManager: new BatchManager<UserDocument>()
            }
          }
        };
        await services.database.writers.batchManager.set({ ref: docRef, data: { name: 'John' } });
      `,
    },
    // Valid BatchManager with type assertion (edge case)
    {
      code: `
        const manager = new BatchManager<UserDocument>() as any;
        await manager.set({ ref: docRef, data: { name: 'John' } });
        await manager.delete(docRef);
      `,
    },
    // Valid BatchManager with all CRUD operations in sequence (comprehensive test)
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        await batchManager.set({ ref: docRef1, data: { name: 'John', age: 25 } });
        await batchManager.update({ ref: docRef2, data: { age: 30 } });
        await batchManager.delete(docRef3);
        await batchManager.commit();
      `,
    },
    // Valid BatchManager with error handling (edge case)
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        try {
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
          await batchManager.delete(oldRef);
          await batchManager.commit();
        } catch (error) {
          console.error('Batch operation failed:', error);
        }
      `,
    },
    // Valid BatchManager with conditional operations (edge case)
    {
      code: `
        const batchManager = new BatchManager<UserDocument>();
        if (shouldCreate) {
          await batchManager.set({ ref: docRef, data: { name: 'John' } });
        }
        if (shouldUpdate) {
          await batchManager.update({ ref: docRef, data: { age: 30 } });
        }
        if (shouldDelete) {
          await batchManager.delete(oldRef);
        }
        await batchManager.commit();
      `,
    },
    // Valid Set.prototype.delete() with no type parameter
    {
      code: `
        const mySet = new Set();
        mySet.add('item1');
        mySet.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() with initial values
    {
      code: `
        const mySet = new Set(['item1', 'item2', 'item3']);
        mySet.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() with complex type
    {
      code: `
        interface User {
          id: string;
          name: string;
        }
        const userSet = new Set<User>();
        const user = { id: '123', name: 'John' };
        userSet.add(user);
        userSet.delete(user);
      `,
    },
    // Valid Set.prototype.delete() in class context
    {
      code: `
        class DataManager {
          private items = new Set<string>();

          addItem(item: string) {
            this.items.add(item);
          }

          removeItem(item: string) {
            this.items.delete(item);
          }
        }
      `,
    },
    // Valid Set.prototype.delete() in callback context
    {
      code: `
        const itemsToRemove = ['item1', 'item2'];
        const mySet = new Set(['item1', 'item2', 'item3']);
        itemsToRemove.forEach(item => mySet.delete(item));
      `,
    },
    // Valid Set.prototype.delete() with variable reassignment
    {
      code: `
        let mySet;
        mySet = new Set<string>();
        mySet.add('item1');
        mySet.delete('item1');
      `,
    },
    // Valid Map.prototype.delete() - should not trigger the rule
    {
      code: `
        const myMap = new Map<string, any>();
        myMap.set('key1', 'value1');
        myMap.delete('key1');
      `,
    },
    // Valid WeakSet.prototype.delete() - should not trigger the rule
    {
      code: `
        const myWeakSet = new WeakSet();
        const obj = {};
        myWeakSet.add(obj);
        myWeakSet.delete(obj);
      `,
    },
    // Valid WeakMap.prototype.delete() - should not trigger the rule
    {
      code: `
        const myWeakMap = new WeakMap();
        const key = {};
        myWeakMap.set(key, 'value');
        myWeakMap.delete(key);
      `,
    },
    // Valid Set.prototype.delete() with function parameter
    {
      code: `
        function processSet(mySet: Set<string>, item: string) {
          mySet.delete(item);
        }

        const dataSet = new Set<string>();
        processSet(dataSet, 'item1');
      `,
    },
    // Valid Set.prototype.delete() with function return
    {
      code: `
        function createSet(): Set<string> {
          return new Set<string>();
        }

        const mySet = createSet();
        mySet.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() in conditional
    {
      code: `
        const mySet = new Set<string>();
        const condition = true;
        if (condition) {
          mySet.delete('item1');
        }
      `,
    },
    // Valid Set.prototype.delete() in try-catch
    {
      code: `
        const mySet = new Set<string>();
        try {
          mySet.delete('item1');
        } catch (error) {
          console.error(error);
        }
      `,
    },
    // Valid Set.prototype.delete() with variable name containing 'doc'
    {
      code: `
        const docSet = new Set<string>();
        docSet.add('doc1');
        docSet.delete('doc1');
      `,
    },
    // Valid Set.prototype.delete() with variable name containing 'ref'
    {
      code: `
        const refSet = new Set<string>();
        refSet.add('ref1');
        refSet.delete('ref1');
      `,
    },
    // Valid Set.prototype.delete() with nested property access
    {
      code: `
        const dataManager = {
          items: new Set<string>()
        };
        dataManager.items.add('item1');
        dataManager.items.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() with array destructuring
    {
      code: `
        const sets = [new Set<string>(), new Set<number>()];
        const [stringSet, numberSet] = sets;
        stringSet.delete('item1');
        numberSet.delete(123);
      `,
    },
    // Valid Set.prototype.delete() with object destructuring
    {
      code: `
        const container = {
          stringSet: new Set<string>(),
          numberSet: new Set<number>()
        };
        const { stringSet, numberSet } = container;
        stringSet.delete('item1');
        numberSet.delete(123);
      `,
    },
    // Valid Set.prototype.delete() with method chaining
    {
      code: `
        const mySet = new Set<string>();
        mySet.add('item1').add('item2');
        mySet.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() with generic constraints
    {
      code: `
        function processGenericSet<T extends string>(mySet: Set<T>, item: T) {
          mySet.delete(item);
        }
      `,
    },
    // Valid Set.prototype.delete() with union types
    {
      code: `
        const mixedSet = new Set<string | number>();
        mixedSet.add('item1');
        mixedSet.add(123);
        mixedSet.delete('item1');
        mixedSet.delete(123);
      `,
    },
    // Valid Set.prototype.delete() with async context
    {
      code: `
        async function processItems() {
          const mySet = new Set<string>();
          mySet.add('item1');
          await Promise.resolve();
          mySet.delete('item1');
        }
      `,
    },
    // Valid Set.prototype.delete() with arrow function
    {
      code: `
        const removeFromSet = (mySet: Set<string>, item: string) => {
          mySet.delete(item);
        };

        const dataSet = new Set<string>();
        removeFromSet(dataSet, 'item1');
      `,
    },
    // Valid Set.prototype.delete() with spread operator
    {
      code: `
        const originalSet = new Set(['item1', 'item2']);
        const newSet = new Set([...originalSet, 'item3']);
        newSet.delete('item1');
      `,
    },
    // Valid Set.prototype.delete() with Set.from()
    {
      code: `
        const arrayData = ['item1', 'item2', 'item3'];
        const mySet = new Set(arrayData);
        mySet.delete('item1');
      `,
    },
    // Valid Set operations with multiple methods
    {
      code: `
        const mySet = new Set<string>();
        mySet.add('item1');
        mySet.add('item2');
        const hasItem = mySet.has('item1');
        mySet.delete('item1');
        const size = mySet.size;
        mySet.clear();
      `,
    },
    // Valid: Assignment after declaration (not tracked by current implementation but should not error)
    {
      code: `
        let mySet;
        function initSet() {
          mySet = new Set<string>();
        }
        initSet();
        mySet.delete('item1');
      `,
    },
    // Valid: Complex nested property access with Set
    {
      code: `
        const manager = {
          data: {
            items: new Set<string>()
          }
        };
        manager.data.items.add('item1');
        manager.data.items.delete('item1');
      `,
    },
    // Valid: Set in array with destructuring
    {
      code: `
        const collections = [new Set<string>(), new Map<string, any>()];
        const [mySet, myMap] = collections;
        mySet.delete('item1');
        myMap.delete('key1');
      `,
    },
    // Valid: Set with DocumentReference type (should not be confused with Firestore)
    {
      code: `
        import { DocumentReference } from 'firebase-admin/firestore';
        const docRefSet = new Set<DocumentReference>();
        const docRef = {} as DocumentReference;
        docRefSet.add(docRef);
        docRefSet.delete(docRef);
      `,
    },
    // Valid: Set methods other than delete
    {
      code: `
        const mySet = new Set<string>();
        mySet.add('item1');
        mySet.has('item1');
        mySet.clear();
        const size = mySet.size;
        for (const item of mySet) {
          console.log(item);
        }
      `,
    },
    // Valid: Map methods including delete
    {
      code: `
        const myMap = new Map<string, number>();
        myMap.set('key1', 1);
        myMap.get('key1');
        myMap.has('key1');
        myMap.delete('key1');
        myMap.clear();
      `,
    },
    // Valid: WeakSet and WeakMap with objects
    {
      code: `
        const myWeakSet = new WeakSet<object>();
        const myWeakMap = new WeakMap<object, string>();
        const obj1 = {};
        const obj2 = {};

        myWeakSet.add(obj1);
        myWeakMap.set(obj2, 'value');

        myWeakSet.delete(obj1);
        myWeakMap.delete(obj2);
      `,
    },
    // Valid: Collection operations in loops
    {
      code: `
        const mySet = new Set<string>(['item1', 'item2', 'item3']);
        const itemsToRemove = ['item1', 'item3'];

        for (const item of itemsToRemove) {
          mySet.delete(item);
        }

        itemsToRemove.forEach(item => {
          if (mySet.has(item)) {
            mySet.delete(item);
          }
        });
      `,
    },
    // Valid: Collection operations with error handling
    {
      code: `
        const mySet = new Set<string>();
        const myMap = new Map<string, any>();

        try {
          mySet.delete('nonexistent');
          myMap.delete('nonexistent');
        } catch (error) {
          console.error('Error deleting items:', error);
        }
      `,
    },
    // Valid: Collection operations with async/await
    {
      code: `
        async function processCollections() {
          const mySet = new Set<string>();
          const myMap = new Map<string, Promise<any>>();

          mySet.add('item1');
          myMap.set('key1', Promise.resolve('value1'));

          await Promise.resolve();

          mySet.delete('item1');
          myMap.delete('key1');
        }
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
      errors: [
        {
          messageId: 'noDirectGet',
          data: {
            method: 'get',
            target: 'docRef',
          },
        },
      ],
    },
    // Invalid direct set usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' });
      `,
      errors: [
        {
          messageId: 'noDirectSet',
          data: {
            method: 'set',
            target: 'docRef',
          },
        },
      ],
    },
    // Invalid direct update usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.update({ score: 100 });
      `,
      errors: [
        {
          messageId: 'noDirectUpdate',
          data: {
            method: 'update',
            target: 'docRef',
          },
        },
      ],
    },
    // Invalid direct delete usage
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.delete();
      `,
      errors: [
        {
          messageId: 'noDirectDelete',
          data: {
            method: 'delete',
            target: 'docRef',
          },
        },
      ],
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
      errors: [{ messageId: 'noDirectGet' }, { messageId: 'noDirectSet' }],
    },
    // Invalid nested collection reference get
    {
      code: `
        const nestedDoc = await db.collection('users').doc('user123').collection('orders').doc('order456').get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid batch with multiple operations
    {
      code: `
        const batch = db.batch();
        batch.set(userRef, { name: 'John' });
        batch.update(orderRef, { status: 'pending' });
        batch.delete(oldRef);
        await batch.commit();
      `,
      errors: [
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid transaction with mixed operations
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          transaction.set(userRef, { name: 'John' });
          transaction.update(orderRef, { status: 'pending' });
          transaction.delete(oldRef);
        });
      `,
      errors: [
        { messageId: 'noDirectGet' },
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid direct get with options
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        const userDoc = await docRef.get({ source: 'server' });
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid direct set with merge option
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' }, { merge: true });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid direct update with multiple fields
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.update({
          name: 'John',
          age: 30,
          'address.city': 'New York',
        });
      `,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Invalid get in conditional
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        if (condition) {
          const doc = await docRef.get();
        }
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid set in try-catch
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        try {
          await docRef.set({ name: 'John' });
        } catch (error) {
          console.error(error);
        }
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid update with field path
    {
      code: `
        const docRef = db.collection('users').doc('user123');
        await docRef.update(new FieldPath('nested', 'field'), 'value');
      `,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Invalid get with TypeScript type assertion (regression test for bug fix)
    {
      code: `
        import { DocumentReference, CollectionReference } from 'firebase-admin/firestore';
        import { db } from '../../config/firebaseAdmin';
        import { GroupDenormalization } from '../../types/firestore/User/GroupDenormalization';
        import { GroupInfo } from '../../types/firestore/Guild';

        export const fetchData = async (userId: string, path: string) => {
          const denormDocs = await (
            db.collection(
              'users/' + userId + '/groups'
            ) as CollectionReference<GroupDenormalization>
          ).get();

          const subGroupDoc = await (
            db.doc(path) as DocumentReference<GroupInfo>
          ).get();

          return { denormDocs, subGroupDoc };
        };
      `,
      errors: [{ messageId: 'noDirectGet' }, { messageId: 'noDirectGet' }],
    },
    // Invalid: DocumentReference.set() should still be caught even with confusing variable names
    {
      code: `
        const batchManager = db.collection('users').doc('user123');
        await batchManager.set({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: DocumentReference.set() with type assertion should still be caught
    {
      code: `
        const manager = db.collection('users').doc('user123') as DocumentReference<UserDocument>;
        await manager.set({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },

    // Invalid: DocumentReference.get() with misleading variable name
    {
      code: `
        const batchManager = db.collection('users').doc('user123');
        const result = await batchManager.get();
      `,
      errors: [{ messageId: 'noDirectGet' }],
    },
    // Invalid: DocumentReference.update() with misleading variable name
    {
      code: `
        const setter = db.collection('users').doc('user123');
        await setter.update({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Invalid: DocumentReference.delete() with misleading variable name
    {
      code: `
        const manager = db.collection('users').doc('user123');
        await manager.delete();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },

    // Invalid: DocumentReference in array should still be caught
    {
      code: `
        const refs = [db.collection('users').doc('user123')];
        await refs[0].set({ name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: DocumentReference with complex chaining should still be caught
    {
      code: `
        const ref = db.collection('users').doc('user123').collection('orders').doc('order456');
        await ref.set({ status: 'pending' });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: Firestore delete should still be caught even with Set variables present
    {
      code: `
        const mySet = new Set<string>();
        const docRef = db.collection('users').doc('user123');
        mySet.delete('item1'); // This should be valid
        await docRef.delete(); // This should be invalid
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Variable named like Set but actually Firestore reference
    {
      code: `
        const setRef = db.collection('users').doc('user123');
        await setRef.delete();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations in same scope as Set operations
    {
      code: `
        const mySet = new Set<string>();
        const docRef = db.collection('users').doc('user123');

        mySet.add('item1');
        await docRef.set({ name: 'John' });
        mySet.delete('item1');
        await docRef.update({ age: 30 });
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectUpdate' }],
    },
    // Invalid: Batch operations should still be caught
    {
      code: `
        const mySet = new Set<string>();
        const batch = db.batch();

        mySet.delete('item1');
        batch.delete(docRef);
        await batch.commit();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Transaction operations should still be caught
    {
      code: `
        const mySet = new Set<string>();

        await db.runTransaction(async (transaction) => {
          mySet.delete('item1');
          transaction.delete(docRef);
        });
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore delete with type assertion should still be caught
    {
      code: `
        import { DocumentReference } from 'firebase-admin/firestore';
        const mySet = new Set<string>();

        mySet.delete('item1');
        await (db.doc('users/123') as DocumentReference).delete();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Nested Firestore operations should still be caught
    {
      code: `
        const mySet = new Set<string>();

        if (condition) {
          mySet.delete('item1');
          await db.collection('users').doc('user123').delete();
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Mixed valid Set and invalid Firestore operations
    {
      code: `
        class DataManager {
          private items = new Set<string>();

          async removeItem(item: string) {
            this.items.delete(item); // Valid Set operation

            const docRef = db.collection('items').doc(item);
            await docRef.delete(); // Invalid Firestore operation
          }
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations with similar variable names to Set
    {
      code: `
        const itemSet = new Set<string>();
        const docSet = db.collection('documents');

        itemSet.delete('item1'); // Valid
        await docSet.doc('doc1').delete(); // Invalid
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Multiple Firestore methods with Set operations
    {
      code: `
        const mySet = new Set<string>();
        const userRef = db.collection('users').doc('user123');

        mySet.add('item1');
        const userData = await userRef.get(); // Invalid
        mySet.delete('item1');
        await userRef.set({ name: 'John' }); // Invalid
        await userRef.update({ age: 30 }); // Invalid
        await userRef.delete(); // Invalid
      `,
      errors: [
        { messageId: 'noDirectGet' },
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid: Variable named like collection but actually Firestore
    {
      code: `
        const mapRef = db.collection('users').doc('user123');
        await mapRef.delete();
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations should be caught even with collection variables in scope
    {
      code: `
        const mySet = new Set<string>();
        const myMap = new Map<string, any>();
        const myWeakSet = new WeakSet();

        const docRef = db.collection('users').doc('user123');

        mySet.delete('item1'); // Valid
        myMap.delete('key1'); // Valid
        myWeakSet.delete({}); // Valid

        await docRef.delete(); // Invalid - should still be caught
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations in complex control flow with collections
    {
      code: `
        const collections = [new Set<string>(), new Map<string, any>()];
        const [mySet, myMap] = collections;

        if (Math.random() > 0.5) {
          mySet.delete('item1'); // Valid
          const docRef = db.collection('users').doc('user123');
          await docRef.delete(); // Invalid
        } else {
          myMap.delete('key1'); // Valid
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations in async context with collections
    {
      code: `
        async function processData() {
          const mySet = new Set<string>();

          await Promise.all([
            Promise.resolve(mySet.delete('item1')), // Valid
            db.collection('users').doc('user123').delete() // Invalid
          ]);
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations with similar method names on collections
    {
      code: `
        const mySet = new Set<string>();
        const myMap = new Map<string, any>();

        // Valid collection operations
        mySet.add('item1');
        myMap.set('key1', 'value1');
        mySet.delete('item1');
        myMap.delete('key1');

        // Invalid Firestore operations
        const docRef = db.collection('users').doc('user123');
        await docRef.set({ name: 'John' }); // Invalid - should be caught
        await docRef.get(); // Invalid - should be caught
        await docRef.update({ age: 30 }); // Invalid - should be caught
        await docRef.delete(); // Invalid - should be caught
      `,
      errors: [
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectGet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid: Firestore operations in class with collection properties
    {
      code: `
        class DataProcessor {
          private cache = new Set<string>();
          private lookup = new Map<string, any>();

          async processItem(id: string) {
            this.cache.delete(id); // Valid
            this.lookup.delete(id); // Valid

            const docRef = db.collection('items').doc(id);
            await docRef.delete(); // Invalid
          }
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Firestore operations with collection variables having Firestore-like names
    {
      code: `
        const docSet = new Set<string>(); // Valid Set
        const refMap = new Map<string, any>(); // Valid Map
        const actualDocRef = db.collection('users').doc('user123'); // Firestore ref

        docSet.delete('doc1'); // Valid
        refMap.delete('ref1'); // Valid
        await actualDocRef.delete(); // Invalid
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Nested Firestore operations with collections in different scopes
    {
      code: `
        function setupCollections() {
          const mySet = new Set<string>();
          mySet.delete('item1'); // Valid

          return {
            processDoc: async (docId: string) => {
              const docRef = db.collection('docs').doc(docId);
              await docRef.delete(); // Invalid
            }
          };
        }
      `,
      errors: [{ messageId: 'noDirectDelete' }],
    },
    // Invalid: Variable that looks like DocSetter but isn't
    {
      code: `
        const SMS_DOC_SETTER = db.collection('sms').doc('123'); // This is a DocumentReference, not DocSetter
        await SMS_DOC_SETTER.set({ content: 'Hello' }); // Should be flagged
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: Variable with Setter in name but not a DocSetter instance
    {
      code: `
        const customSetter = db.collection('users').doc('user123');
        await customSetter.set({ name: 'John' }); // Should be flagged even though name contains 'Setter'
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: DocSetter-like variable name but assigned to DocumentReference
    {
      code: `
        const USER_DOC_SETTER = db.collection('users').doc('123');
        const EMAIL_DOC_SETTER = db.collection('emails').doc('456');

        await USER_DOC_SETTER.set({ name: 'John' });
        await EMAIL_DOC_SETTER.update({ subject: 'Hello' });
        await USER_DOC_SETTER.delete();
      `,
      errors: [
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid: Variable reassignment from DocSetter to DocumentReference
    {
      code: `
        let userSetter = new DocSetter<User>(db.collection('users'));
        userSetter = db.collection('users').doc('123'); // Reassigned to DocumentReference
        await userSetter.set({ name: 'John' }); // Should be flagged
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Note: Object property and array element tracking is beyond the scope of this rule
    // The rule focuses on simple variable assignments to ensure DocSetter instances are recognized
    // Invalid: Function parameter that receives DocumentReference instead of DocSetter
    {
      code: `
        async function updateWithRef(ref: DocumentReference<User>, userData: User) {
          await ref.set(userData); // Should be flagged
          await ref.update({ lastModified: new Date() }); // Should be flagged
        }

        const userRef = db.collection('users').doc('123');
        await updateWithRef(userRef, { id: '1', name: 'John' });
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectUpdate' }],
    },
    // Invalid: Destructuring DocumentReferences instead of DocSetters
    {
      code: `
        const { userRef, orderRef } = {
          userRef: db.collection('users').doc('123'),
          orderRef: db.collection('orders').doc('456')
        };

        await userRef.set({ name: 'John' });
        await orderRef.set({ total: 100 });
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectSet' }],
    },
    // Invalid: Method chaining on DocumentReference
    {
      code: `
        const userRef = db.collection('users').doc('123');

        await userRef.set({ name: 'John' }).then(() => console.log('User updated'));
        await userRef.update({ age: 30 }).catch(error => console.error(error));
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectUpdate' }],
    },
    // Note: Class property tracking is beyond the scope of this rule
    // The rule focuses on simple variable assignments to ensure DocSetter instances are recognized
    // Invalid: DocumentReference in Promise contexts
    {
      code: `
        const userRef = db.collection('users').doc('123');
        const orderRef = db.collection('orders').doc('456');

        await Promise.all([
          userRef.set({ name: 'John' }),
          orderRef.set({ total: 100 })
        ]);

        await Promise.race([
          userRef.update({ age: 30 }),
          orderRef.update({ status: 'pending' })
        ]);
      `,
      errors: [
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectUpdate' },
      ],
    },
    // Invalid: DocumentReference in error handling
    {
      code: `
        const userRef = db.collection('users').doc('123');

        try {
          await userRef.set({ name: 'John' });
          await userRef.update({ age: 30 });
        } catch (error) {
          console.error('Failed to update user:', error);
          await userRef.delete();
        }
      `,
      errors: [
        { messageId: 'noDirectSet' },
        { messageId: 'noDirectUpdate' },
        { messageId: 'noDirectDelete' },
      ],
    },
    // Invalid: DocumentReference in loops
    {
      code: `
        const userRef = db.collection('users').doc('123');
        const users = [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }];

        for (const user of users) {
          await userRef.set(user); // Should be flagged
        }

        users.forEach(async (user) => {
          await userRef.update({ lastModified: new Date() }); // Should be flagged
        });
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectUpdate' }],
    },
    // Invalid: DocumentReference in callback functions
    {
      code: `
        const userRef = db.collection('users').doc('123');

        function processUsers(users: User[], callback: (ref: DocumentReference<User>) => Promise<void>) {
          return callback(userRef);
        }

        await processUsers([], async (ref) => {
          await ref.set({ id: '1', name: 'John' }); // Should be flagged
        });
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: DocumentReference in arrow functions
    {
      code: `
        const userRef = db.collection('users').doc('123');

        const updateUser = async (userData: User) => {
          await userRef.set(userData); // Should be flagged
        };

        const batchUpdate = async (users: User[]) =>
          Promise.all(users.map(user => userRef.set(user))); // Should be flagged
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectSet' }],
    },
    // Invalid: DocumentReference with type assertions
    {
      code: `
        const userRef = db.collection('users').doc('123') as DocumentReference<User>;

        await userRef.update({ age: 30 }); // Should be flagged
      `,
      errors: [{ messageId: 'noDirectUpdate' }],
    },
    // Note: Complex nested object property tracking is beyond the scope of this rule
    // The rule focuses on simple variable assignments to ensure DocSetter instances are recognized
    // Invalid: Factory pattern returning DocumentReference instead of DocSetter
    {
      code: `
        function createDocRef<T>(collectionName: string, docId: string): DocumentReference<T> {
          return db.collection(collectionName).doc(docId) as DocumentReference<T>;
        }

        const userRef = createDocRef<User>('users', '123');
        const orderRef = createDocRef<Order>('orders', '456');

        await userRef.set({ name: 'John' });
        await orderRef.set({ total: 100 });
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectSet' }],
    },
    // Invalid: Singleton pattern with DocumentReference
    {
      code: `
        class RefManager {
          private static userRef: DocumentReference<User>;

          static getUserRef(): DocumentReference<User> {
            if (!this.userRef) {
              this.userRef = db.collection('users').doc('123') as DocumentReference<User>;
            }
            return this.userRef;
          }
        }

        async function updateUser() {
          const ref = RefManager.getUserRef();
          await ref.set({ name: 'John' });
        }
      `,
      errors: [{ messageId: 'noDirectSet' }],
    },
    // Invalid: Mixed valid DocSetter and invalid DocumentReference usage
    {
      code: `
        const userSetter = new DocSetter<User>(db.collection('users')); // Valid DocSetter
        const orderRef = db.collection('orders').doc('123'); // Invalid DocumentReference

        await userSetter.set({ id: '1', name: 'John' }); // Valid - should not be flagged
        await orderRef.set({ id: '2', total: 100 }); // Invalid - should be flagged
        await userSetter.update({ id: '1', age: 30 }); // Valid - should not be flagged
        await orderRef.update({ id: '2', status: 'pending' }); // Invalid - should be flagged
      `,
      errors: [{ messageId: 'noDirectSet' }, { messageId: 'noDirectUpdate' }],
    },
    // Note: Variable shadowing and conditional assignment tracking are complex scenarios
    // beyond the scope of this rule. The rule focuses on simple variable assignments
    // to ensure DocSetter instances are recognized in the most common use cases.
  ],
});
