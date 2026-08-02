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
    // Concatenation of opaque operands builds no path inline, so it keeps the
    // same indirection allowance as a bare variable
    {
      code: 'db.doc(a + b);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'db.doc(basePath + userId);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'db.doc(toUserPath(userId) + suffix);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'db.doc(offset + 1);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation nested inside a utility function call stays behind the helper
    {
      code: 'db.doc(toUserPath("users/" + userId));',
      filename: 'src/components/User.tsx',
    },
    // Concatenation passed through an unrelated call is still indirection
    {
      code: 'db.doc(resolve("users/" + userId));',
      filename: 'src/components/User.tsx',
    },
    // Non-Firestore methods are untouched
    {
      code: 'logger.log("users/" + userId);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation in the second argument is not a path argument
    {
      code: 'db.doc(toUserPath(userId), "users/" + userId);',
      filename: 'src/components/User.tsx',
    },
    // Non-additive binary operators do not build paths
    {
      code: 'db.doc(total - count);',
      filename: 'src/components/User.tsx',
    },
    // Test files should be ignored, including concatenated paths
    {
      code: 'db.doc("users/" + userId);',
      filename: 'src/components/User.test.ts',
    },
    {
      code: 'db.collection("teams/" + teamId + "/members");',
      filename: 'src/__tests__/Team.ts',
    },
    {
      code: 'db.doc("users/" + userId);',
      filename: 'src/components/User.spec.ts',
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
    // String concatenation, the shape the rule's message tells developers to avoid
    {
      code: 'db.doc("users/" + userId);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Nested concatenation: parses as a left-nested BinaryExpression tree
    {
      code: 'db.collection("teams/" + teamId + "/members");',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Template literal combined with a literal suffix
    {
      code: 'db.doc(`users/${userId}` + "/settings");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // String literal on the right-hand side only
    {
      code: 'db.doc(userId + "/settings");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Separator literal buried in the middle of a longer chain
    {
      code: 'db.doc(prefix + "/" + userId + "/posts");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Template literal on the right-hand side
    {
      code: 'db.doc(prefix + `/${userId}`);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Literal reachable only through the right operand's own concatenation
    {
      code: 'db.doc(prefix + (userId + "/posts"));',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation of two literals
    {
      code: 'db.collection("teams/" + "members");',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation spanning multiple lines with comments
    {
      code: `db.doc(
  "users/" + // the collection
  userId
);`,
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation whose operand is a call expression
    {
      code: 'db.doc("users/" + getUserId());',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Chained Firestore access still reports
    {
      code: 'firestore.collection("teams/" + teamId + "/members").get();',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
  ],
});
