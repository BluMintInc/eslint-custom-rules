import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFirestorePathUtils } from '../rules/enforce-firestore-path-utils';

ruleTesterTs.run('enforce-firestore-path-utils', enforceFirestorePathUtils, {
  valid: [
    // Using utility functions
    {
      code: 'db.doc(toUserPath(userId));',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'db.collection(toSubItemCollectionPath(itemId));',
      filename: 'src/components/Items.tsx',
    },
    // Dynamic paths using variables
    {
      code: 'db.doc(path);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'const path = getUserPath(); db.doc(path);',
      filename: 'src/components/User.tsx',
    },
    // Test files should be ignored
    {
      code: 'db.doc(`User/${userId}`);',
      filename: 'src/__tests__/User.test.ts',
    },
    {
      code: 'db.collection(`Items/${itemId}/SubItems`);',
      filename: 'src/components/Items.spec.ts',
    },
    // Non-string literals
    {
      code: 'db.doc(getPath());',
      filename: 'src/components/User.tsx',
    },
    // Modular API with utility function should be allowed
    {
      code: 'doc(firestore, toUserPath(userId));',
      filename: 'src/components/User.tsx',
    },
  ],
  invalid: [
    // String literals
    {
      code: 'db.doc(`User/${userId}`);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    {
      code: 'db.collection(`Items/${itemId}/SubItems`);',
      filename: 'src/components/Items.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Regular string literals
    {
      code: 'db.doc("User/123");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Multi-line template literals
    {
      code: `db.doc(\`Items/\${
        getItemId()
      }/SubItems/\${subItemId}\`);`,
      filename: 'src/components/Items.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Binary string concatenation
    {
      code: 'doc("users/" + userId);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Modular API with inline string paths
    {
      code: 'doc(firestore, "users/" + userId);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    {
      code: 'collection(firestore, "users");',
      filename: 'src/components/Items.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
  ],
});
