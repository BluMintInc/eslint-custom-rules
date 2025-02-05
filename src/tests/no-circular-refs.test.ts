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
    // Object with toJSON method handling circular reference
    {
      code: `
        const obj = {};
        obj.self = obj;
        obj.toJSON = () => ({ key: "value" });
      `,
      options: [{ ignoreWithToJSON: true }],
    },
    // Array of objects without circular references
    {
      code: `
        const arr = [];
        const obj = { arr };
        arr.push({ ref: obj });
      `,
    },
    // Object with function properties
    {
      code: `
        const obj = {
          method() {
            return this;
          }
        };
      `,
    },
    // Object with getters/setters
    {
      code: `
        const obj = {
          get value() {
            return this._value;
          },
          set value(v) {
            this._value = v;
          }
        };
      `,
    },
    // Object with Symbol properties
    {
      code: `
        const sym = Symbol('test');
        const obj = {};
        obj[sym] = { ref: obj };
      `,
    },
    // Object with computed properties
    {
      code: `
        const key = 'prop';
        const obj = {
          [key]: { value: 42 }
        };
      `,
    },
    // Object with prototype methods
    {
      code: `
        class Test {
          constructor() {
            this.value = 42;
          }
          method() {
            return this;
          }
        }
        const obj = new Test();
      `,
    },
    // Object with null/undefined properties
    {
      code: `
        const obj = {
          nullProp: null,
          undefinedProp: undefined,
          emptyObj: {}
        };
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
    // Circular reference in array
    {
      code: `
        const arr = [];
        const obj = { arr };
        arr.push(obj);
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with computed property
    {
      code: `
        const key = 'circular';
        const obj = {};
        obj[key] = obj;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference in class instance
    {
      code: `
        class Test {
          constructor() {
            this.self = this;
          }
        }
        const obj = new Test();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with object spread
    {
      code: `
        const obj1 = {};
        const obj2 = { ...obj1 };
        obj1.ref = obj2;
        obj2.ref = obj1;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with object destructuring
    {
      code: `
        const obj1 = {};
        const { ...obj2 } = obj1;
        obj1.ref = obj2;
        obj2.ref = obj1;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with object assign
    {
      code: `
        const obj1 = {};
        const obj2 = Object.assign({}, obj1);
        obj1.ref = obj2;
        obj2.ref = obj1;
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference in function scope
    {
      code: `
        function createCircular() {
          const obj = {};
          obj.self = obj;
          return obj;
        }
        const result = createCircular();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
    // Circular reference with object methods
    {
      code: `
        const obj = {
          method() {
            this.self = this;
          }
        };
        obj.method();
      `,
      errors: [{ messageId: 'circularReference' }],
    },
  ],
});
