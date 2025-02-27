import { noObjectValuesOnStrings } from '../rules/no-object-values-on-strings';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-object-values-on-strings', noObjectValuesOnStrings, {
  valid: [
    // Valid cases - using Object.values on objects
    `const obj = { a: 1, b: 2 }; Object.values(obj);`,
    `Object.values({ a: 1, b: 2 });`,
    `const arr = [1, 2, 3]; Object.values(arr);`,
    `function getObject() { return { a: 1, b: 2 }; } Object.values(getObject());`,
    `class MyClass { getValues() { return Object.values(this); } }`,
    `const map = new Map(); Object.values(Object.fromEntries(map));`,
  ],
  invalid: [
    // Invalid cases - using Object.values on strings
    {
      code: `Object.values("hello");`,
      errors: [{ messageId: 'unexpected' }],
    },
    {
      code: `Object.values(\`template literal\`);`,
      errors: [{ messageId: 'unexpected' }],
    },
  ],
});
