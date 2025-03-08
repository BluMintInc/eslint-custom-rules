import { ruleTesterTs } from '../utils/ruleTester';
import { preferDestructuringNoClass } from '../rules/prefer-destructuring-no-class';

ruleTesterTs.run('prefer-destructuring-no-class', preferDestructuringNoClass, {
  valid: [
    // Class instances should be ignored
    `
      class Example {
        constructor() {
          this.value = 42;
        }
      }
      const example = new Example();
      const value = example.value;
    `,
    // Static class members should be ignored
    `
      class Example {
        static value = 42;
      }
      const value = Example.value;
    `,
    // Already using destructuring
    `
      const obj = { foo: 123 };
      const { foo } = obj;
    `,
    // Non-matching property names with enforceForRenamedProperties: false
    `
      const obj = { foo: 123 };
      const bar = obj.foo;
    `,
    // Nested class instance should be ignored
    `
      class Inner {
        constructor() {
          this.value = 42;
        }
      }
      class Outer {
        constructor() {
          this.inner = new Inner();
        }
      }
      const outer = new Outer();
      const value = outer.inner.value;
    `,
    // Direct property access within a class method should be allowed
    `
      export class UtcPrefixPrepender extends UtcPrefixModifier {
        public prepend(response: NextResponse | null) {
          if (!response || this.isPathIgnored) {
            return response;
          }

          // This should not be flagged
          const utcOffset = this.utcOffset;
          return utcOffset;
        }
      }
    `,
    // Complex class method with multiple this references
    `
      class DataProcessor {
        private data: any;
        private config: any;

        constructor(data: any, config: any) {
          this.data = data;
          this.config = config;
        }

        public process() {
          // These should not be flagged
          const config = this.config;
          const data = this.data;

          if (config.debug) {
            console.log(data);
          }

          return data.map((item: any) => {
            return item * config.multiplier;
          });
        }
      }
    `,
  ],
  invalid: [
    // Basic object property access
    {
      code: `
        const obj = { foo: 123 };
        const foo = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { foo: 123 };
        const { foo } = obj;
      `,
    },
    // Nested object property access
    {
      code: `
        const obj = { nested: { foo: 123 } };
        const foo = obj.nested.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { nested: { foo: 123 } };
        const { foo } = obj.nested;
      `,
    },
    // Property access with let declaration
    {
      code: `
        const obj = { foo: 123 };
        let foo = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { foo: 123 };
        let { foo } = obj;
      `,
    },
    // Property access with var declaration
    {
      code: `
        const obj = { foo: 123 };
        var foo = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { foo: 123 };
        var { foo } = obj;
      `,
    },
    // Assignment expression
    {
      code: `
        let foo;
        const obj = { foo: 123 };
        foo = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        let foo;
        const obj = { foo: 123 };
        ({ foo } = obj);
      `,
    },
    // Property access with enforceForRenamedProperties enabled
    {
      code: `
        const obj = { foo: 123 };
        const bar = obj.foo;
      `,
      options: [{ object: true, enforceForRenamedProperties: true }],
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { foo: 123 };
        const { foo: bar } = obj;
      `,
    },
  ],
});
