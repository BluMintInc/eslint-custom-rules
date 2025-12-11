import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeGetters } from '../rules/enforce-memoize-getters';

ruleTesterTs.run('enforce-memoize-getters', enforceMemoizeGetters, {
  valid: [
    // Already decorated with preferred import
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Already decorated without parentheses
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize
          private get fetcher() { return {}; }
        }
      `,
    },
    // Aliased import with parentheses
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Namespaced decorator form recognized as valid
    {
      code: `
        import * as M from '@blumintinc/typescript-memoize';
        class Example {
          @M.Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Static getter should be ignored
    {
      code: `
        class Example {
          private static get version() { return 1; }
        }
      `,
    },
    // Public getter should be ignored
    {
      code: `
        class Example {
          get value() { return 1; }
        }
      `,
    },
    // Protected getter should be ignored
    {
      code: `
        class Example {
          protected get value() { return 1; }
        }
      `,
    },
    // JS file should be ignored entirely
    {
      filename: 'file.js',
      code: `
        class Example {
          get value() { return 1; }
        }
      `,
    },
    // TSX file OK with decoration
    {
      filename: 'file.tsx',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get node() { return <div/>; }
        }
      `,
    },
    // Computed property name with decoration
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get ['fetcher']() { return {}; }
        }
      `,
    },
    // With another decorator present and Memoize already applied
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Using legacy module path still valid
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
  ],
  invalid: [
    // Basic: add import and decorator
    {
      code: `
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Insert import before first import
    {
      code: `
        import { something } from 'lib';
        export class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { something } from 'lib';
        export class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing preferred import
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing legacy import
    {
      code: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        class Example {
          @Memoize()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing aliased import (legacy path)
    {
      code: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize as Cache } from 'typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Use existing aliased import (preferred path)
    {
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          private get fetcher() { return {}; }
        }
      `,
    },
    // With other decorator present; Memoize inserted above
    {
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          private get fetcher() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          private get fetcher() { return {}; }
        }
      `,
    },
    // Computed property name
    {
      code: `
        class Example {
          private get ['fetcher']() { return {}; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get ['fetcher']() { return {}; }
        }
      `,
    },
    // Multiple private getters should each be decorated, single import
    {
      code: `
        class Example {
          private get a() { return 1; }
          private get b() { return 2; }
          protected get c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoizeGetter' },
        { messageId: 'requireMemoizeGetter' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          private get a() { return 1; }
          @Memoize()
          private get b() { return 2; }
          protected get c() { return 3; }
        }
      `,
    },
    // Preserve JSDoc above the decorator
    {
      code: `
        class Example {
          /** docs */
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          /** docs */
          @Memoize()
          private get a() { return 1; }
        }
      `,
    },
    // Works in TSX files too
    {
      filename: 'component.tsx',
      code: `
        export class Example {
          private get node() { return <span/>; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Example {
          @Memoize()
          private get node() { return <span/>; }
        }
      `,
    },
    // Insert import before first non-import statement when there are no imports
    {
      code: `
        'use strict';
        class Example {
          private get a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoizeGetter' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        'use strict';
        class Example {
          @Memoize()
          private get a() { return 1; }
        }
      `,
    },
  ],
});
