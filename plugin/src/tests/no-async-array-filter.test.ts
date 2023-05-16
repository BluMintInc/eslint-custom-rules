import { ESLintUtils } from '@typescript-eslint/utils';
import { noAsyncArrayFilter } from '../rules/no-async-array-filter';

const ruleTester = new ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
});

ruleTester.run('no-async-array-filter', noAsyncArrayFilter, {
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
                    messageId: 'unexpected'
                },
            ],
        },
        {
            code: `['a'].filter(async function(x) {
            return true
          })`,
            errors: [
                {
                    messageId: 'unexpected'
                },
            ],
        },
    ],
});
