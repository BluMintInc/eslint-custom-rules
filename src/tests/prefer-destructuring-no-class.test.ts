import { ruleTesterTs } from '../utils/ruleTester';
import { preferDestructuringNoClass } from '../rules/prefer-destructuring-no-class';

ruleTesterTs.run('prefer-destructuring-no-class', preferDestructuringNoClass, {
  valid: [
    // Class instance cases - should be ignored
    {
      code: `
        class MyClass {
          constructor() {
            this.value = 42;
          }
          getValue() {
            return this.value;
          }
        }
        const instance = new MyClass();
        const getValue = instance.getValue;
      `,
    },
    // Constructor function cases - should be ignored
    {
      code: `
        function MyClass() {
          this.value = 42;
        }
        MyClass.prototype.getValue = function() {
          return this.value;
        };
        const instance = new MyClass();
        const getValue = instance.getValue;
      `,
    },
    // Arrow function in class - should be ignored
    {
      code: `
        class MyClass {
          constructor() {
            this.getValue = () => this.value;
          }
        }
        const instance = new MyClass();
        const getValue = instance.getValue;
      `,
    },
    // Static method - should be ignored as it's on class itself
    {
      code: `
        class MyClass {
          static staticMethod() {
            return 'Hello';
          }
        }
        const staticMethod = MyClass.staticMethod;
      `,
    },
  ],
  invalid: [
    // Regular object - should enforce destructuring
    {
      code: `
        const obj = { foo: 123 };
        const foo = obj.foo;
      `,
      output: `
        const obj = { foo: 123 };
        const { foo } = obj;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
    },
    // Nested object - should enforce destructuring
    {
      code: `
        const obj = { nested: { foo: 123 } };
        const foo = obj.nested.foo;
      `,
      output: `
        const obj = { nested: { foo: 123 } };
        const { foo } = obj.nested;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
    },
  ],
});
