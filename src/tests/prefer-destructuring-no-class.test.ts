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
    // A parameter typed with a same-file class is a class instance even though
    // no NewExpression is in sight (#1619).
    `
      class User {
        name: string;
      }
      function greet(user: User) {
        const name = user.name;
        return name;
      }
    `,
    // An annotated variable is a class instance regardless of its initializer.
    `
      class User {
        name: string;
      }
      declare function getUser(): User;
      const user: User = getUser();
      const name = user.name;
    `,
    // Member chain rooted at a class-typed parameter stays exempt through the
    // recursive member-expression walk.
    `
      class Customer {
        name: string;
      }
      class Order {
        customer: Customer;
      }
      function process(order: Order) {
        const name = order.customer.name;
        return name;
      }
    `,
    // A class declared AFTER its use site still exempts — recognition indexes
    // the whole file, not just declarations above the report.
    `
      function greet(user: User) {
        const name = user.name;
        return name;
      }
      class User {
        name: string;
      }
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
    // A parameter typed with a TYPE ALIAS is plain data, not a class instance —
    // pins that the #1619 exemption keys on class declarations only.
    {
      code: `
        type UserLike = { name: string };
        function greet(user: UserLike) {
          const name = user.name;
          return name;
        }
      `,
      output: `
        type UserLike = { name: string };
        function greet(user: UserLike) {
          const { name } = user;
          return name;
        }
      `,
      errors: [{ messageId: 'preferDestructuring' }],
    },
    // A parameter typed with an IMPORTED class still reports: a syntactic rule
    // cannot resolve the import, and the docs scope the exemption to same-file
    // declarations (#1619).
    {
      code: `
        import { User } from './user';
        function greet(user: User) {
          const name = user.name;
          return name;
        }
      `,
      output: `
        import { User } from './user';
        function greet(user: User) {
          const { name } = user;
          return name;
        }
      `,
      errors: [{ messageId: 'preferDestructuring' }],
    },
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
    // Annotated declarators are reported but not fixed: rewriting them would drop
    // the deliberate annotation (see https://github.com/BluMintInc/eslint-custom-rules/issues/1360)
    {
      code: `const alpha: string = obj.alpha;`,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'obj',
            property: 'alpha',
            targetNote: '',
            renamingHint: '',
            example: 'const { alpha } = obj;',
          },
        },
      ],
      output: null,
    },
    // A non-trivial annotation (deliberate widening) must survive the fixer's refusal
    {
      code: `
        type Wide = string | number;
        const obj = { alpha: 'a' };
        const alpha: Wide = obj.alpha;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    // let/var annotated declarators are equally unfixable
    {
      code: `
        const obj = { foo: 123 };
        let foo: number = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    {
      code: `
        const obj = { foo: 123 };
        var foo: number = obj.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    // Annotated computed access is also left unfixed
    {
      code: `
        const obj = { foo: 123 };
        const foo: number = obj['foo'];
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    // Annotated declarators with renaming enforced are reported without a fix
    {
      code: `
        const obj = { foo: 123 };
        const bar: number = obj.foo;
      `,
      options: [{ object: true, enforceForRenamedProperties: true }],
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    // The unannotated counterpart of the issue repro still gets fixed
    {
      code: `const alpha = obj.alpha;`,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `const { alpha } = obj;`,
    },
    // The AssignmentExpression path is unaffected: the annotation lives on a
    // separate declaration that the fixer never touches
    {
      code: `
        const obj = { alpha: 'a' };
        let alpha: string;
        alpha = obj.alpha;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: `
        const obj = { alpha: 'a' };
        let alpha: string;
        ({ alpha } = obj);
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
