import { ruleTesterTs } from '../../utils/ruleTester';
import { noCircularReferences } from '../../rules/no-circular-references';

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
    // Object with function reference
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.func = fn;
      `,
    },
    // Object with array reference
    {
      code: `
        const obj = {};
        const arr = [obj];
        obj.array = arr;
      `,
    },
    // Object with null/undefined properties
    {
      code: `
        const obj = { a: null, b: undefined };
        obj.c = obj.a;
        obj.d = obj.b;
      `,
    },
    // Object with primitive values
    {
      code: `
        const obj = {
          str: "string",
          num: 123,
          bool: true,
          symbol: Symbol(),
          bigint: 123n
        };
      `,
    },
    // Object with computed properties
    {
      code: `
        const key = "dynamicKey";
        const obj = {
          [key]: "value",
          ["computed" + key]: "another value"
        };
      `,
    },
    // Object with getters/setters
    {
      code: `
        const obj = {
          get value() { return "value"; },
          set value(v) { console.log(v); }
        };
      `,
    },
    // Object with method shorthand
    {
      code: `
        const obj = {
          method() { return this; }
        };
      `,
    },
    // Object with spread operator
    {
      code: `
        const base = { a: 1 };
        const obj = { ...base, b: 2 };
      `,
    },
    // Object with destructuring assignment
    {
      code: `
        const source = { a: 1, b: 2 };
        const { a, ...rest } = source;
        const obj = { a, ...rest };
      `,
    },
    // Object with class instance
    {
      code: `
        class MyClass {
          constructor() {
            this.value = "value";
          }
        }
        const instance = new MyClass();
        const obj = { ref: instance };
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
    // Circular reference through array index
    {
      code: `
        const obj = { arr: [] };
        obj.arr[0] = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference through computed property
    {
      code: `
        const key = "ref";
        const obj = {};
        obj[key] = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference in method
    {
      code: `
        const obj = {
          method() { this.self = obj; }
        };
        obj.method();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference through destructuring
    {
      code: `
        const obj = {};
        const { prop = obj } = { prop: obj };
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference through object spread
    {
      code: `
        const obj1 = {};
        const obj2 = { ...obj1 };
        obj1.ref = obj2;
        obj2.ref = obj1;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference in class property
    {
      code: `
        class MyClass {
          constructor() {
            this.obj = {};
            this.obj.self = this.obj;
          }
        }
        new MyClass();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Complex multi-level circular reference
    {
      code: `
        const obj1 = { a: {} };
        const obj2 = { b: obj1.a };
        const obj3 = { c: obj2 };
        obj1.a.ref = obj3;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference through function return
    {
      code: `
        const obj = {};
        function fn() { return obj; }
        obj.getRef = fn;
        obj.self = fn();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with Object.assign
    {
      code: `
        const obj = {};
        Object.assign(obj, { ref: obj });
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with Object.create
    {
      code: `
        const base = {};
        const obj = Object.create(base);
        base.child = obj;
        obj.parent = base;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with Promise
    {
      code: `
        const obj = {};
        const promise = Promise.resolve(obj);
        obj.promise = promise;
        promise.then(result => obj.self = result);
      `,
      errors: [{ messageId: 'circularReference' }],
    },
  ],
});
