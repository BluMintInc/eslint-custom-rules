import { ruleTesterTs } from '../utils/ruleTester';
import { noUnsafeFirestoreSpread } from '../rules/no-unsafe-firestore-spread';

const pathLabel = (path?: string) => (path ? path : 'the merge payload');
const errorData = (path?: string) => ({ path: pathLabel(path) });

ruleTesterTs.run('no-unsafe-firestore-spread', noUnsafeFirestoreSpread, {
  valid: [
    // Valid: Non-Firestore set methods
    {
      code: `
        const mySet = new Set();
        mySet.add(1);
        const spreadArray = [...mySet];
      `,
    },
    {
      code: `
        const myMap = new Map();
        myMap.set('key', { ...someObject });
      `,
    },
    {
      code: `
        class CustomClass {
          set property({ ...value }) {
            this._property = value;
          }
        }
      `,
    },
    {
      code: `
        const customObj = {
          set: (data) => {
            return { ...data };
          }
        };
        customObj.set({ ...someData });
      `,
    },
    {
      code: `
        React.useState(new Set([...items]));
      `,
    },
    {
      code: `
        // DOM Set methods
        element.dataset.value = JSON.stringify({ ...data });
      `,
    },
    {
      code: `
        // Set with options but not merge: true
        customRef.set({ ...data }, { overwrite: true });
      `,
    },
    {
      code: `
        // Method named setData
        obj.setData({ ...data });
      `,
    },
    {
      code: `
        // Set in promise chain
        Promise.resolve()
          .then(set => set({ ...data }));
      `,
    },
    // Valid: Using dot notation for object updates
    {
      code: `
        await userDoc.ref.set(
          {
            'hidden.activePlayback': FieldValue.delete(),
          },
          { merge: true }
        );
      `,
    },
    // Valid: Using FieldValue.arrayUnion for array updates
    {
      code: `
        await userDoc.ref.set(
          {
            myIds: FieldValue.arrayUnion(newId),
          },
          { merge: true }
        );
      `,
    },
    // Valid: Regular set without merge
    {
      code: `
        await userDoc.ref.set({
          hidden: {
            ...hidden,
            activePlayback: false,
          },
        });
      `,
    },
    // Valid: Regular object without spreads
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              activePlayback: false,
            },
          },
          { merge: true }
        );
      `,
    },
    // Valid: Using FieldValue methods in array
    {
      code: `
        await userDoc.ref.set(
          {
            tags: FieldValue.arrayUnion(...newTags),
            removedTags: FieldValue.arrayRemove(...oldTags),
          },
          { merge: true }
        );
      `,
    },
    // Valid: Using update() method with dot notation
    {
      code: `
        await userDoc.ref.update({
          'preferences.theme': 'dark',
          'settings.notifications': true,
        });
      `,
    },
    // Valid: Using transaction with FieldValue
    {
      code: `
        await db.runTransaction(async (t) => {
          t.set(docRef, {
            counter: FieldValue.increment(1),
            lastUpdate: FieldValue.serverTimestamp(),
          }, { merge: true });
        });
      `,
    },
    // Valid: Using batch with dot notation
    {
      code: `
        const batch = db.batch();
        batch.set(docRef, {
          'user.lastLogin': FieldValue.serverTimestamp(),
          'user.visits': FieldValue.increment(1),
        }, { merge: true });
      `,
    },
    // Valid: Computed property names without spread
    {
      code: `
        const field = 'status';
        await userDoc.ref.set(
          {
            [field]: 'active',
            timestamp: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      `,
    },
    // Valid: Function call result without spread
    {
      code: `
        await userDoc.ref.set(
          {
            metadata: getMetadata(),
            timestamp: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      `,
    },
    {
      code: `
        // Frontend SDK: Valid import and usage without spreads
        import { doc, setDoc } from 'firebase/firestore';
        await setDoc(doc(db, 'users', userId), {
          name: 'John',
          age: 30
        }, { merge: true });
      `,
    },
    {
      code: `
        // Frontend SDK: Valid usage with FieldValue
        import { doc, setDoc, arrayUnion } from 'firebase/firestore';
        await setDoc(doc(db, 'users', userId), {
          tags: arrayUnion('new-tag'),
          lastUpdate: serverTimestamp()
        }, { merge: true });
      `,
    },
    {
      code: `
        // Frontend SDK: Valid nested paths
        import { doc, setDoc } from 'firebase/firestore';
        await setDoc(doc(db, 'users', userId), {
          'profile.settings.theme': 'dark',
          'profile.settings.notifications': true
        }, { merge: true });
      `,
    },
    {
      code: `
        // Frontend SDK: Valid transaction
        import { doc, runTransaction } from 'firebase/firestore';
        await runTransaction(db, async (transaction) => {
          transaction.set(doc(db, 'users', userId), {
            counter: increment(1)
          }, { merge: true });
        });
      `,
    },
    {
      code: `
        // Frontend SDK: Valid batch
        import { doc, writeBatch } from 'firebase/firestore';
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', userId), {
          'status.online': true
        }, { merge: true });
      `,
    },
  ],
  invalid: [
    // Invalid: Object spread in merge update
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              ...hidden,
              activePlayback: FieldValue.delete(),
            },
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'unsafeObjectSpread', data: errorData('hidden') }],
    },
    // Invalid: Array spread in merge update
    {
      code: `
        await userDoc.ref.set(
          {
            myIds: [...myIds, newId],
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'unsafeArraySpread', data: errorData('myIds') }],
    },
    // Invalid: Multiple spreads in merge update
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              ...hidden,
              activePlayback: FieldValue.delete(),
            },
            myIds: [...myIds, newId],
          },
          { merge: true }
        );
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('hidden') },
        { messageId: 'unsafeArraySpread', data: errorData('myIds') },
      ],
    },
    // Invalid: Nested object spread
    {
      code: `
        await userDoc.ref.set(
          {
            settings: {
              preferences: {
                ...preferences,
                theme: 'dark',
              },
            },
          },
          { merge: true }
        );
      `,
      errors: [
        {
          messageId: 'unsafeObjectSpread',
          data: errorData('settings.preferences'),
        },
      ],
    },
    // Invalid: Dynamic object construction with spread
    {
      code: `
        const updates = { ...baseSettings };
        await userDoc.ref.set(
          {
            settings: {
              ...updates,
              timestamp: FieldValue.serverTimestamp(),
            },
          },
          { merge: true }
        );
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('settings') },
      ],
    },
    // Invalid: Spread in array methods
    {
      code: `
        await userDoc.ref.set(
          {
            tags: [...oldTags].filter(t => t !== 'removed'),
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'unsafeArraySpread', data: errorData('tags') }],
    },
    // Invalid: Spread in computed property
    {
      code: `
        const prefix = 'user';
        await userDoc.ref.set(
          {
            [\`\${prefix}.settings\`]: {
              ...userSettings,
              updated: true,
            },
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'unsafeObjectSpread', data: errorData() }],
    },
    // Invalid: Spread in transaction
    {
      code: `
        await db.runTransaction(async (t) => {
          t.set(docRef, {
            data: {
              ...existingData,
              counter: FieldValue.increment(1),
            },
          }, { merge: true });
        });
      `,
      errors: [{ messageId: 'unsafeObjectSpread', data: errorData('data') }],
    },
    // Invalid: Spread in batch operation
    {
      code: `
        const batch = db.batch();
        batch.set(docRef, {
          settings: {
            ...currentSettings,
            updated: true,
          },
        }, { merge: true });
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('settings') },
      ],
    },
    // Invalid: Conditional spread
    {
      code: `
        await userDoc.ref.set(
          {
            preferences: {
              ...(isDark ? darkTheme : lightTheme),
              customized: true,
            },
          },
          { merge: true }
        );
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('preferences') },
      ],
    },
    // Invalid: Spread in array with FieldValue
    {
      code: `
        await userDoc.ref.set(
          {
            tags: [...currentTags, FieldValue.arrayUnion(...newTags)],
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'unsafeArraySpread', data: errorData('tags') }],
    },
    // Invalid: Multiple nested spreads
    {
      code: `
        await userDoc.ref.set(
          {
            user: {
              profile: {
                ...baseProfile,
                settings: {
                  ...baseSettings,
                  theme: 'dark',
                },
              },
              preferences: [...defaultPrefs],
            },
          },
          { merge: true }
        );
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('user.profile') },
        {
          messageId: 'unsafeObjectSpread',
          data: errorData('user.profile.settings'),
        },
        { messageId: 'unsafeArraySpread', data: errorData('user.preferences') },
      ],
    },
    // Add frontend SDK invalid cases
    {
      code: `
        // Frontend SDK: Invalid object spread
        import { doc, setDoc } from 'firebase/firestore';
        await setDoc(doc(db, 'users', userId), {
          profile: {
            ...existingProfile,
            lastLogin: serverTimestamp()
          }
        }, { merge: true });
      `,
      errors: [{ messageId: 'unsafeObjectSpread', data: errorData('profile') }],
    },
    {
      code: `
        // Frontend SDK: Invalid array spread in transaction
        import { doc, runTransaction } from 'firebase/firestore';
        await runTransaction(db, async (transaction) => {
          transaction.set(doc(db, 'users', userId), {
            tags: [...existingTags, 'new-tag']
          }, { merge: true });
        });
      `,
      errors: [{ messageId: 'unsafeArraySpread', data: errorData('tags') }],
    },
    {
      code: `
        // Frontend SDK: Invalid nested spreads in batch
        import { doc, writeBatch } from 'firebase/firestore';
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', userId), {
          settings: {
            ...currentSettings,
            notifications: {
              ...currentNotifications,
              email: true
            }
          }
        }, { merge: true });
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('settings') },
        {
          messageId: 'unsafeObjectSpread',
          data: errorData('settings.notifications'),
        },
      ],
    },
    {
      code: `
        // Frontend SDK: Invalid mix of spreads
        import { doc, setDoc } from 'firebase/firestore';
        await setDoc(doc(db, 'users', userId), {
          profile: {
            ...baseProfile,
            preferences: [...defaultPreferences]
          }
        }, { merge: true });
      `,
      errors: [
        { messageId: 'unsafeObjectSpread', data: errorData('profile') },
        {
          messageId: 'unsafeArraySpread',
          data: errorData('profile.preferences'),
        },
      ],
    },
  ],
});
