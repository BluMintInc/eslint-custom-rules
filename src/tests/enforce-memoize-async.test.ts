import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeAsync } from '../rules/enforce-memoize-async';

ruleTesterTs.run('enforce-memoize-async', enforceMemoizeAsync, {
  valid: [
    // Already decorated async method
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Method with multiple parameters (should be ignored)
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          async getData(param1: string, param2: string) {
            return await fetch(\`data/\${param1}/\${param2}\`);
          }
        }
      `,
    },
    // Non-async method (should be ignored)
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          getData() {
            return 'data';
          }
        }
      `,
    },
    // Already decorated with aliased import
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          @Cache()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Standalone function (should be ignored)
    {
      code: `
        async function getData() {
          return await fetch('data');
        }
      `,
    },
  ],
  invalid: [
    // Missing decorator on async method with no parameters
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing decorator on async method with one parameter
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
    },
    // Missing decorator with aliased import
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          @Cache()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
  ],
});
