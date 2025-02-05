import { ruleTesterTs } from '../utils/ruleTester';
import { noCircularRefs } from '../rules/no-circular-refs';

ruleTesterTs.run('no-circular-refs', noCircularRefs, {
  valid: [
    // Simple object without circular references
    {
      code: 'const obj = { key: "value" };',
    },
    // Object referencing another object without circular reference
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { ref: obj1 };
      `,
    },
    // Deeply nested objects without circular references
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { nested: { ref: obj1 } };
      `,
    },
    // Multiple objects referencing each other without circles
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { ref: obj1 };
        const obj3 = { ref: obj2 };
      `,
    },
  ],
  invalid: [
    // Direct self-reference
    {
      code: `
        const obj = {};
        obj.self = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Indirect circular reference between two objects
    {
      code: `
        const obj1 = {};
        const obj2 = { ref: obj1 };
        obj1.ref = obj2;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Deeply nested circular reference
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
    // Multiple circular references
    {
      code: `
        const obj1 = {};
        const obj2 = {};
        const obj3 = {};
        obj1.ref = obj2;
        obj2.ref = obj3;
        obj3.ref = obj1;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
  ],
});
