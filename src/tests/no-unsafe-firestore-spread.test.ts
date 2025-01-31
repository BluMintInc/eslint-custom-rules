import { ruleTesterTs } from '../utils/ruleTester';
import { noUnsafeFirestoreSpread } from '../rules/no-unsafe-firestore-spread';

ruleTesterTs.run('no-unsafe-firestore-spread', noUnsafeFirestoreSpread, {
  valid: [
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeArraySpread' }],
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
        { messageId: 'unsafeObjectSpread' },
        { messageId: 'unsafeArraySpread' },
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeArraySpread' }],
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeObjectSpread' }],
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
      errors: [{ messageId: 'unsafeArraySpread' }],
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
        { messageId: 'unsafeObjectSpread' },
        { messageId: 'unsafeObjectSpread' },
        { messageId: 'unsafeArraySpread' },
      ],
    },
  ],
});
