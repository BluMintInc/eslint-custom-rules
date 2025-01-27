import { ruleTesterTs } from '../utils/ruleTester';
import { noNestedFirestoreOverwrites } from '../rules/no-nested-firestore-overwrites';

ruleTesterTs.run('no-nested-firestore-overwrites', noNestedFirestoreOverwrites, {
  valid: [
    // Using dot notation is valid
    {
      code: `
        const updates = {
          'hidden.notificationsId': userData.hidden.notificationsId || [],
          'hidden.auth': userData.hidden.auth || []
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
    // Non-nested updates are valid
    {
      code: `
        const updates = {
          name: 'John',
          age: 30
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
    // Non-object values are valid
    {
      code: `
        const updates = {
          scores: [1, 2, 3],
          timestamp: new Date(),
          isActive: true,
          count: 42
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
    // Using array methods is valid
    {
      code: `
        const updates = {
          'scores.0': 100,
          'items.length': arrayUnion('newItem')
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
    // Using Firestore field values is valid
    {
      code: `
        const updates = {
          lastLogin: FieldValue.serverTimestamp(),
          counter: FieldValue.increment(1),
          tags: FieldValue.arrayUnion('new-tag')
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
  ],
  invalid: [
    // Basic update with nested object
    {
      code: `
        const updates = {
          hidden: {
            notificationsId: userData.hidden.notificationsId || [],
            auth: userData.hidden.auth || []
          }
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // Computed property with nested object
    {
      code: `
        const key = 'hidden';
        const updates = {
          [key]: {
            notificationsId: userData.hidden.notificationsId || []
          }
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // Multiple nested objects
    {
      code: `
        const updates = {
          hidden: {
            notificationsId: []
          },
          settings: {
            theme: 'dark'
          }
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [
        { messageId: 'nestedOverwrite' },
        { messageId: 'nestedOverwrite' }
      ],
    },
    // Deeply nested objects
    {
      code: `
        const updates = {
          preferences: {
            notifications: {
              email: true,
              push: {
                enabled: true,
                frequency: 'daily'
              }
            }
          }
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // Mixed valid and invalid updates
    {
      code: `
        const updates = {
          name: 'John',
          'scores.0': 100,
          preferences: {
            theme: 'dark',
            fontSize: 14
          },
          lastLogin: FieldValue.serverTimestamp()
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // Template literal computed property
    {
      code: `
        const section = 'preferences';
        const updates = {
          [\`user.\${section}\`]: {
            theme: 'dark',
            fontSize: 14
          }
        };
        db.collection('users').doc(userId).update(updates);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
  ],
});
