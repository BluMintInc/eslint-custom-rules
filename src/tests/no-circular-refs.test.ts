import { RuleTester } from '@typescript-eslint/utils/dist/ts-eslint';
import { noCircularRefs } from '../rules/no-circular-refs';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
});

const validCases = [
  {
    code: 'const obj = { key: "value" };',
  },
  {
    code: `
      const obj1 = { key: "value" };
      const obj2 = { ref: obj1 };
    `,
  },
  {
    code: `
      const obj1 = { key: "value" };
      const obj2 = { nested: { ref: obj1 } };
    `,
  },
  {
    code: `
      const obj1 = { key: "value" };
      const obj2 = { ref: obj1 };
      const obj3 = { ref: obj2 };
    `,
  },
  {
    code: `
      const obj = { toJSON: () => ({ key: "value" }) };
      obj.self = obj;
    `,
    options: [{ ignoreWithToJSON: true }],
  },
];

const invalidCases = [
  {
    code: `
      const obj = {};
      obj.self = obj;
    `,
    errors: [{ messageId: 'circularReference' }],
  },
  {
    code: `
      const obj1 = {};
      const obj2 = { ref: obj1 };
      obj1.ref = obj2;
    `,
    errors: [{ messageId: 'circularReference' }],
  },
  {
    code: `
      const obj = {
        level1: {
          level2: {}
        }
      };
      obj.level1.level2.circular = obj;
    `,
    errors: [{ messageId: 'circularReference' }],
  },
];

const validCasesWithOptions = validCases.map(test => ({
  ...test,
  options: test.options ? [test.options[0]] : undefined,
}));

const invalidCasesWithErrors = invalidCases.map(test => ({
  ...test,
  errors: test.errors.map(error => ({
    messageId: error.messageId as 'circularReference',
  })),
}));

ruleTester.run('no-circular-refs', noCircularRefs, {
  valid: validCasesWithOptions,
  invalid: invalidCasesWithErrors,
});
