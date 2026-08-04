import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMemoizeAsync } from '../rules/enforce-memoize-async';
import { noExplicitReturnType } from '../rules/no-explicit-return-type';

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
    // ------------------------------------------------------------------
    // Issue #1563: a function-typed sole parameter cannot key a cache:
    // @Memoize() compares arguments with a deep-equal scan, so a stable
    // callback replays the first result forever while a fresh arrow per call
    // never hits and accumulates a dead entry each time. Neither outcome is
    // ever intended, so the rule must not demand the decorator here.
    // ------------------------------------------------------------------
    {
      code: `
        class IsolatedLogin {
          public async run(presentAuthorizeUrl: (url: string) => Promise<void>) {
            await presentAuthorizeUrl('https://example.com/authorize');
            return 'credential';
          }
        }
      `,
    },
    {
      code: `
        class Traverser {
          public async each(visit: (node: string) => void) {
            return visit('root');
          }
        }
      `,
    },
    {
      name: 'an optional function parameter is exempt',
      code: `
        class Authorizer {
          public async open(onUrl?: (u: string) => void) {
            return this.token;
          }
        }
      `,
    },
    {
      name: 'a defaulted function parameter is exempt',
      code: `
        class Authorizer {
          public async open(onUrl: (u: string) => void = () => {}) {
            return this.token;
          }
        }
      `,
    },
    {
      name: 'a rest function parameter is exempt',
      code: `
        class Authorizer {
          public async open(...onUrl: (u: string) => void) {
            return this.token;
          }
        }
      `,
    },
    {
      name: 'a zero-argument function type is exempt',
      code: `
        class Runner {
          public async start(run: () => void) {
            return run();
          }
        }
      `,
    },
    {
      // Parentheses around the annotation are not represented in the AST, so
      // the decision comes from the same node either way.
      name: 'a parenthesised function type is exempt',
      code: `
        class Runner {
          public async start(run: ((n: number) => string)) {
            return run(1);
          }
        }
      `,
    },
    {
      // Neither reason to skip depends on the other: the callback carve-out
      // holds for a method that also declares a value-returning type.
      name: 'a function parameter on an annotated method is exempt',
      code: `
        class IsolatedLogin {
          public async run(present: (url: string) => Promise<void>): Promise<string> {
            await present('https://example.com');
            return 'credential';
          }
        }
      `,
    },
    {
      // The carve-out drops the method entirely, so a class of only callback
      // methods must not gain `import { Memoize }` either.
      name: 'a class of only callback methods pulls in no import',
      code: `
        export class Presenter {
          public async run(present: (url: string) => Promise<void>) {
            return present('https://example.com');
          }
          private async retry(onFail: (e: Error) => void) {
            return onFail(new Error('nope'));
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
    // ------------------------------------------------------------------
    // Issue #1563: the callback carve-out is keyed to a parameter annotated
    // as a function type. Every other annotation, and no annotation at all,
    // keeps reporting and keeps fixing.
    // ------------------------------------------------------------------
    {
      // An UNANNOTATED parameter declares no intent, mirroring the return-type
      // posture from #1548: it keeps reporting.
      name: 'an unannotated parameter still reports',
      code: `
        class Fetcher {
          public async load(id) {
            return this.db.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async load(id) {
            return this.db.get(id);
          }
        }
      `,
    },
    {
      name: 'a primitive-annotated parameter is unaffected',
      code: `
        class Fetcher {
          public async load(id: string) {
            return this.db.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async load(id: string) {
            return this.db.get(id);
          }
        }
      `,
    },
    {
      // The scope fence: this rule is syntactic and cannot resolve an alias to
      // the function type behind it, so a callback declared this way is
      // indistinguishable from any other type reference.
      name: 'a callback behind a type alias still reports',
      code: `
        type UrlPresenter = (url: string) => Promise<void>;
        class IsolatedLogin {
          public async run(onUrl: UrlPresenter) {
            return onUrl('https://example.com');
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type UrlPresenter = (url: string) => Promise<void>;
        class IsolatedLogin {
          @Memoize()
          public async run(onUrl: UrlPresenter) {
            return onUrl('https://example.com');
          }
        }
      `,
    },
    {
      name: 'an object-typed parameter still reports',
      code: `
        class Fetcher {
          public async load(opts: { a: string }) {
            return this.db.get(opts.a);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async load(opts: { a: string }) {
            return this.db.get(opts.a);
          }
        }
      `,
    },
    {
      name: 'a zero-parameter async method still reports',
      code: `
        class Fetcher {
          public async loadAll() {
            return this.db.all();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async loadAll() {
            return this.db.all();
          }
        }
      `,
    },
    {
      // A union is not categorically a function — the caller may well pass the
      // string — so the argument can key a cache and the report stands. The
      // carve-out errs toward reporting wherever the annotation leaves room.
      name: 'a union containing a function type still reports',
      code: `
        class Fetcher {
          public async load(cb: string | (() => void)) {
            return this.db.get(cb);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async load(cb: string | (() => void)) {
            return this.db.get(cb);
          }
        }
      `,
    },
    {
      // An array of callbacks is a distinct annotation shape; only a bare
      // function type is exempt.
      name: 'an array of function types still reports',
      code: `
        class Fetcher {
          public async load(cbs: ((n: number) => void)[]) {
            return cbs.length;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Fetcher {
          @Memoize()
          public async load(cbs: ((n: number) => void)[]) {
            return cbs.length;
          }
        }
      `,
    },
    {
      // The fence holds on the annotation side too: a constructor type is not
      // exempted, only TSFunctionType is.
      name: 'a constructor-typed parameter still reports',
      code: `
        class Factory {
          public async build(ctor: new () => Thing) {
            return new ctor();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Factory {
          @Memoize()
          public async build(ctor: new () => Thing) {
            return new ctor();
          }
        }
      `,
    },
    {
      // The carve-out skips only the callback method; a value-keyed sibling in
      // the same class still reports and still carries the import.
      name: 'a callback method does not suppress its value-keyed sibling',
      code: `
        export class IsolatedLogin {
          public async run(present: (url: string) => Promise<void>) {
            return present('https://example.com');
          }

          public async credential(id: string) {
            return this.store.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class IsolatedLogin {
          public async run(present: (url: string) => Promise<void>) {
            return present('https://example.com');
          }

          @Memoize()
          public async credential(id: string) {
            return this.store.get(id);
          }
        }
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

// Issue #1562: the exemption above reads an annotation, and `no-explicit-return-type`
// — enabled alongside this rule in the recommended config, and fixable — used to
// delete that annotation. Because `eslint --fix` re-lints until the output
// settles, one run stripped `: Promise<void>` and then memoized the now
// unannotated method. Linting both rules together is the only way to see it:
// each rule in isolation behaves exactly as documented.
describe('enforce-memoize-async: the Promise<void> exemption survives recommended-config --fix', () => {
  const RETURN_TYPE_RULE_ID = '@blumintinc/blumint/no-explicit-return-type';

  const lintBoth = (code: string) => {
    const linter = createLinter();
    linter.defineRule(
      RETURN_TYPE_RULE_ID,
      noExplicitReturnType as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        ...LINT_CONFIG,
        rules: {
          ...LINT_CONFIG.rules,
          [RETURN_TYPE_RULE_ID]: 'error' as const,
        },
      },
      'Authorizer.ts',
    ).output;
  };

  it('never memoizes a method the author declared Promise<void>', () => {
    const output = lintBoth(`export class Authorizer {
  public async present(url: string): Promise<void> {
    await this.open(url);
  }
}
`);

    expect(output).not.toContain('@Memoize');
    expect(output).not.toContain('@blumintinc/typescript-memoize');
  });

  it('never memoizes a method the author declared void', () => {
    expect(
      lintBoth(`export class Pinger {
  public async ping(): void {
    this.socket.send('ping');
  }
}
`),
    ).not.toContain('@Memoize');
  });

  it('still memoizes a value-returning sibling in the same file', () => {
    const output = lintBoth(`export class Authorizer {
  public async present(url: string): Promise<void> {
    await this.open(url);
  }

  public async token(): Promise<string> {
    return 'tok';
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain('public async token()');
  });
});

// Issue #1563: RuleTester applies one fix pass, while `eslint --fix` re-lints
// until the output settles. The guarantee that matters is that a method keyed
// only by a callback survives the whole run undecorated: memoizing it either
// replays a stale result or leaks a dead closure per call.
describe('enforce-memoize-async: callback-keyed methods (issue #1563)', () => {
  it('leaves a callback-only method untouched across every pass', () => {
    const code = `export class IsolatedLogin {
  public async run(presentAuthorizeUrl: (url: string) => Promise<void>) {
    await presentAuthorizeUrl('https://example.com/authorize');
    return 'credential';
  }
}
`;

    expect(lint(code)).toBe(code);
    expect(lint(code)).not.toContain('Memoize');
  });

  it('reports nothing on a callback-only method', () => {
    expect(
      lintMessages(`export class Traverser {
  public async each(visit: (node: string) => void) {
    return visit('root');
  }
}
`),
    ).toHaveLength(0);
  });

  it('still decorates a value-keyed sibling and imports once', () => {
    const output = lint(`export class IsolatedLogin {
  public async run(present: (url: string) => Promise<void>) {
    return present('https://example.com');
  }

  public async credential(id: string) {
    return this.store.get(id);
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    expect(output).toContain(
      `  public async run(present: (url: string) => Promise<void>) {`,
    );
  });

  it('still reports a callback declared through a type alias', () => {
    const messages =
      lintMessages(`type UrlPresenter = (url: string) => Promise<void>;
export class IsolatedLogin {
  public async run(onUrl: UrlPresenter) {
    return onUrl('https://example.com');
  }
}
`);

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
  });
});

// Issue #1648: the injected `import { Memoize }` must land below whatever
// governs the top of the file. A file with no import declaration has nothing to
// anchor to, and inserting above everything demotes a `'use client'` directive
// out of the prologue, moves a `#!` shebang off character 0 (leaving the file
// unparseable) and lifts an import above the header comment that covers it.
ruleTesterTs.run(
  'enforce-memoize-async: file prologue (issue #1648)',
  enforceMemoizeAsync,
  {
    valid: [],
    invalid: [
      // A directive only counts while it is the first statement.
      {
        code: `'use client';
class Example {
  async getData() {
    return await fetch('data');
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  async getData() {
    return await fetch('data');
  }
}
`,
      },
      // A shebang parses only at character 0.
      {
        code: `#!/usr/bin/env node
class Example {
  async getData() {
    return await fetch('data');
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `#!/usr/bin/env node
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  async getData() {
    return await fetch('data');
  }
}
`,
      },
      // A header comment governs the code beneath it, import included.
      {
        code: `// @ts-nocheck
class Example {
  async getData() {
    return await fetch('data');
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `// @ts-nocheck
import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  async getData() {
    return await fetch('data');
  }
}
`,
      },
      // Control: an existing import still anchors the injected one, so the
      // prologue cases cannot pass by declining to insert at all.
      {
        code: `'use client';
import { something } from 'lib';
class Example {
  async getData() {
    return await something(fetch('data'));
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
import { something } from 'lib';
class Example {
  @Memoize()
  async getData() {
    return await something(fetch('data'));
  }
}
`,
      },
    ],
  },
);

// Issue #1697: a jest registrar's module factory is hoisted above the file's
// imports, and babel-plugin-jest-hoist rejects a factory that reads an
// out-of-scope binding whose name does not begin with `mock`. The injected
// `import { Memoize }` is therefore unreachable from inside one, and the
// emitted decorator takes the whole suite down at transform time. The fix
// declines inside a factory while the report stands.
ruleTesterTs.run(
  'enforce-memoize-async: jest mock factories (issue #1697)',
  enforceMemoizeAsync,
  {
    valid: [
      // A factory method that already carries the decorator is not this rule's
      // business either way.
      {
        name: 'an already decorated method inside a factory reports nothing',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    @Memoize()
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
      },
      // The guard withholds the fix, not the exemptions that precede the
      // report: a two-parameter method inside a factory is still unreported.
      {
        name: 'a multi-parameter method inside a factory reports nothing',
        code: `
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch(collection: string, id: string) {
      return [collection, id];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
      },
      {
        name: 'a Promise<void> method inside a factory reports nothing',
        code: `
jest.mock('../Notifier', () => {
  class NotifierMock {
    public async notify(): Promise<void> {
      return undefined;
    }
  }
  return { Notifier: NotifierMock };
});
`,
      },
    ],
    invalid: [
      // The issue's verified minimal repro.
      {
        name: 'a class in a jest.mock factory reports without a fix',
        filename: '/repo/functions/src/util/x.test.ts',
        code: `
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        name: 'a jest.doMock factory withholds the fix',
        code: `
jest.doMock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        name: 'a jest.setMock factory withholds the fix',
        code: `
jest.setMock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        // The ancestor walk has to reach the factory from arbitrary depth, not
        // just from a class statement directly in the factory body.
        name: 'a class expression inside the returned object literal withholds the fix',
        code: `
jest.mock('../FirestoreFetcher', () => {
  return {
    FirestoreFetcher: class {
      public async fetch() {
        return [];
      }
    },
  };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        name: 'a concise arrow factory withholds the fix',
        code: `
jest.mock('../FirestoreFetcher', () => ({
  FirestoreFetcher: class {
    public async fetch() {
      return [];
    }
  },
}));
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        name: 'a function-expression factory withholds the fix',
        code: `
jest.mock('../FirestoreFetcher', function () {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        // Every violation inside factories means no violation claims the import
        // carrier, so the file gains neither decorator nor import.
        name: 'two factories in one file both withhold their fix',
        code: `
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
jest.mock('../DocumentFetcher', () => {
  class DocumentFetcherMock {
    public async read() {
      return {};
    }
  }
  return { DocumentFetcher: DocumentFetcherMock };
});
`,
        errors: [
          { messageId: 'requireMemoize' as const },
          { messageId: 'requireMemoize' as const },
        ],
        output: null,
      },
      {
        // The control that proves the guard is scoped to the factory rather
        // than to test files: a method outside every factory still fixes, and
        // still carries the import for the file.
        name: 'a method outside the factory in the same file still fixes',
        filename: '/repo/functions/src/util/x.test.ts',
        code: `
jest.mock('../FirestoreFetcher', () => ({ FirestoreFetcher: jest.fn() }));

export class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
jest.mock('../FirestoreFetcher', () => ({ FirestoreFetcher: jest.fn() }));

export class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        // A declining factory violation must not consume the import carrier:
        // the surviving violation still gets both decorator and import.
        name: 'a declining factory violation passes the import carrier on',
        code: `
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});

export class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [
          { messageId: 'requireMemoize' as const },
          { messageId: 'requireMemoize' as const },
        ],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});

export class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        // The module specifier is evaluated in place rather than hoisted with
        // the factory, so a class there keeps its access to the file's imports.
        name: 'a class in the mock specifier position still fixes',
        code: `
jest.mock(
  resolveModule(
    class Locator {
      public async path() {
        return './FirestoreFetcher';
      }
    },
  ),
  () => ({}),
);
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
jest.mock(
  resolveModule(
    class Locator {
      @Memoize()
      public async path() {
        return './FirestoreFetcher';
      }
    },
  ),
  () => ({}),
);
`,
      },
      {
        // `jest.fn` is not a registrar: its callback is never hoisted, so a
        // class inside it fixes like any other.
        name: 'a factory-shaped callback outside a registrar still fixes',
        code: `
const build = jest.fn(() => {
  class Stub {
    public async fetch() {
      return [];
    }
  }
  return Stub;
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const build = jest.fn(() => {
  class Stub {
    @Memoize()
    public async fetch() {
      return [];
    }
  }
  return Stub;
});
`,
      },
      {
        // Only `jest`'s own registrars hoist, so a same-named method on another
        // object registers nothing and its factory keeps the imports.
        name: 'a mock-shaped call on another object still fixes',
        code: `
notJest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
notJest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    @Memoize()
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`,
      },
      {
        // A test file with no factory at all is untouched by the guard.
        name: 'a plain class in a test file still fixes',
        filename: '/repo/functions/src/util/x.test.ts',
        code: `
export class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
    ],
  },
);

// Issue #1697: RuleTester applies a single fix pass, while `eslint --fix`
// re-lints until the output settles. These cases run the real multi-pass fixer
// over the reported repro and assert the invariant the bug violated: no
// `Memoize` reference is ever written inside a hoisted jest factory, and no
// import rides on a fix that never lands.
describe('enforce-memoize-async: hoisted jest factories (issue #1697)', () => {
  const TEST_FILENAME = 'ErrorIncidentResolver.test.ts';

  const lintTest = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, TEST_FILENAME).output;

  const lintTestMessages = (code: string) =>
    createLinter().verify(code, LINT_CONFIG, TEST_FILENAME);

  const REPRO = `jest.mock('../FirestoreFetcher', () => {
  class FirestoreFetcherMock {
    public async fetch() {
      return [];
    }
  }
  return { FirestoreFetcher: FirestoreFetcherMock };
});
`;

  it('leaves the reported repro untouched across every pass', () => {
    const output = lintTest(REPRO);

    expect(output).toBe(REPRO);
    expect(output).not.toContain('Memoize');
  });

  it('still reports the violation it declines to fix', () => {
    const messages = lintTestMessages(REPRO);

    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_ID);
  });

  it('drops the fix from the report rather than the report itself', () => {
    // Report count unchanged, fixable count down: the same violation outside a
    // factory still arrives with a fix attached.
    expect(lintTestMessages(REPRO)[0].fix).toBeUndefined();

    const outside = lintTestMessages(`export class Loader {
  public async load() {
    return 1;
  }
}
`);
    expect(outside).toHaveLength(1);
    expect(outside[0].fix).toBeDefined();
  });

  it('decorates a sibling outside the factory without touching the factory', () => {
    const output = lintTest(`${REPRO}
export class Loader {
  public async load() {
    return 1;
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    // The decorator landed on the outside class, never inside the factory.
    expect(output).toContain(`  @Memoize()
  public async load() {`);
    expect(output).toContain(`    public async fetch() {`);
  });

  it('adds no import when every violation sits inside a factory', () => {
    const output = lintTest(`${REPRO}jest.mock('../DocumentFetcher', () => {
  class DocumentFetcherMock {
    public async read() {
      return {};
    }
  }
  return { DocumentFetcher: DocumentFetcherMock };
});
`);

    expect(output).not.toContain('@blumintinc/typescript-memoize');
    expect(output).not.toContain('@Memoize');
  });

  it('never emits a decorator without its import', () => {
    const output = lintTest(`${REPRO}
export class Loader {
  public async load() {
    return 1;
  }
}
`);

    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  });
});
