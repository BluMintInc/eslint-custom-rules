import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFieldPathMerge } from '../rules/enforce-fieldpath-merge';

ruleTesterTs.run('enforce-fieldpath-merge', enforceFieldPathMerge, {
  valid: [
    // Valid: Using dot notation
    {
      code: `
        await userDoc.ref.set(
          { 'hidden.activePlayback': FieldValue.delete() },
          { merge: true }
        );
      `,
    },
    // Valid: No merge option
    {
      code: `
        await userDoc.ref.set({
          hidden: {
            activePlayback: FieldValue.delete(),
          },
        });
      `,
    },
    // Valid: merge: false
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              activePlayback: FieldValue.delete(),
            },
          },
          { merge: false }
        );
      `,
    },
    // Valid: No nested objects
    {
      code: `
        await userDoc.ref.set(
          { status: 'active' },
          { merge: true }
        );
      `,
    },
  ],
  invalid: [
    // Invalid: Nested object with merge: true
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              activePlayback: FieldValue.delete(),
            },
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'hidden.activePlayback': FieldValue.delete() },
          { merge: true }
        );
      `,
    },
    // Invalid: Mixed nested and dot notation
    {
      code: `
        await userDoc.ref.set(
          {
            hidden: {
              activePlayback: FieldValue.delete(),
            },
            'user.status': 'active',
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'hidden.activePlayback': FieldValue.delete(), 'user.status': 'active' },
          { merge: true }
        );
      `,
    },
    // Invalid: Multiple levels of nesting
    {
      code: `
        await userDoc.ref.set(
          {
            user: {
              profile: {
                settings: {
                  theme: 'dark',
                },
              },
            },
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'user.profile.settings.theme': 'dark' },
          { merge: true }
        );
      `,
    },
  ],
});
