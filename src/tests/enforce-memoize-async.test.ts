import { Linter, Rule } from 'eslint';
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
    // Namespace import with bare @Memoize should be valid (legacy/global support)
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Namespace import with namespaced @memo.Memoize() should be valid
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @memo.Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Namespace import with namespaced @memo.Memoize should be valid
    {
      code: `
        import * as memo from '@blumintinc/typescript-memoize';
        class Example {
          @memo.Memoize
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Global support: @Memoize() without any imports
    {
      code: `
        class Example {
          @Memoize()
          async getData() {
            return 1;
          }
        }
      `,
    },
    // Global support: @Memoize without any imports
    {
      code: `
        class Example {
          @Memoize
          async getData() {
            return 1;
          }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1548: a method declared to produce no value has no result to
    // cache, so the decorator buys nothing while changing behaviour — the
    // side effects run once per instance and every later call no-ops.
    // ------------------------------------------------------------------
    {
      name: 'a Promise<void> method is exempt (issue #1548 reproduction)',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class OutboxWriter {
          public async flushPendingWrites(): Promise<void> {
            await this.batch.commit();
          }
        }
      `,
    },
    {
      name: 'a Promise<void> method with one parameter is exempt',
      code: `
        class Staging {
          private async cleanStagingTable(tableId: string): Promise<void> {
            await this.bq.dataset(tableId).delete();
          }
        }
      `,
    },
    {
      name: 'a void-annotated async method is exempt',
      code: `
        class Pinger {
          public async ping(): void {
            this.socket.send('ping');
          }
        }
      `,
    },
    {
      name: 'Promise<void> with odd internal whitespace is exempt',
      code: `
        class OutboxWriter {
          public async flush():   Promise  <  void  > {
            await this.batch.commit();
          }
        }
      `,
    },
    {
      name: 'Promise<void> split across newlines is exempt',
      code: `
        class OutboxWriter {
          public async flush(): Promise<
            void
          > {
            await this.batch.commit();
          }
        }
      `,
    },
    {
      name: 'a Promise<void> method carrying another decorator is exempt',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class OutboxWriter {
          @Log()
          public async flush(): Promise<void> {
            await this.batch.commit();
          }
        }
      `,
    },
    {
      // No violation survives, so no import carrier exists either: the file
      // must not gain `import { Memoize }` for a method it never decorates.
      name: 'a class of only Promise<void> methods pulls in no import',
      code: `
        export class OutboxWriter {
          public async flush(): Promise<void> {
            await this.batch.commit();
          }
          private async retry(id: string): Promise<void> {
            await this.queue.push(id);
          }
        }
      `,
    },
    {
      name: 'a static Promise<void> method is exempt for both reasons',
      code: `
        class OutboxWriter {
          static async flush(): Promise<void> {
            await commit();
          }
        }
      `,
    },
    {
      name: 'a two-parameter Promise<void> method is exempt for both reasons',
      code: `
        class OutboxWriter {
          public async write(id: string, body: Buffer): Promise<void> {
            await this.batch.set(id, body);
          }
        }
      `,
    },
    {
      name: 'an already-decorated Promise<void> method is still accepted',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class OutboxWriter {
          @Memoize()
          public async flush(): Promise<void> {
            await this.batch.commit();
          }
        }
      `,
    },
    // Issue #1404: every violation suppressed inline leaves the file untouched
    {
      name: 'all violations disabled inline report nothing',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a block disable covering the class suppresses everything
    {
      name: 'block disable naming this rule suppresses the whole class',
      code: `
        /* eslint-disable enforce-memoize-async */
        class Example {
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a bare block disable suppresses every rule
    {
      name: 'bare block disable suppresses the whole class',
      code: `
        /* eslint-disable */
        class Example {
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
    },
    // Issue #1404: a bare line disable suppresses this rule too
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
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
    // ------------------------------------------------------------------
    // Issue #1548: the exemption is keyed to a declared plain `void` /
    // `Promise<void>`. Every annotation that can carry a value, and every
    // method that declares nothing at all, still reports and still fixes.
    // ------------------------------------------------------------------
    {
      name: 'a value-returning Promise<T> method still gets @Memoize() and the import',
      code: `
        export class UserRepo {
          public async fetchUser(id: string): Promise<User> {
            return this.db.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class UserRepo {
          @Memoize()
          public async fetchUser(id: string): Promise<User> {
            return this.db.get(id);
          }
        }
      `,
    },
    {
      name: 'a Promise<void | undefined> union still reports',
      code: `
        class Example {
          public async maybe(): Promise<void | undefined> { return undefined; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          public async maybe(): Promise<void | undefined> { return undefined; }
        }
      `,
    },
    {
      // The exemption reads the annotation, not the body: an unannotated
      // method declares no intent to produce nothing, and inferring it would
      // silently drop a whole population the author never marked.
      name: 'an unannotated method whose body only does return; still reports',
      code: `
        class Example {
          public async apply() {
            return;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          public async apply() {
            return;
          }
        }
      `,
    },
    {
      name: 'a generic Promise<T> still reports',
      code: `
        class Example<T> {
          public async load(): Promise<T> { return this.value; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example<T> {
          @Memoize()
          public async load(): Promise<T> { return this.value; }
        }
      `,
    },
    {
      name: 'a bare Promise annotation with no type argument still reports',
      code: `
        class Example {
          public async load(): Promise { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          public async load(): Promise { return 1; }
        }
      `,
    },
    {
      name: 'a Promise<undefined> annotation still reports',
      code: `
        class Example {
          public async load(): Promise<undefined> { return undefined; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          public async load(): Promise<undefined> { return undefined; }
        }
      `,
    },
    {
      // Only `Promise` is exempted by name: a look-alike wrapper resolves to
      // something the rule cannot vouch for, so it keeps reporting.
      name: 'a non-Promise wrapper of void still reports',
      code: `
        class Example {
          public async load(): Task<void> { return this.task; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          @Memoize()
          public async load(): Task<void> { return this.task; }
        }
      `,
    },
    {
      // The exempt method is skipped outright, so the import must ride on the
      // value-returning sibling instead of being stranded.
      name: 'a Promise<void> sibling is skipped while the value-returning one carries the import',
      code: `
        export class OutboxWriter {
          public async flush(): Promise<void> {
            await this.batch.commit();
          }
          public async pending(): Promise<number> {
            return this.batch.size;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class OutboxWriter {
          public async flush(): Promise<void> {
            await this.batch.commit();
          }
          @Memoize()
          public async pending(): Promise<number> {
            return this.batch.size;
          }
        }
      `,
    },
    {
      name: 'repro multiple imports: prefers new package alias over legacy',
      code: `
        import { Memoize as M1 } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as M1 } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          @M2()
          async getData() { return 1; }
        }
      `,
    },
    {
      name: 'repro multiple imports: prefers new package alias over legacy Memoize',
      code: `
        import { Memoize } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        import { Memoize as M2 } from '@blumintinc/typescript-memoize';
        class Example {
          @M2()
          async getData() { return 1; }
        }
      `,
    },
    {
      name: 'repro multiple namespace imports: prefers new package namespace over legacy',
      code: `
        import * as m1 from 'typescript-memoize';
        import * as m2 from '@blumintinc/typescript-memoize';
        class Example {
          async getData() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import * as m1 from 'typescript-memoize';
        import * as m2 from '@blumintinc/typescript-memoize';
        class Example {
          @m2.Memoize()
          async getData() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1404: the import fix must ride on the first *surviving*
    // violation. A suppressed violation used to claim the carrier slot and
    // take the import down with it, emitting @Memoize() with no import.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `
        export class Recorder {
          // eslint-disable-next-line enforce-memoize-async
          public async first() { return 'a'; }

          public async second() { return 'b'; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Recorder {
          // eslint-disable-next-line enforce-memoize-async
          public async first() { return 'a'; }

          @Memoize()
          public async second() { return 'b'; }
        }
      `,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and all other decorators',
      code: `
        class Example {
          async a() { return 1; }
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
          async c() { return 3; }
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
          // eslint-disable-next-line enforce-memoize-async
          async b() { return 2; }
          @Memoize()
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'disable on the LAST violation keeps one import and all other decorators',
      code: `
        class Example {
          async a() { return 1; }
          async b() { return 2; }
          // eslint-disable-next-line enforce-memoize-async
          async c() { return 3; }
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
          async b() { return 2; }
          // eslint-disable-next-line enforce-memoize-async
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `
        class Example {
          // eslint-disable-next-line no-console
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line no-console
          @Memoize()
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'a disable with a -- description suffix suppresses this rule',
      code: `
        class Example {
          // eslint-disable-next-line enforce-memoize-async -- results must not be cached
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async -- results must not be cached
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'eslint-disable-line suppresses the violation on its own line',
      code: `
        class Example {
          async a() { return 1; } // eslint-disable-line enforce-memoize-async
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          async a() { return 1; } // eslint-disable-line enforce-memoize-async
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      name: 'violations after an eslint-enable are fixed and carry the import',
      code: `
        class Example {
          /* eslint-disable enforce-memoize-async */
          async a() { return 1; }
          /* eslint-enable enforce-memoize-async */
          async b() { return 2; }
          async c() { return 3; }
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          /* eslint-disable enforce-memoize-async */
          async a() { return 1; }
          /* eslint-enable enforce-memoize-async */
          @Memoize()
          async b() { return 2; }
          @Memoize()
          async c() { return 3; }
        }
      `,
    },
    {
      name: 'suppressed first violation with Memoize already imported adds no duplicate import',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      // MethodDefinition.range covers leading decorators, so the reported
      // location is the decorator's line. A disable above the decorator is
      // therefore the one that suppresses the report, matching real ESLint.
      name: 'disable above an existing decorator suppresses the decorated method',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          @Log()
          async a() { return 1; }
          async b() { return 2; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          // eslint-disable-next-line enforce-memoize-async
          @Log()
          async a() { return 1; }
          @Memoize()
          async b() { return 2; }
        }
      `,
    },
    {
      // Mirror of the above: a disable *between* the decorator and the
      // signature targets the signature line, not the reported location, so
      // ESLint does not suppress the report and the fix still applies.
      name: 'disable between a decorator and its method does not suppress',
      code: `
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Log()
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        function Log(): MethodDecorator { return () => {}; }
        class Example {
          @Memoize()
          @Log()
          // eslint-disable-next-line enforce-memoize-async
          async a() { return 1; }
        }
      `,
    },
    // ------------------------------------------------------------------
    // Issue #1423: the fix inserts an import that binds `Memoize`, so an
    // existing binding of that name makes the edit wrong twice over — a
    // module-scope declaration collides with the import (TS2440, or TS2300
    // when the binding is itself an import), and a shadow at the fix site
    // captures the emitted decorator with no compile error at all. The report
    // stands; only the edit is withheld.
    // ------------------------------------------------------------------
    {
      name: 'a module-scope const named Memoize withholds the fix',
      code: `
        const Memoize = 1;
        export class Service {
          public async load(): Promise<number> { return Memoize; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a function declaration named Memoize withholds the fix',
      code: `
        function Memoize() { return 1; }
        export class Service {
          public async load() { return Memoize(); }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a class declaration named Memoize withholds the fix',
      code: `
        class Memoize {}
        export class Service {
          public async load() { return new Memoize(); }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'the enclosing class binding its own name Memoize withholds the fix',
      code: `
        export class Memoize {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a named Memoize import from another module withholds the fix',
      code: `
        import { Memoize } from 'some-other-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a namespace import named Memoize withholds the fix',
      code: `
        import * as Memoize from 'some-other-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a default import named Memoize withholds the fix',
      code: `
        import Memoize from '@blumintinc/typescript-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a type-only Memoize import withholds the fix',
      code: `
        import type { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'an inline type-only Memoize specifier withholds the fix',
      code: `
        import { type Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a shadowing parameter named Memoize withholds the fix at that site',
      code: `
        export function build(Memoize) {
          return class {
            async load() { return Memoize; }
          };
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a block-scoped Memoize binding withholds the fix at that site',
      code: `
        export function build() {
          const Memoize = 1;
          class Service {
            async load() { return Memoize; }
          }
          return Service;
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: null,
    },
    {
      name: 'a shadowed site declines while an unshadowed site still carries the import',
      code: `
        export class Outer {
          async first() { return 1; }
        }
        export function build(Memoize) {
          return class {
            async second() { return Memoize; }
          };
        }
      `,
      errors: [
        { messageId: 'requireMemoize' },
        { messageId: 'requireMemoize' },
      ],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Outer {
          @Memoize()
          async first() { return 1; }
        }
        export function build(Memoize) {
          return class {
            async second() { return Memoize; }
          };
        }
      `,
    },
    {
      name: 'an existing Memoize import is reused rather than duplicated',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Service {
          @Memoize()
          public async load() { return 1; }
        }
      `,
    },
    {
      name: 'a legacy-package Memoize import is reused rather than declined',
      code: `
        import { Memoize } from 'typescript-memoize';
        export class Service {
          public async load() { return 1; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from 'typescript-memoize';
        export class Service {
          @Memoize()
          public async load() { return 1; }
        }
      `,
    },
    {
      name: 'a Memoize binding elsewhere does not block a fix that emits an alias',
      code: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          public async load() { return Memoize; }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize as Cache } from '@blumintinc/typescript-memoize';
        const Memoize = 1;
        export class Service {
          @Cache()
          public async load() { return Memoize; }
        }
      `,
    },
    {
      // Import state is read off the AST at fix time: an ImportDeclaration
      // that trails the class in source order has not been visited when the
      // fix is computed, so a traversal flag would report it absent and emit
      // a second one.
      name: 'an import that trails the class in source order is still reused',
      code: `
        export class Service {
          public async load() { return 1; }
        }
        import { Memoize } from '@blumintinc/typescript-memoize';
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        export class Service {
          @Memoize()
          public async load() { return 1; }
        }
        import { Memoize } from '@blumintinc/typescript-memoize';
      `,
    },
  ],
});

const RULE_ID = '@blumintinc/blumint/enforce-memoize-async';

const createLinter = () => {
  const linter = new Linter();
  linter.defineParser(
    '@typescript-eslint/parser',
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@typescript-eslint/parser'),
  );
  linter.defineRule(RULE_ID, enforceMemoizeAsync as unknown as Rule.RuleModule);
  // A near-miss neighbour proves rule matching is exact rather than a
  // suffix/substring heuristic.
  linter.defineRule('@blumintinc/blumint/enforce-memoize-async-generator', {
    meta: { schema: [] },
    create: () => ({}),
  } as unknown as Rule.RuleModule);
  return linter;
};

const LINT_CONFIG = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020 as const,
    sourceType: 'module' as const,
  },
  rules: { [RULE_ID]: 'error' as const },
};

const lint = (code: string) =>
  createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts').output;

const lintMessages = (code: string) =>
  createLinter().verify(code, LINT_CONFIG, 'Service.ts');

// Issue #1404: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted @Memoize()
// decorator is never left without its import.
describe('enforce-memoize-async: inline disables and the import carrier (issue #1404)', () => {
  const expectNoUnboundMemoize = (output: string) => {
    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  };

  it('carries the import on the first surviving violation', () => {
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first(): Promise<string> {
    return 'a';
  }

  public async second(): Promise<string> {
    return 'b';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first(): Promise<string> {
    return 'a';
  }

  @Memoize()
  public async second(): Promise<string> {
    return 'b';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('adds neither import nor decorator when every violation is disabled', () => {
    const code = `export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first() {
    return 'a';
  }

  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async second() {
    return 'b';
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('Memoize');
  });

  it('adds neither import nor decorator under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/enforce-memoize-async */
export class Recorder {
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('@Memoize');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async-generator
  public async first() {
    return 'a';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async-generator
  @Memoize()
  public async first() {
    return 'a';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`export class Recorder {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-async */
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-async */

  public async third() {
    return 'c';
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Recorder {
  /* eslint-disable @blumintinc/blumint/enforce-memoize-async */
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }
  /* eslint-enable @blumintinc/blumint/enforce-memoize-async */

  @Memoize()
  public async third() {
    return 'c';
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`export class Recorder {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  public async first() {
    return 'a';
  }

  public async second() {
    return 'b';
  }

  public async third() {
    return 'c';
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(2);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    expectNoUnboundMemoize(output);
  });
});

// Issue #1423: RuleTester asserts a single fix pass, while `eslint --fix`
// re-lints until the output settles. These cases run the real multi-pass fixer
// against a file that already binds `Memoize` and assert the invariant the bug
// violated: the file never gains a second declaration of that name, and the
// violation is still reported so the author resolves the clash deliberately.
describe('enforce-memoize-async: an existing Memoize binding (issue #1423)', () => {
  const topScopeMemoizeDeclarations = (source: string) =>
    (
      source.match(
        /^(?:export\s+)?(?:const|let|var|function|class)\s+Memoize\b/gm,
      ) ?? []
    ).length + (source.match(/^import\b[^;]*\bMemoize\b[^;]*;/gm) ?? []).length;

  it('leaves a file with a module-scope const Memoize untouched', () => {
    const code = `const Memoize = 1;
export class Service {
  public async load(): Promise<number> {
    return Memoize;
  }
}
`;

    expect(lint(code)).toBe(code);
    expect(topScopeMemoizeDeclarations(lint(code))).toBe(1);
  });

  it('still reports the violation it declines to fix', () => {
    const messages = lintMessages(`const Memoize = 1;
export class Service {
  public async load(): Promise<number> {
    return Memoize;
  }
}
`);

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
  });

  it('leaves a shadowing binding alone across every pass', () => {
    const code = `export function build(Memoize) {
  return class {
    async load() {
      return Memoize;
    }
  };
}
`;

    expect(lint(code)).toBe(code);
    expect(lint(code)).not.toContain('@Memoize');
  });

  it('keeps one declaration when an unshadowed sibling carries the import', () => {
    const output = lint(`export class Outer {
  public async first() {
    return 1;
  }
}
export function build(Memoize) {
  return class {
    async second() {
      return Memoize;
    }
  };
}
`);

    expect(topScopeMemoizeDeclarations(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
  });
});

// Issue #1548: `--fix` re-lints until the output settles, so the guarantee that
// matters is that a value-less method survives the whole run undecorated. A
// memoized `Promise<void>` method commits its side effects once per instance
// and silently no-ops thereafter — a behaviour change applied unattended.
describe('enforce-memoize-async: methods declared to produce no value (issue #1548)', () => {
  it('leaves a Promise<void> method untouched across every pass', () => {
    const code = `export class OutboxWriter {
  public async flushPendingWrites(): Promise<void> {
    await this.batch.commit();
  }
}
`;

    expect(lint(code)).toBe(code);
    expect(lint(code)).not.toContain('Memoize');
  });

  it('reports nothing on a Promise<void> method', () => {
    expect(
      lintMessages(`export class OutboxWriter {
  public async flushPendingWrites(): Promise<void> {
    await this.batch.commit();
  }
}
`),
    ).toHaveLength(0);
  });

  it('leaves a void-annotated method untouched', () => {
    const code = `export class Pinger {
  public async ping(): void {
    this.socket.send('ping');
  }
}
`;

    expect(lint(code)).toBe(code);
  });

  it('still decorates a value-returning sibling and imports once', () => {
    const output = lint(`export class OutboxWriter {
  public async flush(): Promise<void> {
    await this.batch.commit();
  }

  public async pending(): Promise<number> {
    return this.batch.size;
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    expect(output).toContain(`  public async flush(): Promise<void> {`);
  });

  it('still reports a Promise<void | undefined> union', () => {
    const messages = lintMessages(`export class Example {
  public async maybe(): Promise<void | undefined> {
    return undefined;
  }
}
`);

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
  });
});
