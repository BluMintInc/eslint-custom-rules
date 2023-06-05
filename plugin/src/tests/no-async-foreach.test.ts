import { noAsyncForEach } from '../rules/no-async-foreach';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-async-foreach', noAsyncForEach, {
  valid: [
    `['a', 'b', 'c'].forEach((letter) => { someSyncFunction(letter); console.log(letter); });`,
    `for (const letter of ['a', 'b', 'c']) { someSyncFunction(letter); console.log(letter); }`,
    `['foo', 'bar'].forEach(function(letter) { someSyncFunction(letter); console.log(letter); });`,
  ],
  invalid: [
    {
      code: `['a', 'b', 'c'].forEach(async (letter) => { await someAsyncFunction(letter); console.log(letter); });`,
      errors: [{ messageId: 'noAsyncForEach' }],
    },
    {
      code: `['foo', 'bar'].forEach(async function(letter) { await someAsyncFunction(letter); console.log(letter); });`,
      errors: [{ messageId: 'noAsyncForEach' }],
    },
  ],
});
