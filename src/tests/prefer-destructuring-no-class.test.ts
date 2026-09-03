import { ruleTesterTs } from '../utils/ruleTester';
import { preferDestructuringNoClass } from '../rules/prefer-destructuring-no-class';

ruleTesterTs.run('prefer-destructuring-no-class', preferDestructuringNoClass, {
  valid: [
    // `super.x` has no destructurable spelling — `const { x } = super;` is a
    // syntax error — so the rule must stay silent whatever the binding is
    // called. The case-insensitive match of #2316 makes every casing of the
    // property name reach this shape, where only an exact match did before.
    {
      code: `
export class Base {
  protected static readonly BASE = { retries: 3 };
}
export class Derived extends Base {
  private static get config() {
    const base = super.BASE;
    return base;
  }
}
`,
    },
    {
      code: `
export class Base {
  protected static readonly BASE = 1;
}
export class Derived extends Base {
  private static get config() {
    const BASE = super.BASE;
    return BASE;
  }
}
`,
    },
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
    // A binding whose name differs by more than case/underscores from the
    // property it reads must still NOT match under the default gate — the
    // loose comparison only tolerates a naming-convention shift, not an
    // arbitrary rename (#2316).
    `
      const OBJ = { count: 123 };
      const TOTAL = OBJ.count;
    `,
    // Private identifiers stay exempt from destructuring suggestions
    // regardless of how the binding is cased — `#value` cannot be spelled
    // inside a destructuring pattern at all.
    `
      class Example {
        #value = 1;
        static extract(instance: any) {
          const VALUE = instance.#value;
          return VALUE;
        }
      }
    `,
    // A non-string literal key (e.g. a numeric index) has no comparable name
    // at all, so it can never loosely match a binding — the gate must not
    // coerce a number into a string for comparison.
    `
      const OBJ = [1, 2, 3];
      const ONE = OBJ[1];
    `,
    // Class-instance exemption is independent of the destination binding's
    // casing: the case-insensitive gate only changes the NAME match, not
    // whether the object is a class instance at all.
    `
      class Example {
        constructor() {
          this.value = 42;
        }
      }
      const example = new Example();
      const VALUE = example.value;
    `,
    // `this` access inside a class method is exempt regardless of the
    // destination binding's casing, for the same reason.
    `
      class Example {
        private value: number;
        constructor(props: { value: number }) {
          const VALUE = this.value;
        }
      }
    `,
    // Static class members stay exempt regardless of casing.
    `
      class Example {
        static value = 42;
      }
      const VALUE = Example.value;
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
    // A SCREAMING_SNAKE_CASE binding derived from a `global-const-style`
    // rewrite (`const foo = OBJ.foo;` -> `const FOO = OBJ.foo;`) is a pure
    // case shift, not a genuine rename: the default gate must still catch it
    // (#2316), and the fixer must alias the binding since `const { FOO } =
    // OBJ;` would read a nonexistent property.
    {
      code: `
        const OBJ = { foo: 123 };
        const FOO = OBJ.foo;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'foo',
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: 'const { foo: FOO } = OBJ;',
          },
        },
      ],
      output: `
        const OBJ = { foo: 123 };
        const { foo: FOO } = OBJ;
      `,
    },
    // SCREAMING_SNAKE_CASE binding derived from a camelCase property: the
    // loose match strips underscores in addition to lowercasing, or a
    // global-const-style rename of a camelCase-sourced constant would still
    // disarm the rule (#2316).
    {
      code: `
        const OBJ = { myValue: 1 };
        const MY_VALUE = OBJ.myValue;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'myValue',
            targetNote: ' to "MY_VALUE"',
            renamingHint: ' with renaming',
            example: 'const { myValue: MY_VALUE } = OBJ;',
          },
        },
      ],
      output: `
        const OBJ = { myValue: 1 };
        const { myValue: MY_VALUE } = OBJ;
      `,
    },
    // The comparison is symmetric: a lowercase binding reading a
    // SCREAMING_SNAKE_CASE-keyed property matches loosely too.
    {
      code: `
        const OBJ = { FOO: 1 };
        const foo = OBJ.FOO;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'FOO',
            targetNote: ' to "foo"',
            renamingHint: ' with renaming',
            example: 'const { FOO: foo } = OBJ;',
          },
        },
      ],
      output: `
        const OBJ = { FOO: 1 };
        const { FOO: foo } = OBJ;
      `,
    },
    // A computed access with a string-literal key participates in the same
    // loose match, and the fixer keeps the bracket form for the key while
    // aliasing the binding.
    {
      code: `
        const OBJ = { foo: 123 };
        const FOO = OBJ['foo'];
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: "'foo'",
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: "const { ['foo']: FOO } = OBJ;",
          },
        },
      ],
      output: `
        const OBJ = { foo: 123 };
        const { ['foo']: FOO } = OBJ;
      `,
    },
    // The AssignmentExpression path gets the same alias treatment as
    // VariableDeclarator.
    {
      code: `
        let FOO;
        const OBJ = { foo: 123 };
        FOO = OBJ.foo;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'foo',
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: '({ foo: FOO } = OBJ)',
          },
        },
      ],
      output: `
        let FOO;
        const OBJ = { foo: 123 };
        ({ foo: FOO } = OBJ);
      `,
    },
    // Case-insensitive matching applies through a nested member chain too.
    {
      code: `
        const OBJ = { nested: { foo: 123 } };
        const FOO = OBJ.nested.foo;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ.nested',
            property: 'foo',
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: 'const { foo: FOO } = OBJ.nested;',
          },
        },
      ],
      output: `
        const OBJ = { nested: { foo: 123 } };
        const { foo: FOO } = OBJ.nested;
      `,
    },
    // `enforceForRenamedProperties: true` already tolerated this rename
    // before the fix; pinning it here guards the refactor of the shared
    // alias logic against regressing the already-correct path.
    {
      code: `
        const OBJ = { foo: 123 };
        const FOO = OBJ.foo;
      `,
      options: [{ object: true, enforceForRenamedProperties: true }],
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'foo',
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: 'const { foo: FOO } = OBJ;',
          },
        },
      ],
      output: `
        const OBJ = { foo: 123 };
        const { foo: FOO } = OBJ;
      `,
    },
    // An annotated declarator with a case-shifted binding is reported like
    // any other annotated declarator: the annotation blocks the fixer
    // regardless of why the report fired.
    {
      code: `
        const OBJ = { foo: 123 };
        const FOO: number = OBJ.foo;
      `,
      errors: [{ messageId: 'preferDestructuring' }],
      output: null,
    },
    // `let`/`var` declarations keep their kind through the alias fix.
    {
      code: `
        const OBJ = { foo: 123 };
        let FOO = OBJ.foo;
      `,
      errors: [
        {
          messageId: 'preferDestructuring',
          data: {
            object: 'OBJ',
            property: 'foo',
            targetNote: ' to "FOO"',
            renamingHint: ' with renaming',
            example: 'let { foo: FOO } = OBJ;',
          },
        },
      ],
      output: `
        const OBJ = { foo: 123 };
        let { foo: FOO } = OBJ;
      `,
    },
  ],
});
