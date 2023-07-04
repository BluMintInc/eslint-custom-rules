import { RuleTester } from 'eslint';
import rule from '../src/rules/clean-code-naming';

const ruleTester = new RuleTester();

ruleTester.run('clean-code-naming', rule, {
  valid: [
    { code: 'let myVariable = 1;' },
    { code: 'function myFunction() {}' },
    { code: 'class MyClass {}' },
  ],

  invalid: [
    {
      code: 'let x = 1;',
      errors: [{ message: 'Identifier names should be between 3 and 20 characters long' }],
    },
    {
      code: 'function f() {}',
      errors: [{ message: 'Identifier names should be between 3 and 20 characters long' }],
    },
    {
      code: 'class C {}',
      errors: [{ message: 'Identifier names should be between 3 and 20 characters long' }],
    },
  ],
});
