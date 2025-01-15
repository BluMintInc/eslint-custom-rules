import { ruleTesterTs } from '../utils/ruleTester';
import { enforceRealtimedbPathUtils } from '../rules/enforce-realtimedb-path-utils';

ruleTesterTs.run('enforce-realtimedb-path-utils', enforceRealtimedbPathUtils, {
  valid: [
    // Using utility functions
    {
      code: `
        const userRef = firebase.database().ref(toUserPath(userId));
      `,
    },
    {
      code: `
        const itemRef = db.ref(toItemPath(itemId));
      `,
    },
    // Using utility functions with child()
    {
      code: `
        const detailsRef = firebase.database().ref(toItemPath(itemId)).child(toDetailsPath());
      `,
    },
    // Using variables (not string literals)
    {
      code: `
        const path = getPath();
        const ref = firebase.database().ref(path);
      `,
    },
    // Test files should be ignored
    {
      code: `
        const ref = firebase.database().ref('users/123');
      `,
      filename: 'src/__tests__/test.ts',
    },
    {
      code: `
        const ref = firebase.database().ref('items/456');
      `,
      filename: 'src/mocks/firebase.ts',
    },
    // Non-RTDB calls should be ignored
    {
      code: `
        const ref = someOtherDb.ref('path/to/something');
      `,
    },
  ],
  invalid: [
    // String literals in ref()
    {
      code: `
        const userRef = firebase.database().ref('users/123');
      `,
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Template literals in ref()
    {
      code: `
        const itemRef = firebase.database().ref(\`items/\${itemId}\`);
      `,
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // String literals in child()
    {
      code: `
        const detailsRef = firebase.database().ref(toItemPath(itemId)).child('details');
      `,
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Multi-line template literals
    {
      code: `
        const complexRef = firebase.database().ref(\`items/\${
          getItemId()
        }/details/\${detailId}\`);
      `,
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Backend SDK (firebase-admin)
    {
      code: `
        const adminRef = admin.database().ref('users/123');
      `,
      errors: [{ messageId: 'requirePathUtil' }],
    },
  ],
});
