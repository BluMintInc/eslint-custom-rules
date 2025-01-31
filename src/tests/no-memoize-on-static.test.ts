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
  ],
});
