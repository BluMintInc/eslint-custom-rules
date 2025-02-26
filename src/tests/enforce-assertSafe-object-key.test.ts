import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertSafeObjectKey } from '../rules/enforce-assertSafe-object-key';

ruleTesterTs.run('enforce-assertSafe-object-key', enforceAssertSafeObjectKey, {
  valid: [
    {
      code: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      // Direct property access (not computed) should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj.key1);
      `,
    },
    {
      // Direct string literal in brackets should be valid
      code: `
const obj = { key1: 'value1', key2: 'value2' };
console.log(obj['key1']);
      `,
    },
    {
      // Number index should be valid
      code: `
const arr = ['value1', 'value2'];
console.log(arr[0]);
      `,
    },
  ],
  invalid: [
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [{ messageId: 'useAssertSafe' }],
      output: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [{ messageId: 'useAssertSafe' }],
      output: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[String(id)]);
      `,
      errors: [{ messageId: 'useAssertSafe' }],
      output: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[\`\${id}\`]);
      `,
      errors: [{ messageId: 'useAssertSafe' }],
      output: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
console.log(obj[assertSafe(id)]);
      `,
    },
    {
      code: `
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[String(id)];
      `,
      errors: [{ messageId: 'useAssertSafe' }],
      output: `
import { assertSafe } from 'utils/assertions';
import something from 'other-module';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value = obj[assertSafe(id)];
      `,
    },
    {
      code: `
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[String(id)];
const value2 = obj[\`\${id}\`];
      `,
      errors: [
        { messageId: 'useAssertSafe' },
        { messageId: 'useAssertSafe' },
      ],
      output: `
import { assertSafe } from 'utils/assertions';
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';
const value1 = obj[assertSafe(id)];
const value2 = obj[assertSafe(id)];
      `,
    },
  ],
});
