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
  ],
});
