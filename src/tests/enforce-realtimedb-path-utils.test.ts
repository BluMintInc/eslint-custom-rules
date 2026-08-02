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
    // Helper calls stay allowed alongside the concatenation handling
    {
      code: 'admin.database().ref(toUserPath(userId));',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'admin.database().ref(path);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation of opaque operands builds no path fragment inline, so it
    // keeps the same indirection allowance as a bare variable
    {
      code: 'admin.database().ref(a + b);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'admin.database().ref(basePath + userId);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'admin.database().ref(toUserPath(userId) + suffix);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'admin.database().ref(offset + 1);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation nested inside a utility function call stays behind the helper
    {
      code: 'admin.database().ref(toUserPath("users/" + userId));',
      filename: 'src/components/User.tsx',
    },
    // Concatenation passed through an unrelated call is still indirection
    {
      code: 'admin.database().ref(resolve("users/" + userId));',
      filename: 'src/components/User.tsx',
    },
    // Non-additive binary operators do not build paths
    {
      code: 'admin.database().ref(total - count);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation in a non-path argument position is untouched
    {
      code: 'admin.database().ref(toUserPath(userId), "users/" + userId);',
      filename: 'src/components/User.tsx',
    },
    // Concatenation outside the RTDB chain is untouched
    {
      code: 'logger.log("users/" + userId);',
      filename: 'src/components/User.tsx',
    },
    {
      code: 'someOtherDb.ref("users/" + userId);',
      filename: 'src/components/User.tsx',
    },
    // Test and mock files should be ignored, including concatenated paths
    {
      code: 'admin.database().ref("users/" + userId);',
      filename: 'src/components/User.test.ts',
    },
    {
      code: 'admin.database().ref("users/" + userId);',
      filename: 'src/components/User.spec.ts',
    },
    {
      code: 'admin.database().ref("teams/" + teamId + "/members");',
      filename: 'src/__tests__/Team.ts',
    },
    {
      code: 'admin.database().ref("users/" + userId);',
      filename: 'src/components/__mocks__/User.ts',
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
    // String concatenation, the shape the rule's message tells developers to avoid
    {
      code: 'admin.database().ref("users/" + userId);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation in both ref() and a chained child()
    {
      code: 'firebase.database().ref("users/" + userId).child("posts/" + postId);',
      filename: 'src/components/User.tsx',
      errors: [
        { messageId: 'requirePathUtil' },
        { messageId: 'requirePathUtil' },
      ],
    },
    // Template literal combined with a literal suffix
    {
      code: 'admin.database().ref(`users/${userId}` + "/settings");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // String literal on the right-hand side only
    {
      code: 'admin.database().ref(userId + "/settings");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Nested concatenation: parses as a left-nested BinaryExpression tree
    {
      code: 'firebase.database().ref("teams/" + teamId + "/members");',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Separator literal buried in the middle of a longer chain
    {
      code: 'admin.database().ref(prefix + "/" + userId + "/posts");',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Template literal on the right-hand side
    {
      code: 'admin.database().ref(prefix + `/${userId}`);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Literal reachable only through the right operand's own concatenation
    {
      code: 'admin.database().ref(prefix + (userId + "/posts"));',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation of two literals
    {
      code: 'firebase.database().ref("teams/" + "members");',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation whose operand is a call expression
    {
      code: 'admin.database().ref("users/" + getUserId());',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation only in the chained child() call
    {
      code: 'firebase.database().ref(toUserPath(userId)).child("posts/" + postId);',
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenation spanning multiple lines with comments
    {
      code: `admin.database().ref(
  "users/" + // the collection
  userId
);`,
      filename: 'src/components/User.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
    // Concatenated path followed by an unrelated RTDB method call
    {
      code: 'firebase.database().ref("teams/" + teamId).once("value");',
      filename: 'src/components/Team.tsx',
      errors: [{ messageId: 'requirePathUtil' }],
    },
  ],
});
