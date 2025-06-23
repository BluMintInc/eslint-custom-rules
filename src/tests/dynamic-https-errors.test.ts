import { ruleTesterTs } from '../utils/ruleTester';
import { dynamicHttpsErrors } from '../rules/dynamic-https-errors';

ruleTesterTs.run('dynamic-https-errors', dynamicHttpsErrors, {
  valid: [
    // Valid cases - all have 3 arguments and no dynamic content in second argument
    "throw new https.HttpsError('foo', 'bar', 'baz');",
    "throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);",
    "throw new HttpsError('foo', 'bar', 'baz');",
    "throw new HttpsError('invalid-argument', 'Static error message', { context: 'data' });",
    "throw new https.HttpsError('permission-denied', 'Access denied', { userId, resource });",
    "new HttpsError('not-found', 'Resource not found', { id: resourceId });",
    "https.HttpsError('internal', 'Server error', { timestamp: Date.now() });",
    // Test with more than 3 arguments (should be valid)
    "throw new HttpsError('foo', 'bar', 'baz', 'extra');",
  ],
  invalid: [
    // Invalid cases for dynamic content in second argument
    {
      code: "throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');",
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    },
    {
      code: "https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    },
    {
      code: "throw https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    },
    {
      code: "throw new HttpsError('foo', `Error: ${bar}`, 'baz');",
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    },
    // Invalid cases for missing third argument
    {
      code: "throw new HttpsError('invalid-argument', 'No orderBy found');",
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    {
      code: "throw new https.HttpsError('permission-denied', 'Access denied');",
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    {
      code: "new HttpsError('not-found', 'Resource not found');",
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    {
      code: "https.HttpsError('internal', 'Server error');",
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    {
      code: "throw new HttpsError('foo');",
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    {
      code: 'throw new HttpsError();',
      errors: [{ messageId: 'missingThirdArgument' }],
    },
    // Cases with both issues - dynamic content AND missing third argument
    {
      code: "throw new HttpsError('foo', `Error: ${bar}`);",
      errors: [
        { messageId: 'missingThirdArgument' },
        { messageId: 'dynamicHttpsErrors' },
      ],
    },
    {
      code: "https.HttpsError('foo', `Error: ${bar}`);",
      errors: [
        { messageId: 'missingThirdArgument' },
        { messageId: 'dynamicHttpsErrors' },
      ],
    },
  ],
});
