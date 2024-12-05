import { noAsyncArrayFilter } from '../rules/no-async-array-filter';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-async-array-filter', noAsyncArrayFilter, {
  valid: [
    `['a'].filter((x) => true)`,
    `['a'].filter(function (x) {
          return true
        })`,
  ],
  invalid: [
    {
      code: `['a'].filter(async (x) => true)`,
      errors: [
        {
          messageId: 'unexpected',
        },
      ],
    },
    {
      code: `['a'].filter(async function(x) {
            return true
          })`,
      errors: [
        {
          messageId: 'unexpected',
        },
      ],
    },
  ],
});
