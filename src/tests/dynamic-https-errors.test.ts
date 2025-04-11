import { ruleTesterTs } from '../utils/ruleTester';
import { dynamicHttpsErrors } from '../rules/dynamic-https-errors';

ruleTesterTs.run('dynamic-https-errors', dynamicHttpsErrors, {
  valid: [
    // Valid cases with static second argument and present third argument
    "throw new https.HttpsError('foo', 'bar', 'baz');",
    "throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);",
    `throw new HttpsError('foo', 'bar', 'baz');`,
    // Object literal as third argument
    "throw new https.HttpsError('foo', 'bar', { details: baz });",
    "throw new HttpsError('foo', 'bar', { context: foo, data: bar });",
  ],
  invalid: [
    // Dynamic content in second argument
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
      code: `throw new HttpsError('foo', \`Error: \${bar}\`, 'baz');`,
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    },

    // Missing third argument
    {
      code: "throw new https.HttpsError('foo', 'bar');",
      errors: [{ messageId: 'missingDetailsArg' }],
    },
    {
      code: "throw new HttpsError('invalid-argument', 'No orderBy found in scoreOptions for index 0');",
      errors: [{ messageId: 'missingDetailsArg' }],
    },
    {
      code: "https.HttpsError('foo', 'bar');",
      errors: [{ messageId: 'missingDetailsArg' }],
    },

    // Both issues: dynamic content in second argument and missing third argument
    {
      code: "throw new https.HttpsError('foo', `Error: ${bar}`);",
      errors: [
        { messageId: 'missingDetailsArg' },
        { messageId: 'dynamicHttpsErrors' }
      ],
    },
    {
      code: "throw new HttpsError('foo', `Missing ${item}`);",
      errors: [
        { messageId: 'missingDetailsArg' },
        { messageId: 'dynamicHttpsErrors' }
      ],
    },
  ],
});
