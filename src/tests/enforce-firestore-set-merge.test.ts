import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestoreSetMerge } from '../rules/enforce-firestore-set-merge';

ruleTesterTs.run('enforce-firestore-set-merge', enforceFirestoreSetMerge, {
  valid: [
    // Valid cases using non-Firestore update methods
    {
      code: `
        import { createHash } from 'node:crypto';
        const hash = createHash('sha256')
          .update(randomHex)
          .digest('hex');
      `,
    },
    {
      code: `
        import { createHash } from 'crypto';
        const hash = createHash('sha256')
          .update('some string')
          .update('another string')
          .digest('hex');
      `,
    },
    // Valid cases using set with merge
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        }, { merge: true });
      `,
    },
    {
      code: `
        import { doc, setDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        }, { merge: true });
      `,
    },
    // Valid transaction cases
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.set(userRef, {
            preferences: {
              theme: 'dark'
            }
          }, { merge: true });
        });
      `,
    },
    // Valid transaction case with complex data
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          const currentGroups = ['group1', 'group2'];
          return transaction.set(userRef, { groups: currentGroups }, { merge: true });
        });
      `,
    },
    {
      code: `
        import { runTransaction, doc, setDoc } from 'firebase/firestore';
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', userId);
          transaction.set(userRef, {
            preferences: {
              theme: 'dark'
            }
          }, { merge: true });
        });
      `,
    },
  ],
  invalid: [
    // Invalid cases using update
    {
      code: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.update({
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const admin = require('firebase-admin');
        const db = admin.firestore();
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        }, { merge: true });
      `,
    },
    // Invalid cases using updateDoc
    {
      code: `
        import { doc, updateDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { doc, updateDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        }, { merge: true });
      `,
    },
    // Invalid case with dynamic import
    {
      code: `
        const { doc, updateDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          'preferences.theme': 'dark'
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        const { doc, updateDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          'preferences.theme': 'dark'
        }, { merge: true });
      `,
    },
    // Invalid case with aliased import
    {
      code: `
        import { updateDoc as modifyDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await modifyDoc(docRef, {
          theme: 'dark'
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        import { updateDoc as modifyDoc } from 'firebase/firestore';
        const docRef = doc(db, 'users', userId);
        await setDoc(docRef, {
          theme: 'dark'
        }, { merge: true });
      `,
    },
    // Invalid transaction case
    {
      code: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.update(userRef, {
            'preferences.theme': 'dark'
          });
        });
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        await db.runTransaction(async (transaction) => {
          const userRef = db.collection('users').doc(userId);
          transaction.set(userRef, {
            'preferences.theme': 'dark'
          }, { merge: true });
        });
      `,
    },
    // Invalid BatchManager case
    {
      code: `
        this.batchManager.update(notificationRef, updates);
      `,
      errors: [{ messageId: 'preferSetMerge' }],
      output: `
        this.batchManager.set({
          ref: notificationRef,
          data: updates,
          merge: true,
        });
      `,
    },
  ],
});
