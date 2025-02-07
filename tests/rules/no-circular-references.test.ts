import { ruleTesterTs } from '../utils/ruleTester';
import { noCircularReferences } from '../../src/rules/no-circular-references';

ruleTesterTs.run('no-circular-references', noCircularReferences, {
  valid: [
    // Simple object without circular references
    {
      code: `const obj = { key: "value" };`,
    },
    // Object referencing another object without circular reference
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { ref: obj1 };
      `,
    },
    // Nested objects without circular references
    {
      code: `
        const obj1 = { key: "value" };
        const obj2 = { nested: { ref: obj1 } };
      `,
    },
    // Object with toJSON method
    {
      code: `
        const obj = {};
        obj.toJSON = () => ({ key: "value" });
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
    // Multiple circular references in the same object
    {
      code: `
        const obj = {};
        obj.ref1 = obj;
        obj.ref2 = obj;
      `,
      errors: [
        { messageId: 'circularReference' },
        { messageId: 'circularReference' },
      ],
    },
  ],
});
