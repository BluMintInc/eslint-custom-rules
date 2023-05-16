import { ESLintUtils } from '@typescript-eslint/utils';
import { genericStartsWithT } from '../rules/generic-starts-with-t';

const ruleTester = new ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
});

ruleTester.run('generic-starts-with-t', genericStartsWithT, {
    valid: [
        // Generic type starts with T
        "type GenericType<TParam> = TParam[];",

        // Multiple generic types start with T
        "type GenericType<TParam1, TParam2> = [TParam1, TParam2];",

        // Single letter generic type T
        "type GenericType<T> = T[];"
    ],
    invalid: [
        // Generic type doesn't start with T
        "type GenericType<Param> = Param[];",

        // One of multiple generic types doesn't start with T
        "type GenericType<TParam, Param> = [TParam, Param];",

        // Single letter generic type that isn't T
        "type GenericType<P> = P[];"
    ].map(testCase => {
        return {
            code: testCase,
            errors: [{ messageId: 'genericStartsWithT' }]
        };
    })
});
