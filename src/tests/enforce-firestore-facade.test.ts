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
  ],
});
