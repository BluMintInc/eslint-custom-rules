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
          tags: FieldValue.arrayUnion('new-tag'),
          removedTags: FieldValue.arrayRemove('old-tag'),
          deletedField: FieldValue.delete()
        };
        db.collection('users').doc(userId).update(updates);
      `,
    },
    // Using set() with merge: true is valid
    {
      code: `
        const data = {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        };
        db.collection('users').doc(userId).set(data, { merge: true });
      `,
    },
    // Using DocSetter with dot notation is valid
    {
      code: `
        const setter = new DocSetter();
        setter.set({
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
      `,
    },
    // Using Firebase frontend SDK with dot notation is valid
    {
      code: `
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          'preferences.theme': 'dark',
          'preferences.fontSize': 14
        });
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
    // Firebase frontend SDK with nested object
    {
      code: `
        const docRef = doc(db, 'users', userId);
        await updateDoc(docRef, {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        });
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // DocSetter with nested object
    {
      code: `
        const setter = new DocSetter();
        setter.set({
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        });
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // set() without merge option
    {
      code: `
        const data = {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        };
        db.collection('users').doc(userId).set(data);
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // set() with merge: false
    {
      code: `
        const data = {
          preferences: {
            theme: 'dark',
            fontSize: 14
          }
        };
        db.collection('users').doc(userId).set(data, { merge: false });
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
  ],
});
