import { ruleTesterTs } from '../utils/ruleTester';
import { preferDocumentFlattening } from '../rules/prefer-document-flattening';

ruleTesterTs.run('prefer-document-flattening', preferDocumentFlattening, {
  valid: [
    // Test: DocSetter with shouldFlatten option
    `
      const userSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await userSetter.set({
        id: 'user123',
        profile: {
          personal: {
            firstName: 'John',
            lastName: 'Doe'
          },
          settings: {
            theme: 'dark',
            notifications: {
              email: true,
              push: false
            }
          }
        }
      });
    `,

    // Test: DocSetterTransaction with shouldFlatten option
    `
      const userTx = new DocSetterTransaction<UserDocument>(
        db.collection('users'),
        {
          transaction,
          shouldFlatten: true,
          convertDate: true
        }
      );

      await userTx.set({
        id: 'user123',
        profile: {
          settings: { theme: 'dark' }
        }
      });
    `,

    // Test: DocSetter without shouldFlatten but setting flat document
    `
      const userSetter = new DocSetter<SimpleUser>(db.collection('simpleUsers'));

      await userSetter.set({
        id: 'user123',
        name: 'John Doe',
        email: 'john@example.com'
      });
    `,

    // Test: DocSetter with shouldFlatten and using field path notation
    `
      const userSetter = new DocSetter<UserDocument>(
        db.collection('users'),
        { shouldFlatten: true }
      );

      await userSetter.updateIfExists({
        id: 'user123',
        'profile.settings.theme': 'light'
      });
    `,
  ],
  invalid: [
    // Test: DocSetter without shouldFlatten setting nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.set({
          id: 'user123',
          profile: {
            personal: {
              firstName: 'John',
              lastName: 'Doe'
            }
          }
        });
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },

    // Test: DocSetterTransaction without shouldFlatten setting nested objects
    {
      code: `
        const userTx = new DocSetterTransaction<UserDocument>(
          db.collection('users'),
          {
            transaction,
            convertDate: true
          }
        );

        await userTx.set({
          id: 'user123',
          profile: {
            settings: { theme: 'dark' }
          }
        });
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },

    // Test: DocSetter without shouldFlatten using setAll with nested objects
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(db.collection('users'));

        await userSetter.setAll([
          {
            id: 'user1',
            name: 'Alice'
          },
          {
            id: 'user2',
            profile: {
              settings: { theme: 'dark' }
            }
          }
        ]);
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },

    // Test: DocSetter with complex constructor but missing shouldFlatten
    {
      code: `
        const userSetter = new DocSetter<UserDocument>(
          db.collection('users'),
          {
            convertDate: true,
            lowercaseEvmAddress: true,
            // shouldFlatten is missing
          }
        );

        await userSetter.set({
          id: 'user123',
          profile: {
            settings: {
              theme: 'dark'
            }
          }
        });
      `,
      errors: [{ messageId: 'preferDocumentFlattening' }],
    },
  ],
});
