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
    // Type-safe function with proper constraints
    `function getValues<T extends Record<string, unknown>>(input: T) { return Object.values(input); }`,
    // Using with a properly typed variable
    `const data: Record<string, number> = { a: 1, b: 2 }; Object.values(data);`,
    // Using with a properly typed parameter
    `function processObject(obj: Record<string, unknown>) { return Object.values(obj); }`,
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
    // Function returning a string
    {
      code: `function getString() { return "hello"; } Object.values(getString());`,
      errors: [{ messageId: 'unexpected' }],
    },
    // Variable with string type
    {
      code: `const str: string = "hello"; Object.values(str);`,
      errors: [{ messageId: 'unexpected' }],
    },
  ],
});
