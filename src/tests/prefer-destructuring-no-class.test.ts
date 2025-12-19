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
    // Renamed properties should stay valid when enforceForRenamedProperties is false
    `
      class Example {
        constructor(props: { value: string; renamed: string }) {
          this.value = props.renamed;
        }
      }
    `,
    // Shadowed parameter name should not be treated as a parameter
    `
      class Example {
        private value: number;

        constructor(props: { value: number }) {
          if (props) {
            const props = { value: 2 };
            this.value = props.value;
          }
        }
      }
    `,
    // this assignments outside classes should be ignored
    `
      function notAClass(props: { x: number }) {
        this.value = props.x;
      }
    `,
    // Nested functions inside constructors should not trigger this-based reports
    `
      class Example {
        private value: number;

        constructor(props: { value: number }) {
          const assign = () => {
            this.value = props.value;
          };
          assign();
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'foo',
            targetNote: '',
            renamingHint: '',
            example: 'const { foo } = obj;',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj.nested',
            property: 'foo',
            targetNote: '',
            renamingHint: '',
            example: 'const { foo } = obj.nested;',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'foo',
            targetNote: '',
            renamingHint: '',
            example: 'let { foo } = obj;',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'foo',
            targetNote: '',
            renamingHint: '',
            example: 'var { foo } = obj;',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'foo',
            targetNote: '',
            renamingHint: '',
            example: '({ foo } = obj)',
          },
        },
      ],
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
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'foo',
            targetNote: ' to "bar"',
            renamingHint: ' with renaming',
            example: 'const { foo: bar } = obj;',
          },
        },
      ],
      output: `
        const obj = { foo: 123 };
        const { foo: bar } = obj;
      `,
    },
    // Constructor parameter properties assigned to class fields should be destructured
    {
      code: `
        class Example {
          private x: string;
          private y: number;

          constructor(props: { x: string; y: number }) {
            this.x = props.x;
            this.y = props.y;
          }
        }
      `,
      errors: [
        { messageId: 'preferDestructuring' },
        { messageId: 'preferDestructuring' },
      ],
    },
    // Renamed constructor property access should be reported when enforced
    {
      code: `
        class Example {
          constructor(props: { value: string }) {
            this.displayValue = props.value;
          }
        }
      `,
      options: [{ enforceForRenamedProperties: true }],
      errors: [{ messageId: 'preferDestructuring' }],
    },
    // Computed property access with literal key should use computed destructuring
    {
      code: `
        const obj = { foo: 123 };
        const foo = obj['foo'];
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: "'foo'",
            targetNote: '',
            renamingHint: '',
            example: "const { ['foo']: foo } = obj;",
          },
        },
      ],
      output: `
        const obj = { foo: 123 };
        const { ['foo']: foo } = obj;
      `,
    },
    // Computed property access with renamed binding should remain computed in fixer
    {
      code: `
        const key = 'foo';
        let value;
        const obj = { foo: 123 };
        value = obj[key];
      `,
      options: [{ enforceForRenamedProperties: true }],
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'key',
            targetNote: ' to "value"',
            renamingHint: ' with renaming',
            example: '({ [key]: value } = obj)',
          },
        },
      ],
      output: `
        const key = 'foo';
        let value;
        const obj = { foo: 123 };
        ({ [key]: value } = obj);
      `,
    },
  ],
});
