import { ruleTesterTs } from '../utils/ruleTester';
import { noMemoizeOnStatic } from '../rules/no-memoize-on-static';

ruleTesterTs.run('no-memoize-on-static', noMemoizeOnStatic, {
  valid: [
    // Regular static method without decorator
    {
      code: `
        class Example {
          static regularMethod() {
            return computeSomething();
          }
        }
      `,
    },
    // Instance method with @Memoize()
    {
      code: `
        class Example {
          @Memoize()
          instanceMethod() {
            return heavyComputation();
          }
        }
      `,
    },
    // Static method with other decorator
    {
      code: `
        class Example {
          @SomeOtherDecorator()
          static validStaticMethod() {
            return doSomething();
          }
        }
      `,
    },
    // Class-level memoization
    {
      code: `
        @ClassMemoize()
        class Example {
          static someMethod() {
            return performTask();
          }
        }
      `,
    },
    // Different casing (should not be caught)
    {
      code: `
        class Example {
          @memoize()
          static method() {
            return value;
          }
        }
      `,
    },
    // Memoize identifier but not a decorator
    {
      code: `
        class Example {
          static method() {
            const Memoize = () => {};
            return Memoize();
          }
        }
      `,
    },
    // Static method with Memoize as parameter name
    {
      code: `
        class Example {
          static method(Memoize: () => void) {
            return Memoize();
          }
        }
      `,
    },
  ],
  invalid: [
    // Basic case: static method with @Memoize()
    {
      code: `
        class Example {
          @Memoize()
          static expensiveComputation() {
            return heavyCalculation();
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Multiple decorators including @Memoize()
    {
      code: `
        class Example {
          @SomeOtherDecorator()
          @Memoize()
          static problematicMethod() {
            return compute();
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Renamed import case
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';

        class Example {
          @Cache()
          static invalidMethod() {
            return expensiveTask();
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Multiple static methods with @Memoize() in the same class
    {
      code: `
        class Example {
          @Memoize()
          static method1() {
            return value1;
          }

          @Memoize()
          static method2() {
            return value2;
          }
        }
      `,
      errors: [
        { messageId: 'noMemoizeOnStatic' },
        { messageId: 'noMemoizeOnStatic' },
      ],
    },
    // Nested class with @Memoize() on static method
    {
      code: `
        class Outer {
          static Inner = class {
            @Memoize()
            static nestedMethod() {
              return value;
            }
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Abstract class with @Memoize() on static method
    {
      code: `
        abstract class AbstractExample {
          @Memoize()
          static abstractMethod() {
            return value;
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // @Memoize() with arguments
    {
      code: `
        class Example {
          @Memoize({ maxAge: 1000 })
          static cachedMethod() {
            return value;
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Multiple renamed imports
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';
        import { Memoize as Memo } from 'other-lib';

        class Example {
          @Cache()
          static method1() {
            return value1;
          }

          @Memo()
          static method2() {
            return value2;
          }
        }
      `,
      errors: [
        { messageId: 'noMemoizeOnStatic' },
        { messageId: 'noMemoizeOnStatic' },
      ],
    },
    // Static getter with @Memoize()
    {
      code: `
        class Example {
          @Memoize()
          static get value() {
            return expensiveComputation();
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Static setter with @Memoize()
    {
      code: `
        class Example {
          @Memoize()
          static set value(v: string) {
            this._value = v;
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // Static async method with @Memoize()
    {
      code: `
        class Example {
          @Memoize()
          static async asyncMethod() {
            const result = await heavyAsyncComputation();
            return result;
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
    // @Memoize without parentheses (invalid syntax but should be handled)
    {
      code: `
        class Example {
          @Memoize
          static method() {
            return value;
          }
        }
      `,
      errors: [{ messageId: 'noMemoizeOnStatic' }],
    },
  ],
});
