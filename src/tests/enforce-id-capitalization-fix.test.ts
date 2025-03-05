import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIdCapitalization } from '../rules/enforce-id-capitalization';

// Test with TypeScript support to verify the fix for the bug
ruleTesterTs.run('enforce-id-capitalization-fix', enforceIdCapitalization, {
  valid: [
    // Test with parameter destructuring
    {
      code: 'function processUser({ id, name }) { return id + name; }',
    },
    // Test with nested destructuring
    {
      code: 'function processData({ user: { id, name } }) { return id + name; }',
    },
    // Test with property access
    {
      code: 'function showUserInfo(user) { console.log(user.id); }',
    },
    // Test with object property assignment
    {
      code: 'const createUser = (name) => { return { id: "123", name }; };',
    },
    // Test with object destructuring in function body
    {
      code: 'const processUser = (user) => { const { id, name } = user; return id + name; };',
    },
  ],
  invalid: [
    // Make sure user-facing text is still flagged correctly
    {
      code: 'const message = "User id: 123";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const message = "User ID: 123";',
    },
    // Test with string literals in component body
    {
      code: 'const errorMessage = "Invalid user id provided";',
      errors: [{ messageId: 'enforceIdCapitalization' }],
      output: 'const errorMessage = "Invalid user ID provided";',
    },
  ],
});
