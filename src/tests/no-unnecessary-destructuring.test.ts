import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryDestructuring } from '../rules/no-unnecessary-destructuring';

const ruleTester = ruleTesterTs;

ruleTester.run('no-unnecessary-destructuring', noUnnecessaryDestructuring, {
  valid: [
    // Multiple properties destructured - valid
    `const { foo, bar } = obj;`,

    // Omitting properties - valid
    `const { omitted, ...rest } = obj;`,

    // Function parameters - valid
    `function getValue({ value }) { return value; }`,

    // Object spread in object creation - valid
    `const newObj = { ...oldObj, newProp: 123 };`,

    // Regular assignment - valid
    `const value = data;`,

    // Destructuring with specific property - valid
    `const { value } = data;`,
  ],
  invalid: [
    {
      code: `const { ...value } = data;`,
      errors: [{ messageId: 'noUnnecessaryDestructuring' }],
      output: `const value = data;`,
    },
    {
      code: `let { ...obj } = someObject;`,
      errors: [{ messageId: 'noUnnecessaryDestructuring' }],
      output: `let obj = someObject;`,
    },
    {
      code: `var { ...result } = getResult();`,
      errors: [{ messageId: 'noUnnecessaryDestructuring' }],
      output: `var result = getResult();`,
    },
  ],
});
