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
    // Valid: Multiple dot notation fields
    {
      code: `
        await userDoc.ref.set(
          {
            'user.profile.name': 'John',
            'user.profile.age': 30,
            'settings.theme': 'dark'
          },
          { merge: true }
        );
      `,
    },
    // Valid: Using variables and expressions
    {
      code: `
        const status = 'active';
        await userDoc.ref.set(
          { 'user.status': status },
          { merge: true }
        );
      `,
    },
    // Valid: Using array values
    {
      code: `
        await userDoc.ref.set(
          { 'user.tags': ['tag1', 'tag2'] },
          { merge: true }
        );
      `,
    },
    // Valid: Using FieldValue operations
    {
      code: `
        await userDoc.ref.set(
          {
            'user.count': FieldValue.increment(1),
            'user.tags': FieldValue.arrayUnion('newTag'),
            'user.lastUpdate': FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      `,
    },
    // Valid: Using merge with empty object
    {
      code: `
        await userDoc.ref.set({}, { merge: true });
      `,
    },
    // Valid: Using merge with single-level object
    {
      code: `
        await userDoc.ref.set(
          { a: 1, b: 2, c: 3 },
          { merge: true }
        );
      `,
    },
    // Valid: Using special characters in field paths
    {
      code: `
        await userDoc.ref.set(
          { 'user.special\\.field': 'value' },
          { merge: true }
        );
      `,
    },
    // Valid: Not a Firestore set operation
    {
      code: `
        someOtherObject.set(
          {
            nested: {
              field: 'value'
            }
          },
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
    // Invalid: Multiple nested objects with arrays and FieldValues
    {
      code: `
        await userDoc.ref.set(
          {
            user: {
              profile: {
                tags: ['tag1', 'tag2'],
                counts: {
                  visits: FieldValue.increment(1),
                  posts: 5
                }
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'user.profile.tags': ['tag1', 'tag2'], 'user.profile.counts.visits': FieldValue.increment(1), 'user.profile.counts.posts': 5 },
          { merge: true }
        );
      `,
    },
    // Invalid: Nested objects with special characters
    {
      code: `
        await userDoc.ref.set(
          {
            'user.data': {
              'special.field': {
                value: true
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'user.data.special.field.value': true },
          { merge: true }
        );
      `,
    },
    // Invalid: Complex nested structure with mixed types
    {
      code: `
        await userDoc.ref.set(
          {
            metadata: {
              created: FieldValue.serverTimestamp(),
              tags: {
                primary: ['main'],
                secondary: {
                  optional: ['extra']
                }
              },
              status: {
                active: true,
                lastUpdate: {
                  timestamp: FieldValue.serverTimestamp(),
                  by: 'system'
                }
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'metadata.created': FieldValue.serverTimestamp(), 'metadata.tags.primary': ['main'], 'metadata.tags.secondary.optional': ['extra'], 'metadata.status.active': true, 'metadata.status.lastUpdate.timestamp': FieldValue.serverTimestamp(), 'metadata.status.lastUpdate.by': 'system' },
          { merge: true }
        );
      `,
    },
    // Invalid: Nested objects with empty objects
    {
      code: `
        await userDoc.ref.set(
          {
            user: {
              profile: {},
              settings: {
                theme: 'dark'
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'user.settings.theme': 'dark' },
          { merge: true }
        );
      `,
    },
    // Invalid: Multiple nested objects with null values
    {
      code: `
        await userDoc.ref.set(
          {
            data: {
              field1: null,
              nested: {
                field2: null
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'data.field1': null, 'data.nested.field2': null },
          { merge: true }
        );
      `,
    },
    // Invalid: Nested objects with FieldValue operations
    {
      code: `
        await userDoc.ref.set(
          {
            counters: {
              stats: {
                visits: FieldValue.increment(1),
                likes: FieldValue.increment(1)
              },
              flags: {
                isActive: FieldValue.delete()
              }
            }
          },
          { merge: true }
        );
      `,
      errors: [{ messageId: 'useFieldPath' }],
      output: `
        await userDoc.ref.set(
          { 'counters.stats.visits': FieldValue.increment(1), 'counters.stats.likes': FieldValue.increment(1), 'counters.flags.isActive': FieldValue.delete() },
          { merge: true }
        );
      `,
    },
  ],
});
