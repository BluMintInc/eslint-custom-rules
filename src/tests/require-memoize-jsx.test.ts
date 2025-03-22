import { ruleTesterTs } from '../utils/ruleTester';
import { requireMemoizeJsx } from '../rules/require-memoize-jsx';

ruleTesterTs.run('require-memoize-jsx', requireMemoizeJsx, {
  valid: [
    // Valid case: getter with @Memoize() that returns JSX
    {
      code: `
        import { Memoize } from 'typescript-memoize';

        export class ExampleProvider {
          @Memoize()
          public get Component() {
            return () => <div>Expensive Component</div>;
          }
        }
      `,
      filename: 'test.tsx',
    },
    // Valid case: method with @Memoize() that returns JSX
    {
      code: `
        import { Memoize } from 'typescript-memoize';

        class ComponentFactory {
          @Memoize()
          createComponent() {
            return () => <div>New Component</div>;
          }
        }
      `,
      filename: 'test.tsx',
    },
    // Valid case: method that doesn't return JSX (no need for @Memoize())
    {
      code: `
        class Example {
          getData() {
            return { value: 42 };
          }
        }
      `,
      filename: 'test.tsx',
    },
    // Valid case: method that returns an imported component (not JSX)
    {
      code: `
        import MyComponent from './MyComponent';

        class Example {
          public get Component() {
            return MyComponent;
          }
        }
      `,
      filename: 'test.tsx',
    },
  ],
  invalid: [
    // Invalid case: getter without @Memoize() that returns JSX
    {
      code: `
        export class ExampleProvider {
          public get Component() {
            return () => <div>Expensive Component</div>;
          }
        }
      `,
      filename: 'test.tsx',
      errors: [{ messageId: 'requireMemoize' }],
      output: `import { Memoize } from "typescript-memoize";

        export class ExampleProvider {
          @Memoize()
          public get Component() {
            return () => <div>Expensive Component</div>;
          }
        }
      `,
    },
    // Invalid case: method without @Memoize() that returns JSX
    {
      code: `
        class ComponentFactory {
          createComponent() {
            return () => <div>New Component</div>;
          }
        }
      `,
      filename: 'test.tsx',
      errors: [{ messageId: 'requireMemoize' }],
      output: `import { Memoize } from "typescript-memoize";

        class ComponentFactory {
          @Memoize()
          createComponent() {
            return () => <div>New Component</div>;
          }
        }
      `,
    },
    // Invalid case: method with another decorator but missing @Memoize()
    {
      code: `
        import { CustomDecorator } from './decorators';

        class Example {
          @CustomDecorator()
          public get Component() {
            return () => <div>Decorated</div>;
          }
        }
      `,
      filename: 'test.tsx',
      errors: [{ messageId: 'requireMemoize' }],
      output: `import { Memoize } from "typescript-memoize";

        import { CustomDecorator } from './decorators';

        class Example {
          @Memoize()
          @CustomDecorator()
          public get Component() {
            return () => <div>Decorated</div>;
          }
        }
      `,
    },
    // Invalid case: method that returns a function that returns JSX
    {
      code: `
        class Example {
          public get Renderer() {
            return () => () => <div>Double Wrapped</div>;
          }
        }
      `,
      filename: 'test.tsx',
      errors: [{ messageId: 'requireMemoize' }],
      output: `import { Memoize } from "typescript-memoize";

        class Example {
          @Memoize()
          public get Renderer() {
            return () => () => <div>Double Wrapped</div>;
          }
        }
      `,
    },
    // Invalid case: method with direct JSX return
    {
      code: `
        class Example {
          renderHeader() {
            return <h1>Header</h1>;
          }
        }
      `,
      filename: 'test.tsx',
      errors: [{ messageId: 'requireMemoize' }],
      output: `import { Memoize } from "typescript-memoize";

        class Example {
          @Memoize()
          renderHeader() {
            return <h1>Header</h1>;
          }
        }
      `,
    },
  ],
});
