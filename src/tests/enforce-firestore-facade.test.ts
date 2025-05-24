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
  ],
});
