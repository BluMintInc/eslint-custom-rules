import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
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
    {
      code: `
    class Secretary {
      private async applyMembership({ transaction }: { transaction: Transaction }) {
        const doc = await fetch(this.ref, { transaction });
        transaction.set(this.ref, { x: 1 });
        return true;
      }
      public async create() {
        return await db.runTransaction(async (transaction) => {
          return await this.applyMembership({ transaction });
        });
      }
    }
  `,
      // currently: 1 error on applyMembership + an auto-fix ADDING @Memoize(),
      //            which makes every Firestore retry commit empty
      // expected:  valid — a method receiving a Transaction must not be memoized
    },
    {
      code: `
    class Runner {
      async body(transaction: Transaction) { transaction.set(ref, {}); }
      async run() { return db.runTransaction((t) => this.body(t)); }
    }
  `,
      // same expectation via the positional-parameter spelling
    },
    {
      // The annotation alone decides: no `runTransaction` call is needed
      // anywhere in the file, because a handle only ever reaches a method that
      // some attempt created it for.
      name: 'a positionally annotated transaction parameter is exempt',
      code: `
        class Ledger {
          public async apply(transaction: Transaction) {
            transaction.set(this.ref, { applied: true });
            return true;
          }
        }
      `,
    },
    {
      name: 'a qualified transaction type is exempt',
      code: `
        class Ledger {
          public async apply(tx: FirebaseFirestore.Transaction) {
            tx.set(this.ref, { applied: true });
            return true;
          }
        }
      `,
    },
    {
      name: 'a deeply qualified transaction type is exempt',
      code: `
        import type * as admin from 'firebase-admin';
        class Ledger {
          public async apply(tx: admin.firestore.Transaction) {
            tx.set(this.ref, { applied: true });
            return true;
          }
        }
      `,
    },
    {
      name: 'an aliased transaction import is exempt',
      code: `
        import type { Transaction as Txn } from 'firebase-admin/firestore';
        class Ledger {
          public async apply(tx: Txn) {
            tx.set(this.ref, { applied: true });
            return true;
          }
        }
      `,
    },
    {
      name: 'an optional transaction parameter is exempt',
      code: `
        class Ledger {
          public async apply(transaction?: Transaction) {
            return transaction?.get(this.ref);
          }
        }
      `,
    },
    {
      name: 'a defaulted transaction parameter is exempt',
      code: `
        class Ledger {
          public async apply(transaction: Transaction = fallbackTransaction) {
            return transaction.get(this.ref);
          }
        }
      `,
    },
    {
      name: 'a union that includes a transaction is exempt',
      code: `
        class Ledger {
          public async apply(transaction: Transaction | undefined) {
            return transaction?.get(this.ref);
          }
        }
      `,
    },
    {
      name: 'a destructured transaction beside another property is exempt',
      code: `
        class Ledger {
          public async apply({
            transaction,
            id,
          }: {
            transaction: Transaction;
            id: string;
          }) {
            transaction.set(this.refOf(id), { applied: true });
            return true;
          }
        }
      `,
    },
    {
      // The handle arrives through an object type whether or not the parameter
      // is destructured, so the undestructured spelling answers the same.
      name: 'an undestructured object type carrying a transaction is exempt',
      code: `
        class Ledger {
          public async apply(args: { transaction: Transaction; id: string }) {
            args.transaction.set(this.refOf(args.id), { applied: true });
            return true;
          }
        }
      `,
    },
    {
      // The owner of the call is exempt too: memoizing it runs the whole
      // transaction, writes included, once per instance.
      name: 'a method that owns a runTransaction call is exempt',
      code: `
        class Secretary {
          public async create(userId: string) {
            return db.runTransaction(async (t) => {
              t.set(this.refOf(userId), { joined: true });
              return true;
            });
          }
        }
      `,
    },
    {
      name: 'a bare runTransaction callee is recognised',
      code: `
        class Secretary {
          public async create() {
            return runTransaction(db, async (t) => {
              t.set(this.ref, { joined: true });
              return true;
            });
          }
        }
      `,
    },
    {
      // The handle's type is behind an alias the syntactic test cannot resolve,
      // so the call site inside the callback is what recognises the method.
      name: 'a callback-invoked method handed the attempt is exempt',
      code: `
        class Secretary {
          private async applyMembership(args: MembershipArgs) {
            args.transaction.set(this.ref, { joined: true });
            return true;
          }
          public async create() {
            const membershipData = await this.generateMembershipData();
            return db.runTransaction(async (transaction) => {
              return this.applyMembership({ membershipData, transaction });
            });
          }
        }
      `,
    },
    {
      name: 'a method passed directly as the callback is exempt',
      code: `
        class Runner {
          private async body(t) {
            t.set(this.ref, {});
            return true;
          }
          public async run() {
            return db.runTransaction(this.body);
          }
        }
      `,
    },
    {
      name: 'a bound method passed as the callback is exempt',
      code: `
        class Runner {
          private async body(t) {
            t.set(this.ref, {});
            return true;
          }
          public async run() {
            return db.runTransaction(this.body.bind(this));
          }
        }
      `,
    },
    {
      // ESTree wraps a whole optional chain in a ChainExpression, so the
      // nullish spelling of a call or a member read is a different node than
      // the plain one. The handle it carries is the same, and a carve-out that
      // lapsed here would put the empty-commit autofix back on this method.
      name: 'a nullish-spelled callback member read is exempt',
      code: `
        class Runner {
          private async body(t) {
            t?.set(this?.ref, {});
            return true;
          }
          public async run() {
            return db?.runTransaction(this?.body);
          }
        }
      `,
    },
    {
      name: 'a nullish-spelled bound callback is exempt',
      code: `
        class Runner {
          private async body(t) {
            t?.set(this?.ref, {});
            return true;
          }
          public async run() {
            return db?.runTransaction?.(this.body.bind?.(this));
          }
        }
      `,
    },
    {
      name: 'a nullish-spelled participant call is exempt',
      code: `
        class Runner {
          private async body(t) {
            t.set(this.ref, {});
            return true;
          }
          public async run() {
            return db.runTransaction(async (t) => this?.body(t));
          }
        }
      `,
    },
    {
      // The carve-out drops the methods entirely, so a class of only
      // transaction members must not gain `import { Memoize }` either.
      name: 'a class of only transaction methods pulls in no import',
      code: `
        export class Secretary {
          private async applyMembership({ transaction }: { transaction: Transaction }) {
            transaction.set(this.ref, { joined: true });
            return true;
          }
          public async create() {
            return db.runTransaction(async (transaction) => {
              return this.applyMembership({ transaction });
            });
          }
        }
      `,
    },
    {
      code: `
    class Pool {
      public async acquire(size: number): Promise<{ id: string; release: () => void }> {
        const id = await this.claim(size);
        return { id, release: () => this.free(id) };
      }
    }
  `,
      // Expected: no error. A method returning a handle with a release/dispose
      // member allocates a caller-owned resource; memoizing it hands the same
      // handle — and the same release closure — to every later caller.
      options: [],
    },
    // A method that hands back a resource handle allocates it for THIS caller,
    // so a cache hands the second caller the first caller's live lease and the
    // release closure bound to it (issue #2068). The signal is structural: an
    // object result carrying a function-valued member.
    {
      name: 'an inline handle with a release closure is exempt',
      code: `
        class Pool {
          public async acquire(size: number): Promise<{ id: string; release: () => void }> {
            const id = await this.claim(size);
            return { id, release: () => this.free(id) };
          }
        }
      `,
    },
    {
      name: 'an inline handle with a dispose closure is exempt',
      code: `
        class Sessions {
          public async open(): Promise<{ socket: Socket; dispose: () => Promise<void> }> {
            const socket = await connect();
            return { socket, dispose: async () => socket.end() };
          }
        }
      `,
    },
    {
      // The member the disposal protocol is named by is a computed symbol key,
      // which a name allowlist could not read at all.
      name: 'a handle whose disposer is [Symbol.dispose] is exempt',
      code: `
        class Files {
          public async openTemp(): Promise<{ path: string; [Symbol.dispose](): void }> {
            return makeTempFile();
          }
        }
      `,
    },
    {
      name: 'a readonly handle is exempt',
      code: `
        class Governor {
          public async admit(spec: JobSpec): Promise<{ readonly reservedMb: number; readonly release: () => void }> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      name: 'a method-signature disposer is exempt',
      code: `
        class Leases {
          public async take(): Promise<{ id: string; release(): void }> {
            return this.store.take();
          }
        }
      `,
    },
    {
      name: 'an optional disposer is exempt',
      code: `
        class Leases {
          public async take(): Promise<{ id: string; release?: () => void }> {
            return this.store.take();
          }
        }
      `,
    },
    {
      // A disposer typed `(() => void) | undefined` still hands the caller a
      // closure on the arm that has one, and that caller is the one harmed.
      name: 'a disposer hidden in a union is exempt',
      code: `
        class Leases {
          public async take(): Promise<{ id: string; release: (() => void) | undefined }> {
            return this.store.take();
          }
        }
      `,
    },
    {
      name: 'a handle reached through a same-file type alias is exempt',
      code: `
        type Admission = { readonly reservedMb: number; readonly release: () => void };

        export class ExecutionGovernor {
          public async admit(spec: JobSpec): Promise<Admission> {
            while (!this.hasRoom(spec)) {
              await delay(750);
            }
            const release = this.store.claim(spec);
            return { reservedMb: spec.reservedMb, release };
          }
        }
      `,
    },
    {
      // Declarations hoist, so an alias written below the class it serves is in
      // scope for it.
      name: 'a handle alias declared after the class is exempt',
      code: `
        export class ExecutionGovernor {
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }
        }

        type Admission = { reservedMb: number; release: () => void };
      `,
    },
    {
      name: 'a handle reached through a same-file interface is exempt',
      code: `
        export interface Subscription {
          topic: string;
          unsubscribe: () => void;
        }

        export class Bus {
          public async subscribe(topic: string): Promise<Subscription> {
            return this.transport.subscribe(topic);
          }
        }
      `,
    },
    {
      // The alias is declared beside the class inside the factory, so only a
      // scope-chain walk — not a scan of `Program.body` — finds it.
      name: 'a handle alias declared in an enclosing function body is exempt',
      code: `
        export function makeGovernor() {
          type Admission = { reservedMb: number; release: () => void };

          class Governor {
            public async admit(spec: JobSpec): Promise<Admission> {
              return this.store.claim(spec);
            }
          }

          return new Governor();
        }
      `,
    },
    {
      name: 'a handle whose disposer is typed by a same-file function alias is exempt',
      code: `
        type Release = () => void;
        type Admission = { reservedMb: number; release: Release };

        export class Governor {
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      name: 'a nested handle is exempt',
      code: `
        class Governor {
          public async admit(spec: JobSpec): Promise<{ spec: JobSpec; admission: { release: () => void } }> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      name: 'a nullable handle result is exempt',
      code: `
        class Pool {
          public async tryAcquire(size: number): Promise<{ id: string; release: () => void } | null> {
            return this.store.tryClaim(size);
          }
        }
      `,
    },
    {
      name: 'a handle mixed into an intersection is exempt',
      code: `
        type Metered = { reservedMb: number };

        class Governor {
          public async admit(spec: JobSpec): Promise<Metered & { release: () => void }> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      // A batch of leases is a batch of caller-owned leases: the container the
      // method hands them back in does not change who owns them.
      name: 'an array of handles is exempt',
      code: `
        type Admission = { reservedMb: number; release: () => void };

        class Governor {
          public async admitAll(specs: JobSpec[]): Promise<Admission[]> {
            return specs.map((spec) => this.store.claim(spec));
          }
        }
      `,
    },
    {
      name: 'a readonly array of handles is exempt',
      code: `
        type Admission = { reservedMb: number; release: () => void };

        class Governor {
          public async admitAll(specs: JobSpec[]): Promise<readonly Admission[]> {
            return specs.map((spec) => this.store.claim(spec));
          }
        }
      `,
    },
    {
      name: 'a Readonly-wrapped handle is exempt',
      code: `
        type Admission = { reservedMb: number; release: () => void };

        class Governor {
          public async admit(spec: JobSpec): Promise<Readonly<Admission>> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      name: 'a handle alias that chains through another alias is exempt',
      code: `
        type Lease = { id: string; release: () => void };
        type Admission = Lease;

        class Governor {
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      name: 'a zero-parameter handle factory is exempt',
      code: `
        class Locks {
          public async acquire(): Promise<{ token: string; release: () => Promise<void> }> {
            return this.store.lock();
          }
        }
      `,
    },
    {
      // The carve-out drops the method entirely, so a class of only handle
      // factories must not gain `import { Memoize }` either.
      name: 'a class of only handle factories pulls in no import',
      code: `
        type Admission = { reservedMb: number; release: () => void };

        export class Governor {
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }

          public async admitDefault(): Promise<Admission> {
            return this.store.claim(DEFAULT_SPEC);
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
      // A class DECLARATION carries the shadow question on its own: the class
      // expression spelling is silent for an unrelated reason (#1952), which
      // would leave the shadow check untested.
      name: 'a shadowing parameter named Memoize withholds the fix at that site',
      code: `
        export function build(Memoize) {
          class Loader {
            async load() { return Memoize; }
          }
          return Loader;
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
          class Inner {
            async second() { return Memoize; }
          }
          return Inner;
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
          class Inner {
            async second() { return Memoize; }
          }
          return Inner;
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
    {
      // The transaction carve-out reads the TYPE, not the parameter's name: a
      // ledger entry, a payment, an audit record all get called `transaction`
      // and all key a cache perfectly well.
      name: 'a parameter merely named transaction still reports',
      code: `
        class Payments {
          public async record(transaction: PaymentTransaction) {
            return this.api.post(transaction);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Payments {
          @Memoize()
          public async record(transaction: PaymentTransaction) {
            return this.api.post(transaction);
          }
        }
      `,
    },
    {
      // The bare name lands OUTSIDE the carve-out: an unannotated parameter
      // declares nothing to honour, exactly as the callback and void carve-outs
      // read declarations rather than guess at them, and the consumers this
      // rule ships to compile under `noImplicitAny`, where the shape does not
      // type-check anyway. A handle that genuinely arrives here is recognised
      // by its call site inside the `runTransaction` callback instead.
      name: 'an unannotated parameter named transaction still reports',
      code: `
        class Ledger {
          public async apply(transaction) {
            return this.store.write(transaction);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Ledger {
          @Memoize()
          public async apply(transaction) {
            return this.store.write(transaction);
          }
        }
      `,
    },
    {
      // The type name is matched whole, not by substring.
      name: 'a differently named type containing Transaction still reports',
      code: `
        class Reports {
          public async render(summary: TransactionSummary) {
            return this.template(summary);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Reports {
          @Memoize()
          public async render(summary: TransactionSummary) {
            return this.template(summary);
          }
        }
      `,
    },
    {
      // A method that PRODUCES a handle is not a method that holds one for an
      // attempt, so the return type is not read for this carve-out.
      name: 'a transaction in the return type still reports',
      code: `
        class Sessions {
          public async open(): Promise<Transaction> {
            return this.pool.begin();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Sessions {
          @Memoize()
          public async open(): Promise<Transaction> {
            return this.pool.begin();
          }
        }
      `,
    },
    {
      // Type arguments are deliberately not entered: a collection of handles is
      // not the attempt-scoped handle the carve-out is about.
      name: 'a transaction inside a type argument still reports',
      code: `
        class Ledger {
          public async summarize(byId: Map<string, Transaction>) {
            return byId.size;
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Ledger {
          @Memoize()
          public async summarize(byId: Map<string, Transaction>) {
            return byId.size;
          }
        }
      `,
    },
    {
      // The carve-out is per METHOD, not per class: a sibling that neither
      // opens a transaction nor receives a handle still reports, and still
      // carries the file's import.
      name: 'a transaction owner does not suppress its unrelated sibling',
      code: `
        export class Secretary {
          public async create() {
            return db.runTransaction(async (t) => {
              t.set(this.ref, { joined: true });
              return true;
            });
          }

          public async loadConfig() {
            return this.api.getConfig();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Secretary {
          public async create() {
            return db.runTransaction(async (t) => {
              t.set(this.ref, { joined: true });
              return true;
            });
          }

          @Memoize()
          public async loadConfig() {
            return this.api.getConfig();
          }
        }
      `,
    },
    {
      // Being CALLED from a callback is not enough — passing the handle on is.
      // A helper the callback calls without it is untouched by the retry and
      // remains worth caching.
      name: 'a callback-invoked method that is handed no handle still reports',
      code: `
        export class Secretary {
          public async create() {
            return db.runTransaction(async (t) => {
              const config = await this.loadConfig();
              t.set(this.ref, config);
              return true;
            });
          }

          public async loadConfig() {
            return this.api.getConfig();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        export class Secretary {
          public async create() {
            return db.runTransaction(async (t) => {
              const config = await this.loadConfig();
              t.set(this.ref, config);
              return true;
            });
          }

          @Memoize()
          public async loadConfig() {
            return this.api.getConfig();
          }
        }
      `,
    },
    // The handle carve-out (issue #2068) keys on an object result carrying a
    // callable. A result that carries none is ordinary data, and caching it is
    // exactly what this rule is for.
    {
      name: 'a plain data object result still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          public async load(id: string): Promise<{ id: string; name: string }> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          @Memoize()
          public async load(id: string): Promise<{ id: string; name: string }> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      name: 'a primitive result still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          public async name(id: string): Promise<string> {
            return this.api.name(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          @Memoize()
          public async name(id: string): Promise<string> {
            return this.api.name(id);
          }
        }
      `,
    },
    {
      name: 'a nested plain object result still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          public async load(id: string): Promise<{ id: string; meta: { count: number } }> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          @Memoize()
          public async load(id: string): Promise<{ id: string; meta: { count: number } }> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      name: 'an alias resolving to a plain object still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Row = { id: string; count: number };
        class Repo {
          public async load(id: string): Promise<Row> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Row = { id: string; count: number };
        class Repo {
          @Memoize()
          public async load(id: string): Promise<Row> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      name: 'an interface resolving to a plain object still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        interface Row {
          id: string;
          count: number;
        }
        class Repo {
          public async load(id: string): Promise<Row> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        interface Row {
          id: string;
          count: number;
        }
        class Repo {
          @Memoize()
          public async load(id: string): Promise<Row> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      // The recursion guard has to terminate on a self-referential alias, and
      // a self-referential alias of plain data is still plain data.
      name: 'a self-referential plain alias terminates and still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Node = { id: string; next: Node };
        class Repo {
          public async head(): Promise<Node> {
            return this.api.head();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Node = { id: string; next: Node };
        class Repo {
          @Memoize()
          public async head(): Promise<Node> {
            return this.api.head();
          }
        }
      `,
    },
    {
      // The closure is the whole result, with no resource paired to it whose
      // accounting a shared reference corrupts — the shape a compiled formatter
      // or a prepared query is returned in, which is worth computing once.
      name: 'a bare callable result still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Templates {
          public async compile(name: string): Promise<() => string> {
            return compileTemplate(name);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Templates {
          @Memoize()
          public async compile(name: string): Promise<() => string> {
            return compileTemplate(name);
          }
        }
      `,
    },
    {
      // A lookup table of handlers is not a lease: a second caller shares it
      // without losing anything the first one owned.
      name: 'an index signature of callables still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Handlers {
          public async load(): Promise<{ [event: string]: () => void }> {
            return this.registry.all();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Handlers {
          @Memoize()
          public async load(): Promise<{ [event: string]: () => void }> {
            return this.registry.all();
          }
        }
      `,
    },
    {
      // A getter signature is a property access wearing a parameter list, so
      // the object it belongs to carries no callable member.
      name: 'a getter signature member still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          public async load(id: string): Promise<{ get name(): string }> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          @Memoize()
          public async load(id: string): Promise<{ get name(): string }> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      // `Function` is a type REFERENCE that resolves nowhere in the file, not a
      // written function type, so it declares no callable this rule can read.
      name: 'a member typed as bare Function still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          public async load(id: string): Promise<{ id: string; release: Function }> {
            return this.api.get(id);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Repo {
          @Memoize()
          public async load(id: string): Promise<{ id: string; release: Function }> {
            return this.api.get(id);
          }
        }
      `,
    },
    {
      // A two-argument container describes a registry the method looked handles
      // up in rather than a handle the call allocated, so it is not entered.
      name: 'a map keyed to handles still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Admission = { reservedMb: number; release: () => void };
        class Governor {
          public async all(): Promise<Map<string, Admission>> {
            return this.store.all();
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Admission = { reservedMb: number; release: () => void };
        class Governor {
          @Memoize()
          public async all(): Promise<Map<string, Admission>> {
            return this.store.all();
          }
        }
      `,
    },
    {
      // Annotation-driven, as every other carve-out in this rule is: a body
      // that happens to build a handle declares no intent to honour, and this
      // rule reads no type information.
      name: 'an unannotated handle factory still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Pool {
          public async acquire(size: number) {
            const id = await this.claim(size);
            return { id, release: () => this.free(id) };
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        class Pool {
          @Memoize()
          public async acquire(size: number) {
            const id = await this.claim(size);
            return { id, release: () => this.free(id) };
          }
        }
      `,
    },
    {
      // Resolution is lexical and same-file, so a handle type imported from
      // elsewhere is unreadable here and the method keeps reporting. The
      // author's remedy is the disable directive, which is deliberate and
      // reviewable.
      name: 'a handle type imported from another module still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { Admission } from './types';
        class Governor {
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        import { Admission } from './types';
        class Governor {
          @Memoize()
          public async admit(spec: JobSpec): Promise<Admission> {
            return this.store.claim(spec);
          }
        }
      `,
    },
    {
      // A same-named alias declared in the nearer scope is the one the
      // annotation denotes, so an outer handle alias must not answer for it.
      name: 'an inner plain alias shadowing an outer handle alias still reports',
      code: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Admission = { reservedMb: number; release: () => void };
        export function makeGovernor() {
          type Admission = { reservedMb: number };

          class Governor {
            public async admit(spec: JobSpec): Promise<Admission> {
              return this.store.reserve(spec);
            }
          }

          return new Governor();
        }
      `,
      errors: [{ messageId: 'requireMemoize' }],
      output: `
        import { Memoize } from '@blumintinc/typescript-memoize';
        type Admission = { reservedMb: number; release: () => void };
        export function makeGovernor() {
          type Admission = { reservedMb: number };

          class Governor {
            @Memoize()
            public async admit(spec: JobSpec): Promise<Admission> {
              return this.store.reserve(spec);
            }
          }

          return new Governor();
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
    // The shadowed class is a DECLARATION: a class expression is silent for an
    // unrelated reason (#1952) and would prove nothing about shadowing.
    const code = `export function build(Memoize) {
  class Loader {
    async load() {
      return Memoize;
    }
  }
  return Loader;
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
  class Inner {
    async second() {
      return Memoize;
    }
  }
  return Inner;
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
      // Issue #1957: the anchor sits past the prologue precisely because the
      // prologue precedes it, so widening the insertion to the anchor's line
      // start jumps the directive whenever the two share a line.
      {
        name: 'keeps a directive that shares the anchor line first',
        code: `'use client'; class Example {
  async getData() {
    return await fetch('data');
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `'use client'; import { Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  async getData() {
    return await fetch('data');
  }
}
`,
      },
      {
        name: 'keeps a directive sharing its line with an existing import first',
        code: `'use client'; import { something } from 'lib';
class Example {
  async getData() {
    return await something(fetch('data'));
  }
}
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `'use client'; import { Memoize } from '@blumintinc/typescript-memoize';
import { something } from 'lib';
class Example {
  @Memoize()
  async getData() {
    return await something(fetch('data'));
  }
}
`,
      },
      // The own-line branch still widens, which is what keeps the displaced
      // anchor on the indentation it already had.
      {
        name: 'keeps an indented anchor on its own indentation',
        code: `  'use client';
  class Example {
    async getData() {
      return await fetch('data');
    }
  }
`,
        errors: [{ messageId: 'requireMemoize' }],
        output: `  'use client';
  import { Memoize } from '@blumintinc/typescript-memoize';
  class Example {
    @Memoize()
    async getData() {
      return await fetch('data');
    }
  }
`,
      },
    ],
  },
);

// Issue #1957: a `'use client'` directive is a directive only while it is the
// FIRST statement, so an import spliced above it is silently demoted to an
// inert expression statement. Nothing in the lint chain reports that — the
// output re-lints clean, and unlike #1956 there is no compiler signal either,
// since a demoted directive is still valid TypeScript. The oracle therefore has
// to be STRUCTURAL: parse the output and ask whether the directive is still
// first. A substring check passes on the corrupt output, because the directive
// is still present — just no longer leading.
describe('enforce-memoize-async: the injected import stays below the prologue (issue #1957)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-memoize-async';
  const FILENAME = 'Example.ts';

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceMemoizeAsync as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const LINT_CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

  const verify = (code: string) =>
    createLinter().verify(code, LINT_CONFIG, FILENAME);

  /** Whether `'use client'` still leads the program body. */
  const directiveLeads = (code: string): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parser = require('@typescript-eslint/parser');
    const first = parser.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    }).body[0];
    return (
      first?.type === 'ExpressionStatement' &&
      first.expression?.type === 'Literal' &&
      first.expression.value === 'use client'
    );
  };

  const expectDirectiveSurvives = (code: string) => {
    // A fixture the rule declined, or that never had a leading directive, would
    // satisfy the assertions below vacuously.
    expect(verify(code).length).toBeGreaterThan(0);
    expect(directiveLeads(code)).toBe(true);

    const first = fix(code);
    expect(first.fixed).toBe(true);
    expect(fix(first.output).fixed).toBe(false);
    expect(verify(first.output)).toHaveLength(0);
    expect(directiveLeads(first.output)).toBe(true);
    expect(
      first.output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);

    return first.output;
  };

  it('keeps the directive leading when it shares the anchor line', () => {
    expectDirectiveSurvives(
      `'use client'; class Example {\n  async getData() {\n    return await fetch('data');\n  }\n}\n`,
    );
  });

  it('keeps the directive leading when an import shares its line', () => {
    expectDirectiveSurvives(
      `'use client'; import { something } from 'lib';\nclass Example {\n  async getData() {\n    return await something(fetch('data'));\n  }\n}\n`,
    );
  });

  it('keeps the directive leading for use server', () => {
    const output = fix(
      `'use server'; class Example {\n  async getData() {\n    return await fetch('data');\n  }\n}\n`,
    ).output;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parsed = require('@typescript-eslint/parser').parse(output, {
      ecmaVersion: 2022,
      sourceType: 'module',
      range: true,
      loc: true,
    });
    expect(parsed.body[0].expression.value).toBe('use server');
  });

  it('leaves the own-line spelling byte-identical to its prior output', () => {
    expect(
      expectDirectiveSurvives(
        `'use client';\nclass Example {\n  async getData() {\n    return await fetch('data');\n  }\n}\n`,
      ),
    ).toBe(
      `'use client';\nimport { Memoize } from '@blumintinc/typescript-memoize';\nclass Example {\n  @Memoize()\n  async getData() {\n    return await fetch('data');\n  }\n}\n`,
    );
  });

  it('would have caught the bug: the pre-fix output is rejected by the oracle', () => {
    // Verbatim output of the unguarded line-start anchor, kept as a planted
    // positive control so this block cannot decay into passing vacuously.
    const preFixOutput = `import { Memoize } from '@blumintinc/typescript-memoize';\n'use client'; class Example {\n  @Memoize()\n  async getData() {\n    return await fetch('data');\n  }\n}\n`;

    // Both halves matter: it re-lints CLEAN, so a report-counting guard scores
    // it a success, while the directive has stopped leading.
    expect(verify(preFixOutput)).toHaveLength(0);
    expect(preFixOutput).toContain(`'use client';`);
    expect(directiveLeads(preFixOutput)).toBe(false);
  });
});

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
        // just from a class statement directly in the factory body. The nested
        // class is a DECLARATION, so the factory check is the only thing that
        // can withhold the fix here — a class expression would be silent for an
        // unrelated reason (#1952) and would leave the walk untested.
        name: 'a class nested below the factory body withholds the fix',
        code: `
jest.mock('../FirestoreFetcher', () => {
  const build = () => {
    class FirestoreFetcherMock {
      public async fetch() {
        return [];
      }
    }
    return FirestoreFetcherMock;
  };
  return { FirestoreFetcher: build() };
});
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        name: 'a concise arrow factory withholds the fix',
        code: `
jest.mock('../FirestoreFetcher', () =>
  (() => {
    class FirestoreFetcherMock {
      public async fetch() {
        return [];
      }
    }
    return { FirestoreFetcher: FirestoreFetcherMock };
  })(),
);
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
        // the factory, so the factory guard does not apply here and the class
        // declaration inside it fixes like any other. Only `arguments[1]` is
        // out of reach.
        name: 'a class in the mock specifier position still fixes',
        code: `
jest.mock(
  resolveModule(() => {
    class Locator {
      public async path() {
        return './FirestoreFetcher';
      }
    }
    return Locator;
  }),
  () => ({}),
);
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
jest.mock(
  resolveModule(() => {
    class Locator {
      @Memoize()
      public async path() {
        return './FirestoreFetcher';
      }
    }
    return Locator;
  }),
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

// Issues #1735 and #1952: under `experimentalDecorators`, TypeScript accepts a
// member decorator only inside a class DECLARATION. Verified against tsc 5.0.3:
// the same `@Memoize()` method compiles inside `class C {}`, `export class C {}`
// and `export default class {}`, and is `TS1206: Decorators are not valid here.`
// inside `const C = class {}`, a class in argument position, or a class
// assigned to a property. Report and fix are both withheld for every expression
// form — the message's only remedy, "add @Memoize() above the method", cannot be
// written there — while every declaration form must keep reporting and fixing.
ruleTesterTs.run(
  'enforce-memoize-async: class expressions cannot carry decorators (issues #1735, #1952)',
  enforceMemoizeAsync,
  {
    valid: [
      // The exemptions that precede the report are unaffected: staying silent
      // must not turn a non-violation into one.
      {
        name: 'a decorated method in a class expression reports nothing',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';
const Loader = class {
  @Memoize()
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'a multi-parameter method in a class expression reports nothing',
        code: `
const Loader = class {
  public async load(collection: string, id: string) {
    return [collection, id];
  }
};
`,
      },
      // Every spelling of the shape. A member decorator is TS1206 in all of
      // them, so the rule has nothing writable to prescribe.
      {
        name: 'an anonymous class expression assigned to a const stays silent',
        code: `
const Loader = class {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        // A class expression's own name binds inside its body only, so it is
        // still an expression and still rejects the decorator.
        name: 'a named class expression stays silent',
        code: `
const Loader = class NamedLoader {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'an exported class expression stays silent',
        code: `
export const Loader = class {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'a class expression returned from a function declaration stays silent',
        code: `
export function build() {
  return class {
    public async load() {
      return 1;
    }
  };
}
`,
      },
      {
        name: 'a class expression as an arrow factory body stays silent',
        code: `
export const build = () =>
  class {
    public async load() {
      return 1;
    }
  };
`,
      },
      {
        name: 'a class expression held in an object property stays silent',
        code: `
const registry = {
  Loader: class {
    public async load() {
      return 1;
    }
  },
};
`,
      },
      {
        name: 'a class expression assigned to a member stays silent',
        code: `
registry.Loader = class {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'a class expression passed as a call argument stays silent',
        code: `
register(
  class Arg {
    public async load() {
      return 1;
    }
  },
);
`,
      },
      {
        name: 'a class expression in a default parameter stays silent',
        code: `
export function build(
  Loader = class {
    public async load() {
      return 1;
    }
  },
) {
  return Loader;
}
`,
      },
      {
        name: 'a class expression instantiated in place stays silent',
        code: `
const loader = new (class {
  public async load() {
    return 1;
  }
})();
`,
      },
      {
        name: 'a class expression held in a class property stays silent',
        code: `
export class Holder {
  static Loader = class {
    public async load() {
      return 1;
    }
  };
}
`,
      },
      {
        // `export default (class {})` is parenthesised into an expression,
        // unlike the anonymous declaration form.
        name: 'a parenthesised default-exported class expression stays silent',
        code: `
export default (class {
  public async load() {
    return 1;
  }
});
`,
      },
      {
        name: 'a class expression inside an array literal stays silent',
        code: `
const loaders = [
  class {
    public async load() {
      return 1;
    }
  },
];
`,
      },
      {
        name: 'a class expression extending a base stays silent',
        code: `
const Loader = class extends Base {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        // Another decorator already present changes nothing: @Memoize() beside
        // it is TS1206 too, so there is still no writable remedy.
        name: 'a class expression whose method carries another decorator stays silent',
        code: `
const Loader = class {
  @Log()
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'a single-parameter method in a class expression stays silent',
        code: `
const Loader = class {
  public async load(id: string) {
    return id;
  }
};
`,
      },
      {
        name: 'a private-named method in a class expression stays silent',
        code: `
const Loader = class {
  async #load() {
    return 1;
  }
};
`,
      },
      {
        // Both carve-outs apply at once; neither may leak a report.
        name: 'a class expression inside a jest.mock factory stays silent',
        code: `
jest.mock('../FirestoreFetcher', () => ({
  FirestoreFetcher: class {
    public async fetch() {
      return [];
    }
  },
}));
`,
      },
      {
        // The import carrier: a file whose only violation is unreportable must
        // stay completely silent, and must not gain an orphan import.
        name: 'a file whose only violation sits in a class expression stays silent',
        code: `
const Loader = class {
  public async load() {
    return 1;
  }
};

const Fetcher = class {
  public async fetch() {
    return 2;
  }
};
`,
      },
      {
        name: 'a class expression with an already-imported Memoize stays silent',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';

const Loader = class {
  public async load() {
    return 1;
  }
};
`,
      },
    ],
    invalid: [
      {
        // The controls: every declaration form is a legal decorator position
        // and must keep both report and fix.
        name: 'a plain class declaration still fixes',
        code: `
class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        name: 'an exported class declaration still fixes',
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
      {
        // An anonymous `export default class {}` is a DECLARATION despite
        // having no name, so it is a legal decorator position — the shape the
        // ClassExpression check is easiest to misclassify.
        name: 'an anonymous default-exported class declaration still fixes',
        code: `
export default class {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export default class {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a named default-exported class declaration still fixes',
        code: `
export default class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export default class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        // A declaration nested inside a function body is still a declaration.
        name: 'a class declaration inside a function still fixes',
        code: `
function build() {
  class Loader {
    public async load() {
      return 1;
    }
  }
  return Loader;
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
function build() {
  class Loader {
    @Memoize()
    public async load() {
      return 1;
    }
  }
  return Loader;
}
`,
      },
      {
        name: 'an abstract class declaration still fixes',
        code: `
abstract class Loader {
  public async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
abstract class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`,
      },
      {
        // The case an ancestor walk would get wrong: the INNER class is a
        // declaration, which takes decorators normally, even though every
        // ancestor of it sits inside a class expression.
        name: 'a class declaration nested in a class expression method still fixes',
        code: `
const Outer = class {
  public build() {
    class Inner {
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
};
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const Outer = class {
  public build() {
    class Inner {
      @Memoize()
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
};
`,
      },
      {
        name: 'a class declaration nested in a class expression property initializer still fixes',
        code: `
const Outer = class {
  build = () => {
    class Inner {
      public async load() {
        return 1;
      }
    }
    return Inner;
  };
};
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const Outer = class {
  build = () => {
    class Inner {
      @Memoize()
      public async load() {
        return 1;
      }
    }
    return Inner;
  };
};
`,
      },
      {
        // A class expression nested inside a class DECLARATION's method is the
        // mirror image, and stays silent while the outer declaration reports.
        name: 'an outer declaration reports while its nested class expression stays silent',
        code: `
class Outer {
  public async load() {
    const Inner = class {
      public async fetch() {
        return 2;
      }
    };
    return Inner;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
class Outer {
  @Memoize()
  public async load() {
    const Inner = class {
      public async fetch() {
        return 2;
      }
    };
    return Inner;
  }
}
`,
      },
      {
        // The import carrier, expression first: a silent class expression must
        // not consume the file's single `import { Memoize }`.
        name: 'a class expression before a declaration passes the import carrier on',
        code: `
const Anonymous = class {
  public async load() {
    return 1;
  }
};

export class Loader {
  public async fetch() {
    return 2;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const Anonymous = class {
  public async load() {
    return 1;
  }
};

export class Loader {
  @Memoize()
  public async fetch() {
    return 2;
  }
}
`,
      },
      {
        name: 'a class expression after a declaration leaves the carrier alone',
        code: `
export class Loader {
  public async fetch() {
    return 2;
  }
}

const Anonymous = class {
  public async load() {
    return 1;
  }
};
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  public async fetch() {
    return 2;
  }
}

const Anonymous = class {
  public async load() {
    return 1;
  }
};
`,
      },
      {
        name: 'two class expressions before a declaration still leave one import',
        code: `
const First = class {
  public async a() {
    return 1;
  }
};

const Second = class {
  public async b() {
    return 2;
  }
};

export class Loader {
  public async fetch() {
    return 3;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const First = class {
  public async a() {
    return 1;
  }
};

const Second = class {
  public async b() {
    return 2;
  }
};

export class Loader {
  @Memoize()
  public async fetch() {
    return 3;
  }
}
`,
      },
      {
        name: 'two class expressions sandwiching a declaration still leave one import',
        code: `
const First = class {
  public async a() {
    return 1;
  }
};

export class Loader {
  public async fetch() {
    return 3;
  }
}

const Second = class {
  public async b() {
    return 2;
  }
};
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
const First = class {
  public async a() {
    return 1;
  }
};

export class Loader {
  @Memoize()
  public async fetch() {
    return 3;
  }
}

const Second = class {
  public async b() {
    return 2;
  }
};
`,
      },
    ],
  },
);

// Issue #1953: the decorator attaches to the METHOD, not to the start of the
// line the method happens to sit on. Anchoring on the line emitted the
// decorator before `export class …` whenever the method was not first on its
// line — a single-line class body, a method sharing the class's opening line, a
// property declared ahead of it — decorating the CLASS with what is a METHOD
// decorator. The method stayed bare, so the rule reported it again on the next
// pass and `eslint --fix` stacked ten `@Memoize()` before hitting its pass cap,
// never reaching a fixpoint. The convergence describe block at the bottom of
// this file re-lints each output, which is the assertion a single-pass `output`
// cannot make.
ruleTesterTs.run(
  'enforce-memoize-async: decorator placement (issue #1953)',
  enforceMemoizeAsync,
  {
    valid: [
      {
        // The fixpoint of the single-line invalid case below, stated as a
        // fixture: whatever `--fix` writes there must be silent here, or the
        // rule cannot converge however the decorator is placed.
        name: 'a single-line method already carrying the decorator inline is silent',
        code: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() public async load() { return 1; } }`,
      },
      {
        name: 'a single-line method already carrying an aliased decorator inline is silent',
        code: `import { Memoize as Cache } from '@blumintinc/typescript-memoize';
export class Loader { @Cache() public async load() { return 1; } }`,
      },
      {
        name: 'a single-line method already carrying a namespaced decorator inline is silent',
        code: `import * as memoize from '@blumintinc/typescript-memoize';
export class Loader { @memoize.Memoize() public async load() { return 1; } }`,
      },
      {
        // The #1952 carve-out, in the spelling this issue is about: a
        // single-line class EXPRESSION admits no decorator anywhere, so the
        // placement fix must not reach it.
        name: 'a single-line class expression stays silent',
        code: `export const Loader = class { public async load() { return 1; } };`,
      },
      {
        name: 'a single-line named class expression stays silent',
        code: `export const Loader = class Inner { public async load() { return 1; } };`,
      },
      {
        // Withheld from this suite while it was written, because the rule still
        // reported here and moving the anchor was not the remedy: the decorator
        // is `TS1206: Decorators are not valid here.` on a private-named member
        // wherever it is placed. #1954 supplies the remedy — silence — so the
        // row belongs with the placement fixtures as a boundary the anchor must
        // never reach, alongside the class-expression rows above.
        name: 'a single-line private-named method stays silent',
        code: `export class Loader { async #load() { return 1; } }`,
      },
      {
        name: 'a private-named method sharing its line with a property stays silent',
        code: `export class Loader {
  private locked = 1; async #load() { return 1; }
}`,
      },
      {
        // A static method is out of scope for the rule entirely, so no anchor
        // is ever computed for it.
        name: 'a single-line static method is not reported',
        code: `export class Loader { public static async load() { return 1; } }`,
      },
      {
        name: 'a single-line synchronous method is not reported',
        code: `export class Loader { public load() { return 1; } }`,
      },
      {
        // The `Promise<void>` exemption is decided before the fix is built, so
        // the placement branch must not reach it on a shared line either.
        name: 'a single-line method declared to produce no value keeps its exemption',
        code: `export class Loader { public async load(): Promise<void> { return; } }`,
      },
      {
        name: 'a single-line method with two parameters is not reported',
        code: `export class Loader { public async load(a: string, b: string) { return a; } }`,
      },
    ],
    invalid: [
      // ------------------------------------------------------------------
      // The whole class on one line: the shape that produced ten stacked
      // decorators on the class.
      // ------------------------------------------------------------------
      {
        name: 'a single-line class body decorates the method, not the class',
        code: `export class Loader { public async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() public async load() { return 1; } }`,
      },
      {
        name: 'a single-line method without an accessibility modifier is decorated in place',
        code: `export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async load() { return 1; } }`,
      },
      {
        // The anchor is the method's first token, which is its modifier rather
        // than its key: a decorator emitted between `private` and `async` would
        // not parse.
        name: 'a private single-line method is decorated ahead of its modifier',
        code: `export class Loader { private async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() private async load() { return 1; } }`,
      },
      {
        name: 'a protected single-line method is decorated ahead of its modifier',
        code: `export class Loader { protected async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() protected async load() { return 1; } }`,
      },
      {
        name: 'an override modifier keeps the decorator ahead of it',
        code: `export class Loader extends Base { override async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader extends Base { @Memoize() override async load() { return 1; } }`,
      },
      // A `#private`-keyed method has no row here because it is not decorated
      // at all: #1954 withholds report and fix on a private-named member, whose
      // decorator is `TS1206: Decorators are not valid here.` under
      // `experimentalDecorators` in every placement. It sits in this suite's
      // `valid` list, as the boundary the anchor must never reach. The
      // string-literal and computed-key rows below carry what this issue is
      // about — that the anchor is the member's first token rather than its key
      // — and the string-literal one doubles as the proof that the carve-out
      // reads the key's node type rather than a `#` in its text.
      {
        name: 'a string-literal key on one line is decorated ahead of its modifier',
        code: `export class Loader { public async 'load'() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() public async 'load'() { return 1; } }`,
      },
      {
        name: 'a computed key on one line is decorated ahead of its modifier',
        code: `declare const key: string;
export class Loader { public async [key]() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const key: string;
export class Loader { @Memoize() public async [key]() { return 1; } }`,
      },
      {
        name: 'a single-line method taking one parameter is decorated in place',
        code: `export class Loader { public async load(id: string) { return id; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() public async load(id: string) { return id; } }`,
      },
      {
        name: 'a single-line abstract class decorates its concrete method in place',
        code: `export abstract class Loader { public async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export abstract class Loader { @Memoize() public async load() { return 1; } }`,
      },
      {
        // Two reports on one line: each edit is anchored on its own method, so
        // neither displaces the other.
        name: 'both methods of a single-line class are decorated exactly once each',
        code: `export class Loader { async a() { return 1; } async b() { return 2; } }`,
        errors: [
          { messageId: 'requireMemoize' as const },
          { messageId: 'requireMemoize' as const },
        ],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async a() { return 1; } @Memoize() async b() { return 2; } }`,
      },
      {
        name: 'a single-line class nested in a function is decorated in place',
        code: `export function build() {
  class Loader { async load() { return 1; } }
  return Loader;
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export function build() {
  class Loader { @Memoize() async load() { return 1; } }
  return Loader;
}`,
      },
      {
        // A #1952 boundary case: `export default class {}` is a DECLARATION, so
        // it keeps reporting and fixing, single-line included.
        name: 'a single-line default-exported class is decorated in place',
        code: `export default class { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export default class { @Memoize() async load() { return 1; } }`,
      },
      {
        // The other #1952 boundary: the enclosing class EXPRESSION admits no
        // decorator, while the single-line declaration inside its method takes
        // one inline.
        name: 'a single-line class declaration inside a class expression is decorated in place',
        code: `export const Outer = class {
  public build() {
    class Inner { async load() { return 1; } }
    return Inner;
  }
};`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export const Outer = class {
  public build() {
    class Inner { @Memoize() async load() { return 1; } }
    return Inner;
  }
};`,
      },
      {
        // A decorator the CLASS legitimately carries is exactly what the bug's
        // output looked like, so the fixed rule must leave it — and only it —
        // attached to the class.
        //
        // Every decorator factory these rows need is declared ambiently rather
        // than as `function Injectable(): ClassDecorator { … }`, which is the
        // spelling the older fixtures use. That spelling annotates an inferable
        // return, so `no-explicit-return-type` reports it, and the
        // `enforce-memoize-async::no-explicit-return-type` disagreement in
        // `crossrule-contradiction-closure` is signed off on an exact fixture
        // count. The declaration form is immaterial to the anchor under test,
        // so these rows take the spelling both rules accept and leave that
        // sign-off measuring what it was written for.
        name: 'a class-level decorator is left alone while the method takes its own',
        code: `declare const Injectable: () => ClassDecorator;
@Injectable()
export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Injectable: () => ClassDecorator;
@Injectable()
export class Loader { @Memoize() async load() { return 1; } }`,
      },
      {
        name: 'a single-line class reuses an existing Memoize import',
        code: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async load() { return 1; } }`,
      },
      {
        name: 'a single-line class under an aliased import decorates with the alias',
        code: `import { Memoize as Cache } from '@blumintinc/typescript-memoize';
export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize as Cache } from '@blumintinc/typescript-memoize';
export class Loader { @Cache() async load() { return 1; } }`,
      },
      {
        name: 'a single-line class under a namespace import decorates with the qualified name',
        code: `import * as memoize from '@blumintinc/typescript-memoize';
export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import * as memoize from '@blumintinc/typescript-memoize';
export class Loader { @memoize.Memoize() async load() { return 1; } }`,
      },
      {
        // The inline decorator and the import anchor are independent edits;
        // a directive prologue still keeps the import below it.
        name: "a single-line class under a 'use client' directive keeps the import below it",
        code: `'use client';
export class Loader { async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async load() { return 1; } }`,
      },
      // ------------------------------------------------------------------
      // Between the two extremes: the method shares its line with something,
      // but the class is not written on one line.
      // ------------------------------------------------------------------
      {
        name: 'a method sharing the class opening line rides inline while later methods keep their own line',
        code: `export class Loader { async load() { return 1; }
  async other() {
    return 2;
  }
}`,
        errors: [
          { messageId: 'requireMemoize' as const },
          { messageId: 'requireMemoize' as const },
        ],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async load() { return 1; }
  @Memoize()
  async other() {
    return 2;
  }
}`,
      },
      {
        name: 'a method sharing its line with an earlier property is decorated in place',
        code: `export class Loader {
  private locked = 1; async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  private locked = 1; @Memoize() async load() { return 1; }
}`,
      },
      {
        // The first method owns its line and keeps the historical layout; only
        // the second one, which has no line to take, rides inline.
        name: 'two methods sharing one line are decorated by their own anchors',
        code: `export class Loader {
  async a() { return 1; } async b() { return 2; }
}`,
        errors: [
          { messageId: 'requireMemoize' as const },
          { messageId: 'requireMemoize' as const },
        ],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async a() { return 1; } @Memoize() async b() { return 2; }
}`,
      },
      {
        name: 'a method whose line starts with a block comment keeps the comment in place',
        code: `export class Loader {
  /* lazy */ async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  /* lazy */ @Memoize() async load() { return 1; }
}`,
      },
      {
        // The method owns its line even though the class's `}` shares it, so
        // the historical own-line layout stands.
        name: 'a method sharing its line with the closing brace keeps its own line',
        code: `export class Loader {
  async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async load() { return 1; } }`,
      },
      // ------------------------------------------------------------------
      // The `node.decorators[0]` anchor path: an existing decorator, not the
      // method itself, is what the edit is measured against.
      // ------------------------------------------------------------------
      {
        name: 'an existing decorator that owns its line keeps the added decorator above it',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  @Log()
  async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  async load() { return 1; }
}`,
      },
      {
        // The decorator the author wrote inline is broken out with the added
        // one: a member wearing more than one decorator carries each on a line
        // of its own, so leaving it inline is a layout a formatter rewrites
        // (#2111).
        name: 'an existing decorator sharing the method line is broken out',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  @Log() async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  async load() { return 1; }
}`,
      },
      {
        name: 'an existing decorator sharing a line with earlier code takes the decorator inline',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1; @Log() async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1; @Memoize() @Log() async load() { return 1; }
}`,
      },
      {
        name: 'a single-line class with an existing decorator is decorated ahead of it',
        code: `declare const Log: () => MethodDecorator;
export class Loader { @Log() async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader { @Memoize() @Log() async load() { return 1; } }`,
      },
      // ------------------------------------------------------------------
      // The controls: a method that owns its line. Its output must be
      // byte-identical to what the rule emitted before this fix — that case
      // already converged, and the branch exists to leave it alone.
      // ------------------------------------------------------------------
      {
        name: 'a method that owns its line keeps the decorator on a line of its own',
        code: `export class Loader {
  public async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}`,
      },
      {
        name: 'a tab-indented method keeps its own indentation',
        code: 'export class Loader {\n\t\tasync load() { return 1; }\n}',
        errors: [{ messageId: 'requireMemoize' as const }],
        output:
          "import { Memoize } from '@blumintinc/typescript-memoize';\nexport class Loader {\n\t\t@Memoize()\n\t\tasync load() { return 1; }\n}",
      },
      {
        name: 'a method preceded by a line comment keeps the comment above the decorator',
        code: `export class Loader {
  // lazy
  async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  // lazy
  @Memoize()
  async load() { return 1; }
}`,
      },
      {
        // A method whose modifiers straddle a line break still owns the line it
        // starts on, so the historical layout stands.
        name: 'a method whose modifiers span lines keeps the indentation of its first line',
        code: `export class Loader {
  public
  async load() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  public
  @Memoize()
  async load() { return 1; }
}`,
      },
      // ------------------------------------------------------------------
      // Reports whose fix is declined: `output: null` asserts the decline,
      // where an omitted `output` would assert nothing at all.
      // ------------------------------------------------------------------
      {
        // The emitted `@Memoize()` would resolve to the parameter, so the fix
        // is withheld (#1423). The placement branch must not turn a declined
        // fix into an applied one.
        name: 'a single-line class reports without a fix when Memoize is shadowed',
        code: `export function build(Memoize) {
  class Loader { async load() { return 1; } }
  return Loader;
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
      {
        // A hoisted jest factory cannot reach a module-scope import (#1697), so
        // the fix is withheld there on a shared line too.
        name: 'a single-line class in a jest factory reports without a fix',
        filename: 'Service.test.ts',
        code: `jest.mock('../Fetcher', () => {
  class Mock { async fetch() { return []; } }
  return { Fetcher: Mock };
});`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: null,
      },
    ],
  },
);

// The real multi-pass fixer over the class-expression shapes: RuleTester runs a
// single pass and so cannot show the file `eslint --fix` writes.
describe('enforce-memoize-async: class expressions under --fix (issues #1735, #1952)', () => {
  const EXPRESSION_REPRO = `const Loader = class {
  public async load() {
    return 1;
  }
};
`;

  const DECLARATION_CONTROL = `class Loader {
  public async load() {
    return 1;
  }
}
`;

  const importCount = (output: string) =>
    output.match(
      /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
    )?.length ?? 0;

  it('leaves a class expression untouched across every pass', () => {
    const output = lint(EXPRESSION_REPRO);

    expect(output).toBe(EXPRESSION_REPRO);
    expect(output).not.toContain('Memoize');
  });

  it('withholds the report as well as the fix', () => {
    expect(lintMessages(EXPRESSION_REPRO)).toHaveLength(0);

    // The control proves the silence is the carve-out and not a dead fixture:
    // the same method inside a declaration reports, with a fix attached.
    const declared = lintMessages(DECLARATION_CONTROL);
    expect(declared).toHaveLength(1);
    expect(declared[0].ruleId).toBe(RULE_ID);
    expect(declared[0].fix).toBeDefined();
  });

  it('adds no import when every violation sits in a class expression', () => {
    const output = lint(`${EXPRESSION_REPRO}const Fetcher = class {
  public async fetch() {
    return 2;
  }
};
`);

    expect(output).not.toContain('@blumintinc/typescript-memoize');
    expect(output).not.toContain('@Memoize');
  });

  it('hands the import carrier to the declaration when the expression comes first', () => {
    const output = lint(`${EXPRESSION_REPRO}
export class Fetcher {
  public async fetch() {
    return 2;
  }
}
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`  @Memoize()
  public async fetch() {`);
    // The decorator landed on the declaration, never in the expression.
    expect(output).toContain(`const Loader = class {
  public async load() {`);
  });

  it('hands the import carrier to the declaration when the declaration comes first', () => {
    const output = lint(`export class Fetcher {
  public async fetch() {
    return 2;
  }
}

${EXPRESSION_REPRO}`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`const Loader = class {
  public async load() {`);
  });

  it('emits exactly one import with two class expressions and one declaration', () => {
    const output = lint(`${EXPRESSION_REPRO}const Fetcher = class {
  public async fetch() {
    return 2;
  }
};

export class Reader {
  public async read() {
    return 3;
  }
}
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`  @Memoize()
  public async read() {`);
  });

  it('never emits a decorator without its import', () => {
    const output = lint(`${EXPRESSION_REPRO}
export class Fetcher {
  public async fetch() {
    return 2;
  }
}
`);

    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  });

  it('decorates a class declaration nested inside a class expression method', () => {
    const output = lint(`const Outer = class {
  public build() {
    class Inner {
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
};
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`      @Memoize()
      public async load() {`);
  });
});

// Issue #1953: `RuleTester` applies a single fix pass, so an `output` fixture
// cannot tell a settled file from one the fixer will rewrite again. These cases
// run the real multi-pass fixer and assert the invariant the bug violated:
// re-linting the fixed output reports NOTHING and re-fixing it changes nothing,
// which is the only spelling that catches an even-length cycle as well as the
// pass-cap runaway the bug produced — ten `@Memoize()` stacked on the CLASS
// while the method the rule named stayed bare.
describe('enforce-memoize-async: the fix converges wherever the method sits (issue #1953)', () => {
  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts');

  /** `@Memoize()` immediately followed by a class opener is the bug's shape. */
  const DECORATED_CLASS =
    /@Memoize\(\)\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\b/;

  const expectConverges = (code: string, expectedDecorators: number) => {
    // A fixture that never parsed, or that the rule declined, would satisfy
    // every convergence assertion vacuously, so the run must be shown to report
    // and to rewrite its input first.
    expect(lintMessages(code).length).toBeGreaterThan(0);

    const first = fix(code);
    expect(first.fixed).toBe(true);

    // Re-running the fixer on its own output is the detector: comparing the two
    // strings would call an even-length cycle converged.
    expect(fix(first.output).fixed).toBe(false);
    expect(lintMessages(first.output)).toHaveLength(0);

    expect(first.output.match(/@Memoize\(\)/g)).toHaveLength(
      expectedDecorators,
    );
    expect(first.output).not.toMatch(DECORATED_CLASS);
    expect(
      first.output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);

    return first.output;
  };

  it('decorates the method of a single-line class exactly once', () => {
    const output = expectConverges(
      'export class Loader { public async load() { return 1; } }\n',
      1,
    );

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() public async load() { return 1; } }
`);
  });

  it('converges on the multi-line spelling without changing its layout', () => {
    // The control: this shape converged before the fix and its output must be
    // byte-identical afterwards, since the branch exists to leave it alone.
    const output = expectConverges(
      `export class Loader {
  public async load() {
    return 1;
  }
}
`,
      1,
    );

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  public async load() {
    return 1;
  }
}
`);
  });

  it('decorates each method of a single-line class exactly once', () => {
    const output = expectConverges(
      'export class Loader { async a() { return 1; } async b() { return 2; } }\n',
      2,
    );

    expect(output).toContain(
      'export class Loader { @Memoize() async a() { return 1; } @Memoize() async b() { return 2; } }',
    );
  });

  it('converges on a method that shares the class opening line', () => {
    const output = expectConverges(
      `export class Loader { async load() { return 1; }
  async other() {
    return 2;
  }
}
`,
      2,
    );

    expect(output).toContain(
      'export class Loader { @Memoize() async load() { return 1; }',
    );
    expect(output).toContain('  @Memoize()\n  async other()');
  });

  it('converges on a method that follows a property on its line', () => {
    const output = expectConverges(
      `export class Loader {
  private locked = 1; async load() { return 1; }
}
`,
      1,
    );

    expect(output).toContain(
      '  private locked = 1; @Memoize() async load() { return 1; }',
    );
  });

  it('converges through the existing-decorator anchor on a shared line', () => {
    const output = expectConverges(
      `declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1; @Log() async load() { return 1; }
}
`,
      1,
    );

    expect(output).toContain(
      '  private locked = 1; @Memoize() @Log() async load() { return 1; }',
    );
  });

  it('converges on a tab-indented method without touching its indentation', () => {
    const output = expectConverges(
      'export class Loader {\n\t\tasync load() { return 1; }\n}\n',
      1,
    );

    expect(output).toContain('\n\t\t@Memoize()\n\t\tasync load()');
  });

  it('converges on a single-line class nested in a function', () => {
    const output = expectConverges(
      `export function build() {
  class Loader { async load() { return 1; } }
  return Loader;
}
`,
      1,
    );

    expect(output).toContain(
      '  class Loader { @Memoize() async load() { return 1; } }',
    );
  });

  it('converges on a single-line default-exported class', () => {
    // A #1952 boundary: the declaration forms must keep reporting and fixing,
    // and a single-line one must converge like any other.
    const output = expectConverges(
      'export default class { async load() { return 1; } }\n',
      1,
    );

    expect(output).toContain(
      'export default class { @Memoize() async load() { return 1; } }',
    );
  });

  it('converges on a single-line declaration nested in a class expression', () => {
    // The other #1952 boundary: the enclosing expression stays bare while the
    // declaration inside it takes the decorator inline.
    const output = expectConverges(
      `export const Outer = class {
  public build() {
    class Inner { async load() { return 1; } }
    return Inner;
  }
};
`,
      1,
    );

    expect(output).toContain(
      '    class Inner { @Memoize() async load() { return 1; } }',
    );
    expect(output).toContain('export const Outer = class {\n  public build()');
  });

  it('emits nothing for a shared line whose reports are all disabled inline', () => {
    // `eslint-disable-next-line` covers the whole line, so both methods of a
    // shared line are suppressed by one directive: neither decorator is written
    // and — the #1404 invariant — no import is left behind for a decorator that
    // never appeared. Placing the decorator inline must not smuggle an edit
    // past a suppression.
    const code = `export class Loader {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  async a() { return 1; } async b() { return 2; }
}
`;

    const first = fix(code);

    expect(first.fixed).toBe(false);
    expect(first.output).toBe(code);
    expect(first.output).not.toContain('typescript-memoize');
  });

  it('decorates the surviving methods when only one of a group is disabled', () => {
    const output = fix(`export class Loader {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  async a() { return 1; }
  async b() { return 2; } async c() { return 3; }
}
`);

    expect(output.output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  // eslint-disable-next-line @blumintinc/blumint/enforce-memoize-async
  async a() { return 1; }
  @Memoize()
  async b() { return 2; } @Memoize() async c() { return 3; }
}
`);
    // The disabled method keeps reporting nothing, so the file has settled even
    // though one violation remains unfixed by design.
    expect(fix(output.output).fixed).toBe(false);
  });

  it('leaves a single-line class expression byte-for-byte alone (negative control)', () => {
    // The #1952 carve-out, restated where a placement regression would show up
    // first: an assertion set that only counted decorators would be satisfied
    // by silence, so this shape is pinned as unchanged rather than as settled.
    const code =
      'export const Loader = class { public async load() { return 1; } };\n';

    expect(lintMessages(code)).toHaveLength(0);
    expect(fix(code).fixed).toBe(false);
    expect(fix(code).output).toBe(code);
  });

  it('leaves a declined single-line fix unapplied and still reported', () => {
    // A shadowed `Memoize` withholds the fix (#1423). The file never settles
    // clean, so `expectConverges` cannot be used: what is asserted instead is
    // that no text was written at all.
    const code = `export function build(Memoize) {
  class Loader { async load() { return 1; } }
  return Loader;
}
`;

    expect(lintMessages(code)).toHaveLength(1);
    expect(fix(code).fixed).toBe(false);
    expect(fix(code).output).toBe(code);
  });

  it('would have caught the bug: the pre-fix output leaves the method reported', () => {
    // Exactly what the line-start anchor wrote on its first pass. Every
    // assertion `expectConverges` makes fails on it — the method is still
    // reported, so a re-lint is not clean and another decorator is appended —
    // which is what makes the assertions above non-vacuous.
    const preFixOutput = `import { Memoize } from '@blumintinc/typescript-memoize';
@Memoize()
export class Loader { public async load() { return 1; } }
`;

    expect(lintMessages(preFixOutput)).toHaveLength(1);
    expect(preFixOutput).toMatch(DECORATED_CLASS);

    const refixed = fix(preFixOutput);
    expect(refixed.fixed).toBe(true);
    expect(refixed.output.match(/@Memoize\(\)/g)).toHaveLength(2);
  });
});

// Issue #1954: under `experimentalDecorators` — the mode this plugin's
// `@Memoize()` is written for — TypeScript rejects a decorator on a member with
// a PRIVATE NAME: `TS1206: Decorators are not valid here.`, measured against the
// repo's tsc 5.0.3, for the own-line spelling exactly as for the inline one. The
// rule reported such a method and `--fix` wrote the decorator in, turning a
// clean build into a broken one. Report and fix are both withheld, the way
// `enforce-memoize-getters` withholds them (#1945): the message's only remedy,
// "add @Memoize() above the method", is unwritable there, and a report naming an
// edit its reader cannot make is worse than silence. Nothing is lost by it — a
// `#private` member is unnameable outside its class, so an author who wants the
// cache can reach it through the `private` modifier.
//
// The restriction is on the private NAME and not on privacy: `private async
// load()` is a legal decorator position and keeps both report and fix. That
// contrast is what the invalid rows pin.
ruleTesterTs.run(
  'enforce-memoize-async: private-named methods (issue #1954)',
  enforceMemoizeAsync,
  {
    valid: [
      {
        name: 'a private-named method stays silent',
        code: `
export class Loader {
  async #load() {
    return 1;
  }
}
`,
      },
      {
        // Static members are out of scope before the name is read, so this row
        // pins the silence rather than the carve-out — a later change that
        // narrowed the static skip must not make a TS1206 shape reportable.
        name: 'a static private-named method stays silent',
        code: `
export class Loader {
  static async #load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a private-named method taking one parameter stays silent',
        code: `
export class Loader {
  async #load(id: string) {
    return id;
  }
}
`,
      },
      {
        name: 'a private-named method with two parameters stays silent',
        code: `
export class Loader {
  async #load(collection: string, id: string) {
    return [collection, id];
  }
}
`,
      },
      {
        name: 'a private-named method on a single-line class body stays silent',
        code: `export class Loader { async #load() { return 1; } }`,
      },
      {
        // The #1953 anchor shape: a member that shares its line takes the
        // decorator inline, which is TS1206 here just as the own-line spelling
        // is, so the placement branch must never be reached.
        name: 'a private-named method following a property on one line stays silent',
        code: `export class Loader {
  private locked = 1; async #load() { return 1; }
}`,
      },
      {
        name: 'a private-named method sharing the class opening line stays silent',
        code: `export class Loader { async #load() { return 1; }
}`,
      },
      {
        name: 'a private-named method in a default-exported class stays silent',
        code: `
export default class {
  async #load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a private-named method in an abstract class stays silent',
        code: `
export abstract class Loader {
  async #load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a private-named method in a class nested in a function stays silent',
        code: `
export function build() {
  class Loader {
    async #load() {
      return 1;
    }
  }
  return Loader;
}
`,
      },
      {
        name: 'a private-named method in a class extending a base stays silent',
        code: `
export class Loader extends Base {
  async #load() {
    return 1;
  }
}
`,
      },
      {
        // Both carve-outs at once — private name inside a class expression —
        // and neither may leak a report.
        name: 'a private-named method in a class expression stays silent under both carve-outs',
        code: `
export const Loader = class Inner {
  async #load() {
    return 1;
  }
};
`,
      },
      {
        name: 'a private-named method inside a jest.mock factory stays silent',
        filename: 'Service.test.ts',
        code: `
jest.mock('../Fetcher', () => {
  class Mock {
    async #fetch() {
      return [];
    }
  }
  return { Fetcher: Mock };
});
`,
      },
      {
        // A decorator the author already wrote is itself TS1206 on this member,
        // so its presence changes nothing: there is still no writable remedy.
        name: 'a private-named method already carrying another decorator stays silent',
        code: `
declare const Log: () => MethodDecorator;
export class Loader {
  @Log()
  async #load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a private-named method already carrying @Memoize() stays silent',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async #load() {
    return 1;
  }
}
`,
      },
      {
        // The import is already there, so a leaked report would emit a
        // decorator with nothing else to give it away.
        name: 'a private-named method in a file that already imports Memoize stays silent',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';

export class Loader {
  async #load() {
    return 1;
  }
}
`,
      },
      {
        // The exemptions that precede the report are unaffected: staying silent
        // must not turn a non-violation into one.
        name: 'a private-named method declared to produce no value stays silent',
        code: `
export class Loader {
  async #load(): Promise<void> {
    return;
  }
}
`,
      },
      {
        name: 'a private-named method keyed by a callback stays silent',
        code: `
export class Loader {
  async #load(onDone: () => void) {
    onDone();
    return 1;
  }
}
`,
      },
      {
        name: 'a private-named async generator stays silent',
        code: `
export class Loader {
  async *#load() {
    yield 1;
  }
}
`,
      },
      {
        // The import carrier: a file whose only violations are unreportable
        // must stay completely silent, and must not gain an orphan import.
        name: 'a file whose only violations are private-named methods stays silent',
        code: `
export class Loader {
  async #load() {
    return 1;
  }

  async #fetch() {
    return 2;
  }
}
`,
      },
      {
        name: 'a private-named method beside an already-decorated public method stays silent',
        code: `
import { Memoize } from '@blumintinc/typescript-memoize';

export class Loader {
  async #load() {
    return 1;
  }

  @Memoize()
  public async fetch() {
    return 2;
  }
}
`,
      },
      {
        // No violation survives to carry an import, so the directive prologue
        // must be left exactly as written.
        name: "a private-named method under a 'use client' directive stays silent",
        code: `'use client';
export class Loader { async #load() { return 1; } }`,
      },
      {
        name: 'a private-named method beside a private-named property stays silent',
        code: `
export class Loader {
  #cache = 1;

  async #load() {
    return this.#cache;
  }
}
`,
      },
    ],
    invalid: [
      // ------------------------------------------------------------------
      // The contrast the carve-out is about: privacy expressed as a MODIFIER
      // is a legal decorator position, so every one of these keeps reporting
      // and fixing.
      // ------------------------------------------------------------------
      {
        name: 'a private-modifier method still reports and fixes',
        code: `
export class Loader {
  private async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  private async load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a protected method still reports and fixes',
        code: `
export class Loader {
  protected async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  protected async load() {
    return 1;
  }
}
`,
      },
      {
        name: 'a public method still reports and fixes',
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
      {
        name: 'a method with no accessibility modifier still reports and fixes',
        code: `
export class Loader {
  async load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async load() {
    return 1;
  }
}
`,
      },
      {
        // The #1953 spelling of the same contrast: the modifier form takes the
        // decorator inline on a shared line, where the private-named form is
        // silent.
        name: 'a single-line private-modifier method still fixes inline',
        code: `export class Loader { private async load() { return 1; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() private async load() { return 1; } }`,
      },
      {
        // The carve-out reads the key's NODE TYPE, not a `#` in its text: a
        // string-literal key spelled `'#load'` is an ordinary member name and a
        // legal decorator position (measured clean against tsc 5.0.3).
        name: 'a string-literal key spelled like a private name still fixes',
        code: `export class Loader {
  async '#load'() { return 1; }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async '#load'() { return 1; }
}`,
      },
      {
        // A private-named FIELD is a `PropertyDefinition`, which the visitor
        // never sees; it must not exempt the method beside it.
        name: 'a private-named property does not exempt the public method beside it',
        code: `
export class Loader {
  #cache = 1;

  public async load() {
    return this.#cache;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  #cache = 1;

  @Memoize()
  public async load() {
    return this.#cache;
  }
}
`,
      },
      // ------------------------------------------------------------------
      // The import carrier: a private-named method never reports, so it can
      // never claim the file's single `import { Memoize }`. Both orders, since
      // the carrier is claimed by whichever violation the traversal reaches
      // first.
      // ------------------------------------------------------------------
      {
        name: 'a private-named method before a public one passes the import carrier on',
        code: `
export class Loader {
  async #load() {
    return 1;
  }

  public async fetch() {
    return 2;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  async #load() {
    return 1;
  }

  @Memoize()
  public async fetch() {
    return 2;
  }
}
`,
      },
      {
        name: 'a private-named method after a public one leaves the carrier alone',
        code: `
export class Loader {
  public async fetch() {
    return 2;
  }

  async #load() {
    return 1;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  public async fetch() {
    return 2;
  }

  async #load() {
    return 1;
  }
}
`,
      },
      {
        name: 'two private-named methods leave a single import to the one public method',
        code: `
export class Loader {
  async #load() {
    return 1;
  }

  async #warm() {
    return 2;
  }

  public async fetch() {
    return 3;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  async #load() {
    return 1;
  }

  async #warm() {
    return 2;
  }

  @Memoize()
  public async fetch() {
    return 3;
  }
}
`,
      },
      {
        name: 'a private-named method in one class leaves the import to another class',
        code: `
export class Loader {
  async #load() {
    return 1;
  }
}

export class Fetcher {
  public async fetch() {
    return 2;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  async #load() {
    return 1;
  }
}

export class Fetcher {
  @Memoize()
  public async fetch() {
    return 2;
  }
}
`,
      },
      {
        // A private-named method sharing a line with a reportable one: only the
        // reportable member's own anchor is used, so the silent neighbour's
        // text is untouched.
        name: 'a public method sharing a line with a private-named one is decorated in place',
        code: `export class Loader { async #load() { return 1; } async fetch() { return 2; } }`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { async #load() { return 1; } @Memoize() async fetch() { return 2; } }`,
      },
      {
        // The mirror of the #1952 nesting row: a private-named method in the
        // outer class stays silent while the inner declaration's public method
        // reports.
        name: 'a class nested inside a private-named method still fixes',
        code: `
export class Outer {
  async #build() {
    class Inner {
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
}
`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `
import { Memoize } from '@blumintinc/typescript-memoize';
export class Outer {
  async #build() {
    class Inner {
      @Memoize()
      public async load() {
        return 1;
      }
    }
    return Inner;
  }
}
`,
      },
    ],
  },
);

// Issue #1954: `RuleTester` applies a single fix pass and never shows the file
// `eslint --fix` writes. These cases run the real multi-pass fixer and assert
// the invariants the bug violated: a private-named method survives every pass
// undecorated, and the file it sits in gains an `import { Memoize }` only when
// some other violation actually takes the decorator.
describe('enforce-memoize-async: private-named methods under --fix (issue #1954)', () => {
  const PRIVATE_REPRO = `export class Loader {
  async #load() {
    return 1;
  }
}
`;

  const MODIFIER_CONTROL = `export class Loader {
  private async load() {
    return 1;
  }
}
`;

  const importCount = (output: string) =>
    output.match(
      /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
    )?.length ?? 0;

  it('leaves a private-named method untouched across every pass', () => {
    const output = lint(PRIVATE_REPRO);

    expect(output).toBe(PRIVATE_REPRO);
    expect(output).not.toContain('Memoize');
  });

  it('withholds the report as well as the fix', () => {
    expect(lintMessages(PRIVATE_REPRO)).toHaveLength(0);

    // The control proves the silence is the carve-out and not a dead fixture:
    // the same method behind the `private` MODIFIER reports, with a fix
    // attached, and that spelling compiles.
    const declared = lintMessages(MODIFIER_CONTROL);
    expect(declared).toHaveLength(1);
    expect(declared[0].ruleId).toBe(RULE_ID);
    expect(declared[0].fix).toBeDefined();
  });

  it('adds no import when every violation is private-named', () => {
    const output = lint(`export class Loader {
  async #load() {
    return 1;
  }

  async #fetch() {
    return 2;
  }
}
`);

    expect(output).not.toContain('@blumintinc/typescript-memoize');
    expect(output).not.toContain('@Memoize');
  });

  it('hands the import carrier to the public method when the private-named one comes first', () => {
    const output = lint(`export class Loader {
  async #load() {
    return 1;
  }

  public async fetch() {
    return 2;
  }
}
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`  @Memoize()
  public async fetch() {`);
    // The decorator landed on the public method, never on the private-named
    // one.
    expect(output).toContain(`  async #load() {
    return 1;
  }`);
  });

  it('hands the import carrier to the public method when the public one comes first', () => {
    const output = lint(`export class Loader {
  public async fetch() {
    return 2;
  }

  async #load() {
    return 1;
  }
}
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`  async #load() {
    return 1;
  }`);
  });

  it('emits exactly one import with two private-named methods and one public method', () => {
    const output = lint(`export class Loader {
  async #load() {
    return 1;
  }

  async #warm() {
    return 2;
  }

  public async fetch() {
    return 3;
  }
}
`);

    expect(importCount(output)).toBe(1);
    expect(output.match(/@Memoize\(\)/g)).toHaveLength(1);
    expect(output).toContain(`  @Memoize()
  public async fetch() {`);
  });

  it('never emits a decorator without its import', () => {
    const output = lint(`export class Loader {
  async #load() {
    return 1;
  }

  public async fetch() {
    return 2;
  }
}
`);

    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  });

  it('converges on a mixed file, leaving the private-named method bare', () => {
    const code = `export class Loader {
  async #load() {
    return 1;
  }

  public async fetch() {
    return 2;
  }
}
`;
    const first = createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts');

    expect(first.fixed).toBe(true);
    // Re-fixing the output is the convergence detector: comparing strings would
    // call an even-length cycle converged.
    expect(
      createLinter().verifyAndFix(first.output, LINT_CONFIG, 'Service.ts')
        .fixed,
    ).toBe(false);
    expect(lintMessages(first.output)).toHaveLength(0);
    expect(first.output.match(/@Memoize\(\)/g)).toHaveLength(1);
  });

  it('would have caught the bug: the pre-fix output decorates the private-named method', () => {
    // Exactly what the rule wrote before the carve-out. It is a fixpoint — the
    // rule reports nothing on it now — so only a text assertion catches it,
    // which is what makes the silence assertions above non-vacuous. The
    // compile guard below is what proves this text does not build.
    const preFixOutput = `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async #load() {
    return 1;
  }
}
`;

    expect(lint(PRIVATE_REPRO)).not.toBe(preFixOutput);
    expect(lint(PRIVATE_REPRO)).not.toContain('@Memoize()');
  });
});

// Issue #1954: the private-name carve-out is a claim about the COMPILER, and no
// ESLint-level assertion can check it. `RuleTester` never type-checks, and the
// private-named cases above are `valid`, so they produce no fix pair for
// `fixer-type-safety` to compile — the whole suite would stay green with the
// carve-out removed and `--fix` emitting TS1206 again. These cases compile each
// shape under a real `ts.Program` with `experimentalDecorators: true` and assert
// differentially: the fixed text must carry no diagnostic its input did not
// already carry. An absolute count would only measure how many globals `noLib`
// leaves undefined.
describe('enforce-memoize-async: `--fix` leaves every member name compiling (issue #1954)', () => {
  const FILENAME = '/memoize/Service.ts';
  const MEMOIZE_STUB = '/memoize/typescript-memoize.d.ts';
  const MEMOIZE_STUB_TEXT =
    'export declare function Memoize(...args: unknown[]): MethodDecorator;\n';

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

  /**
   * `noLib` keeps each program to two source files, which is what makes a
   * per-shape compile affordable here; the globals it leaves undefined cost the
   * same diagnostics (TS2318 for `Promise`) on the input and the output alike,
   * so they cancel in the differential. The memoize package resolves to an
   * in-memory stub so that the import the fixer injects cannot manufacture a
   * TS2307 the input lacked and mask the diagnostic actually under test.
   */
  const compilerOptions: ts.CompilerOptions = {
    experimentalDecorators: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    noLib: true,
    types: [],
    // `tsconfig.json` and the consumer's build set both, and a fix that STRANDS
    // a binding is invisible without them (#2234). Safe here only because the
    // oracle below is a DIFFERENTIAL: an input's own unused local appears on
    // both sides and cancels.
    noUnusedLocals: true,
    noUnusedParameters: true,
  };

  const diagnosticsOf = (source: string): string[] => {
    const files = new Map<string, string>([
      [FILENAME, source],
      [MEMOIZE_STUB, MEMOIZE_STUB_TEXT],
    ]);
    const sourceFiles = new Map(
      [...files].map(([name, text]) => [
        name,
        ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true),
      ]),
    );
    const host: ts.CompilerHost = {
      getSourceFile: (name) => sourceFiles.get(name),
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => undefined,
      getCurrentDirectory: () => '/memoize',
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (name) => files.has(name),
      readFile: (name) => files.get(name),
      resolveModuleNames: (moduleNames) =>
        moduleNames.map((name) =>
          name === '@blumintinc/typescript-memoize' ||
          name === 'typescript-memoize'
            ? {
                resolvedFileName: MEMOIZE_STUB,
                extension: ts.Extension.Dts,
                isExternalLibraryImport: true,
              }
            : undefined,
        ),
    };
    const program = ts.createProgram([FILENAME], compilerOptions, host);
    const file = program.getSourceFile(FILENAME);
    if (!file) {
      throw new Error('the source under test is missing from the program');
    }
    // TS1206 is a grammar check the CHECKER runs, so it reaches neither
    // `getSyntacticDiagnostics` nor a `transpileModule` round trip; reading
    // both buckets is what makes it visible.
    return [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ].map((diagnostic) => `TS${diagnostic.code}`);
  };

  const introducedBy = (before: string, after: string): string[] => {
    const carried = diagnosticsOf(before);
    return diagnosticsOf(after).filter((code, index, all) => {
      const seenBefore = carried.filter((entry) => entry === code).length;
      const seenHere = all.slice(0, index + 1).filter((e) => e === code).length;
      return seenHere > seenBefore;
    });
  };

  it('proves the premise: a decorator on a private-named member is TS1206', () => {
    // The harness itself needs a control, or a compile step that silently saw
    // nothing would certify every shape below as clean. Written by hand, the
    // very edit the fixer used to make is rejected — while the same decorator
    // on the same method behind the `private` MODIFIER is accepted, which is
    // the whole distinction the carve-out draws.
    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async #load() { return 1; }
}
`),
    ).toContain('TS1206');

    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  private async load() { return 1; }
}
`),
    ).not.toContain('TS1206');

    // The inline spelling is rejected too, so no placement of the decorator
    // could have made the report writable.
    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader { @Memoize() async #load() { return 1; } }
`),
    ).toContain('TS1206');
  });

  // Spelled out rather than composed from a shared body: a mismatched brace
  // would make the fixture a parse error, and an unparseable fixture reports
  // nothing — which is indistinguishable from the silence under test. The
  // `verify` assertion below counts the parse error too, so this cannot pass
  // vacuously.
  const PRIVATE_NAMES: [string, string][] = [
    [
      'on its own line',
      'export class Loader {\n  async #load() {\n    return 1;\n  }\n}\n',
    ],
    [
      'on a single line',
      'export class Loader { async #load() { return 1; } }\n',
    ],
    [
      'following a property on one line',
      'export class Loader {\n  private locked = 1; async #load() { return 1; }\n}\n',
    ],
    [
      'taking one parameter',
      'export class Loader {\n  async #load(id: string) {\n    return id;\n  }\n}\n',
    ],
    [
      'beside a private-named field',
      'export class Loader {\n  #cache = 1;\n  async #load() {\n    return this.#cache;\n  }\n}\n',
    ],
    [
      'in a default-exported class',
      'export default class {\n  async #load() {\n    return 1;\n  }\n}\n',
    ],
    [
      'in a class nested in a function',
      'export function build() {\n  class Loader {\n    async #load() {\n      return 1;\n    }\n  }\n  return Loader;\n}\n',
    ],
    [
      'in an abstract class',
      'export abstract class Loader {\n  async #load() {\n    return 1;\n  }\n}\n',
    ],
  ];

  it.each(PRIVATE_NAMES)(
    'a private-named method %s is silent and left byte-for-byte alone',
    (_name, code) => {
      expect(createLinter().verify(code, LINT_CONFIG, FILENAME)).toHaveLength(
        0,
      );

      const first = fix(code);

      expect(first.fixed).toBe(false);
      expect(first.output).toBe(code);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  const DECORATABLE_NAMES: [string, string][] = [
    [
      'a private-modifier method',
      'export class Loader {\n  private async load() {\n    return 1;\n  }\n}\n',
    ],
    [
      'a protected method',
      'export class Loader {\n  protected async load() {\n    return 1;\n  }\n}\n',
    ],
    [
      'a public method',
      'export class Loader {\n  public async load() {\n    return 1;\n  }\n}\n',
    ],
    [
      'a single-line private-modifier method',
      'export class Loader { private async load() { return 1; } }\n',
    ],
    [
      'a string-literal key spelled like a private name',
      "export class Loader {\n  async '#load'() {\n    return 1;\n  }\n}\n",
    ],
    [
      'a public method beside a private-named one',
      'export class Loader {\n  async #load() {\n    return 1;\n  }\n  public async fetch() {\n    return 2;\n  }\n}\n',
    ],
  ];

  it.each(DECORATABLE_NAMES)(
    '%s is still decorated, converges, and still compiles',
    (_name, code) => {
      const first = fix(code);

      expect(first.fixed).toBe(true);
      expect(first.output).toContain('@Memoize()');
      // Re-running the fixer on its own output is the convergence detector:
      // comparing the two strings would call an even-length cycle converged.
      expect(fix(first.output).fixed).toBe(false);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  it('would have caught the bug: the pre-fix edit introduces TS1206', () => {
    // The mutation this guard exists to detect, applied by hand: had the rule
    // kept decorating a private-named method, `introducedBy` would have
    // returned exactly this, so the assertions above are not vacuous.
    const before = `export class Loader {
  async #load() {
    return 1;
  }
}
`;
    const after = `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async #load() {
    return 1;
  }
}
`;

    /**
     * TS6133 rides along with TS1206 under the `noUnusedLocals` the programs
     * here run with (#2234): a decorator TypeScript rejects is not a USE, so
     * the import the pre-fix edit injects is stranded as well as misplaced.
     * Sorted, because the two arrive in either order.
     */
    expect(introducedBy(before, after).sort()).toEqual(['TS1206', 'TS6133']);
  });
});

// Issue #2111: a member carrying a SINGLE decorator may keep it on the member's
// own line, and prettier preserves that layout. Adding a second decorator
// withdraws the choice — with more than one, prettier puts each on a line of its
// own and the member on the next. So `@Memoize()` emitted above a decorator the
// author wrote inline leaves `@Log() async load() {` for prettier to break, and
// agora formats with prettier beside `eslint --fix`: the diff never settles and
// every file the fixer touches churns. The fixer breaks the run out itself.
ruleTesterTs.run(
  'enforce-memoize-async: a decorator written inline (issue #2111)',
  enforceMemoizeAsync,
  {
    valid: [
      {
        // The fixpoint of the first invalid case below, stated as a fixture:
        // what `--fix` writes there has to be silent here.
        name: 'a member already carrying the decorator on a broken-out run is silent',
        code: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  async load() {
    return 1;
  }
}`,
      },
      {
        // A run the rule never wrote — one the author left inline — is still
        // silent: the break-out rides on a report, and this member has none.
        name: 'a member already carrying the decorator inline with another is silent',
        code: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize() @Log() async load() {
    return 1;
  }
}`,
      },
    ],
    invalid: [
      {
        // The dump's shape. A member wearing one decorator may keep it on the
        // member's own line; a second withdraws that choice, so the inline one
        // has to be broken out or the formatter does it on its next run.
        name: 'a decorator written inline is broken out once a second joins it',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  @Log() async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'a property ahead of the member does not change the break',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1;
  @Log() async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1;
  @Memoize()
  @Log()
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'a run of two inline decorators is broken out entirely',
        code: `declare const Log: () => MethodDecorator;
declare const Trace: () => MethodDecorator;
export class Loader {
  @Log() @Trace() async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
declare const Trace: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  @Trace()
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'the break lands after a comment trailing the decorator',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  @Log() /* hot path */ async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log() /* hot path */
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'a decorator carrying arguments is broken out like any other',
        code: `declare const Log: (level: string) => MethodDecorator;
export class Loader {
  @Log('debug') async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: (level: string) => MethodDecorator;
export class Loader {
  @Memoize()
  @Log('debug')
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'an overlong member keeps every decorator on a line of its own',
        code: `declare const Log: () => MethodDecorator;
declare const Trace: () => MethodDecorator;
export class Loader {
  @Log() @Trace() async loadTournamentParticipantRegistrationRosters() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
declare const Trace: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  @Trace()
  async loadTournamentParticipantRegistrationRosters() {
    return 1;
  }
}`,
      },
      {
        name: 'a run already on its own lines keeps the historical layout',
        code: `declare const Log: () => MethodDecorator;
export class Loader {
  @Log()
  async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
declare const Log: () => MethodDecorator;
export class Loader {
  @Memoize()
  @Log()
  async load() {
    return 1;
  }
}`,
      },
      {
        name: 'a member with no decorator at all keeps the historical layout',
        code: `export class Loader {
  async load() {
    return 1;
  }
}`,
        errors: [{ messageId: 'requireMemoize' as const }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Loader {
  @Memoize()
  async load() {
    return 1;
  }
}`,
      },
    ],
  },
);

describe('enforce-memoize-async: the emitted decorator run is one a formatter keeps (issue #2111)', () => {
  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, 'Service.ts');

  const OWN_LINE_DECORATOR = /^[ \t]*@[\w.]+\([^)]*\)[ \t]*$/;
  const DECORATOR_THEN_REST = /^[ \t]*@[\w.]+\([^)]*\)(.*)$/;

  /**
   * What a decorator's line holds past the decorator, with comments removed. A
   * comment stays WITH the decorator it trails, so a line ending in one is
   * still a decorator's own line rather than a shared one.
   */
  const pastTheDecorator = (rest: string) =>
    rest
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/, '')
      .trim();

  /**
   * Lines holding a decorator that stands on a line of its own directly above a
   * decorator still sharing its line with the member. Prettier prints no run
   * that way — more than one decorator means one per line — so this is the
   * churn shape, and it is exactly what the rule emitted before the fix.
   */
  const churnedRunLines = (output: string) => {
    const lines = output.split('\n');
    return lines.filter((line, index) => {
      if (!OWN_LINE_DECORATOR.test(line)) {
        return false;
      }
      const next = lines[index + 1];
      const rest = next?.match(DECORATOR_THEN_REST)?.[1];
      return rest !== undefined && pastTheDecorator(rest) !== '';
    });
  };

  const expectFormatterStableRun = (code: string) => {
    // A fixture the rule declined, or one that never parsed, would satisfy
    // every layout assertion below vacuously.
    expect(lintMessages(code).length).toBeGreaterThan(0);
    const fixed = fix(code);
    expect(fixed.fixed).toBe(true);
    expect(fixed.output).toContain('@Memoize()');

    expect(churnedRunLines(fixed.output)).toEqual([]);

    // The fixer reaching its own fixpoint is what makes the layout claim worth
    // anything: a second pass that rewrote the output would churn on its own.
    expect(fix(fixed.output).fixed).toBe(false);
    return fixed.output;
  };

  it('detects the pre-fix layout it is asked to rule out (positive control)', () => {
    // Without this, an oracle that matched nothing at all would pass every case
    // below while asserting nothing.
    expect(
      churnedRunLines(`export class Loader {
  @Memoize()
  @Log() async load() {
    return 1;
  }
}
`),
    ).toHaveLength(1);
  });

  it('passes the layouts a formatter does print (negative control)', () => {
    // Both renderings prettier emits have to read clean, or the oracle would
    // reject the fix as readily as the bug.
    expect(
      churnedRunLines(`export class Loader {
  @Memoize() @Log() async load() {
    return 1;
  }
}
`),
    ).toEqual([]);
    expect(
      churnedRunLines(`export class Loader {
  @Memoize()
  @Log()
  async load() {
    return 1;
  }
}
`),
    ).toEqual([]);
    // A comment trailing the decorator leaves its line a decorator's own line,
    // which is the rendering prettier prints for a broken-out run carrying one.
    expect(
      churnedRunLines(`export class Loader {
  @Memoize()
  @Log() /* hot path */
  async load() {
    return 1;
  }
}
`),
    ).toEqual([]);
  });

  it('breaks out a decorator the author wrote inline', () => {
    const output =
      expectFormatterStableRun(`declare const Log: () => MethodDecorator;
export class Loader {
  @Log() async load() {
    return 1;
  }
}
`);

    expect(output).toContain(`  @Memoize()
  @Log()
  async load() {`);
  });

  it('breaks a run of two inline decorators onto three lines', () => {
    const output =
      expectFormatterStableRun(`declare const Log: () => MethodDecorator;
declare const Trace: () => MethodDecorator;
export class Loader {
  @Log() @Trace() async load() {
    return 1;
  }
}
`);

    expect(output).toContain(`  @Memoize()
  @Log()
  @Trace()
  async load() {`);
  });

  it('breaks after a comment trailing the decorator, never over it', () => {
    const output =
      expectFormatterStableRun(`declare const Log: () => MethodDecorator;
export class Loader {
  @Log() /* hot path */ async load() {
    return 1;
  }
}
`);

    expect(output).toContain(`  @Memoize()
  @Log() /* hot path */
  async load() {`);
  });

  it('leaves a run that already stands on its own lines alone', () => {
    const output =
      expectFormatterStableRun(`declare const Log: () => MethodDecorator;
export class Loader {
  @Log()
  async load() {
    return 1;
  }
}
`);

    expect(output).toContain(`  @Memoize()
  @Log()
  async load() {`);
  });

  it('leaves a member sharing its line with earlier code inline', () => {
    // The `ownsItsLine` carve-out: there is no line for the run to take, and a
    // formatter reflows that whole body regardless.
    const output =
      expectFormatterStableRun(`declare const Log: () => MethodDecorator;
export class Loader {
  private locked = 1; @Log() async load() { return 1; }
}
`);

    expect(output).toContain(
      '  private locked = 1; @Memoize() @Log() async load() { return 1; }',
    );
  });
});
