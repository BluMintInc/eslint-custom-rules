import { ESLintUtils } from '@typescript-eslint/utils';
import { noFilterWithoutReturn } from '../rules/no-filter-without-return';

const ruleTester = new ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
});

ruleTester.run('no-filter-without-return', noFilterWithoutReturn, {
    valid: [
        `['a'].filter((x) => !x)`,
        `['a'].filter((x) => !!x)`,
        `['a'].filter((x) => {
            if (x === 'test') {
                return true
            }
            else {
                return false
            }
        })`,
        `['a'].filter(function (x) {
          return true
        })`,
        `['a'].filter((x) => x === 'a' ? true : false)`,
    ],
    invalid: [
        {
            code: `['a'].filter((x) => {console.log(x)})`,
            errors: [
                {
                    messageId: 'unexpected'
                },
            ],
        },
        {
            code: `['a'].filter((x) => {if (x) {
                return true
            }
        else {
            
        }})`,
            errors: [
                {
                    messageId: 'unexpected'
                },
            ],
        },
        {
            code:
                // If-else with return only in the else branch
                "['a'].filter((x) => { if (x !== 'a') { console.log(x) } else { return true } })",
            errors: [
                {
                    messageId: 'unexpected'
                },
            ],
        },
    ],
});
