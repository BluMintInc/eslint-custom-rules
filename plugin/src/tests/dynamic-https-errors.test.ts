import { ruleTesterTs } from '../utils/ruleTester';
import { dynamicHttpsErrors } from '../rules/dynamic-https-errors';

ruleTesterTs.run('dynamic-https-errors', dynamicHttpsErrors, {
  valid: [
    "throw new https.HttpsError('foo', 'bar', 'baz');",
    "throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);",
    `throw new HttpsError('foo', 'bar', 'baz');`,
  ],
  invalid: [
    "throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');",
    "https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
    "throw https.HttpsError('foo', `Error: ${bar}`, `baz: ${baz}`);",
    `throw new HttpsError('foo', \`Error: \${bar}\`, 'baz');`,
  ].map((testCase) => {
    return {
      code: testCase,
      errors: [{ messageId: 'dynamicHttpsErrors' }],
    };
  }),
});
