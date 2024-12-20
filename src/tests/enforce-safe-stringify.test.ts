import { ruleTesterTs } from '../utils/ruleTester';
import { enforceStableStringify } from '../rules/enforce-safe-stringify';

ruleTesterTs.run('enforce-safe-stringify', enforceStableStringify, {
  valid: [
    {
      code: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
    },
    {
      code: `
// Should not flag JSON.stringify in comments
// JSON.stringify example
const str = "JSON.stringify in string";
      `,
    },
  ],
  invalid: [
    {
      code: `
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      errors: [{ messageId: 'useStableStringify' }],
      output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
    },
    {
      code: `
import something from 'other-module';
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      errors: [{ messageId: 'useStableStringify' }],
      output: `
import stringify from 'safe-stable-stringify';
import something from 'other-module';
const obj = { a: 1 };
const result = stringify(obj);
      `,
    },
    {
      code: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = JSON.stringify(obj);
      `,
      errors: [{ messageId: 'useStableStringify' }],
      output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result = stringify(obj);
      `,
    },
    {
      code: `
const obj = { a: 1 };
const result1 = JSON.stringify(obj);
const result2 = JSON.stringify(obj, null, 2);
      `,
      errors: [
        { messageId: 'useStableStringify' },
        { messageId: 'useStableStringify' },
      ],
      output: `
import stringify from 'safe-stable-stringify';
const obj = { a: 1 };
const result1 = stringify(obj);
const result2 = stringify(obj, null, 2);
      `,
    },
  ],
});
