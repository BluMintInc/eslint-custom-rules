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
    // set() with merge: true is valid
    {
      code: `
        const updates = {
          hidden: {
            notificationsId: userData.hidden.notificationsId || [],
            auth: userData.hidden.auth || []
          }
        };
        db.collection('users').doc(userId).set(updates, { merge: true });
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
    // Computed properties are ignored
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
    // DocSetter with nested object
    {
      code: `
        const setter = new DocSetter();
        setter.setHidden({
          notificationsId: userData.hidden.notificationsId || [],
          auth: userData.hidden.auth || []
        });
      `,
      errors: [{ messageId: 'nestedOverwrite' }],
    },
    // set() without merge option
    {
      code: `
        const updates = {
          hidden: {
            notificationsId: userData.hidden.notificationsId || [],
            auth: userData.hidden.auth || []
          }
        };
        db.collection('users').doc(userId).set(updates);
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
  ],
});
