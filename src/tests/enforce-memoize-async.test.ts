import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeAsync } from '../rules/enforce-memoize-async';

ruleTesterTs.run('enforce-memoize-async', enforceMemoizeAsync, {
  valid: [
    // Already decorated async method
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
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
        import { Memoize } from '@blumintinc/typescript-memoize';
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
        import { Memoize } from '@blumintinc/typescript-memoize';
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
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
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
    // Static async method with no parameters (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Static async method with one parameter (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
    },
    // Static async method with @Memoize (should be ignored)
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          static async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Already decorated without parentheses
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Other decorator present and also Memoize()
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          @Memoize()
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
    },
    // Async method with two params should be ignored
    {
      code: `
        class Example {
          async getData(id: string, page = 1) {
            return await fetch('data');
          }
        }
      `,
    },
    // Static async generator method should be ignored
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          static async *stream() {
            yield 1;
          }
        }
      `,
    },
  ],
  invalid: [
    // Missing decorator on async method with no parameters
    {
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
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
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async getData(id: string) {
            return await fetch(\`data/\${id}\`);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
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
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        class Example {
          @Cache()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing import on async method with no parameters
    {
      code: `
        class Example {
          async getData() {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return await fetch('data');
          }
        }
      `,
    },
    // Missing import with existing other imports; Memoize import should be first
    {
      code: `
        import { something } from 'lib';
        export class Example {
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { something } from 'lib';
        export class Example {
          @Memoize()
          async getData(id?: string) {
            return await fetch('data');
          }
        }
      `,
    },
    // Multiple async methods: add decorator to each eligible method, ignore 2+ param method
    {
      code: `
        class Example {
          async a() { return 1; }
          async b(x: string) { return x; }
          async c(x: string, y: number) { return x + y; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async a() { return 1; }
          @Memoize()
          async b(x: string) { return x; }
          async c(x: string, y: number) { return x + y; }
        }
      `,
    },
    // Parameter with default value still counts as one parameter
    {
      code: `
        class Example {
          async getData(id: string = 'x') {
            return id;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData(id: string = 'x') {
            return id;
          }
        }
      `,
    },
    // Rest parameter still counts as one parameter
    {
      code: `
        class Example {
          async getAll(...ids: string[]) {
            return ids.length;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getAll(...ids: string[]) {
            return ids.length;
          }
        }
      `,
    },
    // With other decorators present; Memoize should be inserted above others
    {
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          async compute() {
            return 1;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          async compute() {
            return 1;
          }
        }
      `,
    },
    // Reproduction: CohortIO with three async methods should all be decorated
    {
      code: `
        export class CohortIO {
          public async execute() {
            const cohorts = await this.fetchCohorts();
            if (cohorts.length === 0) { return; }
            const updates = this.buildUpdates(cohorts);
            if (updates.length === 0) { return; }
            await this.applyUpdates(updates);
          }

          private async fetchCohorts() {
            return [] as any[];
          }

          private async applyUpdates(updates: Partial<any>[]) {
            return;
          }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class CohortIO {
          @Memoize()
          public async execute() {
            const cohorts = await this.fetchCohorts();
            if (cohorts.length === 0) { return; }
            const updates = this.buildUpdates(cohorts);
            if (updates.length === 0) { return; }
            await this.applyUpdates(updates);
          }

          @Memoize()
          private async fetchCohorts() {
            return [] as any[];
          }

          @Memoize()
          private async applyUpdates(updates: Partial<any>[]) {
            return;
          }
        }
      `,
    },
  ],
});
