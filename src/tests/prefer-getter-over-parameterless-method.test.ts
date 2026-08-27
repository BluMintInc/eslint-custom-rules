import { preferGetterOverParameterlessMethod } from '../rules/prefer-getter-over-parameterless-method';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'prefer-getter-over-parameterless-method',
  preferGetterOverParameterlessMethod,
  {
    valid: [
      // Async methods are actions by default
      `
      class UserService {
        async fetchUser() {
          return this.api.get('/user');
        }
      }
      `,

      // Methods with parameters stay as methods
      `
      class Calculator {
        sum(a: number, b: number) {
          return a + b;
        }
      }
      `,

      // Void return methods are treated as actions
      `
      class Logger {
        log() {
          console.log('log');
        }
      }
      `,

      // Abstract methods are ignored by default
      `
      abstract class BaseParser {
        abstract parse(): string;
      }
      `,

      // `ignoreAbstract` can only decide anything for an abstract method that
      // HAS a body: the `!node.value.body` backstop sits immediately after the
      // check and drops every bodiless one. `tsc` rejects an abstract method
      // with an implementation (TS1245) yet the shape parses cleanly, which is
      // why no ordinary fixture reaches the option. `true` (the default)
      // suppresses the report the `false` case below asserts.
      // The name must not be `parse` — that is in DEFAULT_IGNORED_METHODS and
      // would swallow the report regardless of this option.
      {
        code: `
        abstract class BaseParser {
          abstract getValue(): string {
            return 'value';
          }
        }
        `,
        options: [{ ignoreAbstract: true }],
      },

      // `ignoredMethods` replaces DEFAULT_IGNORED_METHODS wholesale, so the
      // exempted name must be one the defaults do NOT already cover — otherwise
      // the case passes without the option doing any work. `renderSummary`
      // reports by default (see the matching invalid case on identical code).
      {
        code: `
        class Report {
          renderSummary(): string {
            return this.title;
          }
        }
        `,
        options: [{ ignoredMethods: ['renderSummary'] }],
      },

      // `factoryMethods` exempts builder terminals whose external callers would
      // break on conversion. DEFAULT_FACTORY_METHODS matches the exact names
      // `build`/`create`/`make`, never a prefixed name like `buildQuery`, so
      // this fixture only goes silent because the option names it.
      {
        code: `
        class QueryBuilder {
          buildQuery(): string {
            return this.clauses.join(' ');
          }
        }
        `,
        options: [{ factoryMethods: ['buildQuery'] }],
      },

      // `respectJsDocSideEffects: true` (the default) honours the `@sideEffect`
      // tag. Stated explicitly here to pair with the `false` invalid case on
      // byte-identical code.
      {
        code: `
        class Metrics {
          /**
           * @sideEffect records a page view
           */
          getViewCount(): number {
            return this.views;
          }
        }
        `,
        options: [{ respectJsDocSideEffects: true }],
      },

      // Ignored methods list
      `
      class Serializer {
        toString() {
          return 'value';
        }
      }
      `,

      // JSDoc side-effect opt-out
      `
      class Counter {
        /**
         * @sideEffect updates metrics
         */
        increment() {
          return this.count++;
        }
      }
      `,

      // The remedy `preferGetterSideEffect` prescribes must actually clear the
      // report (#1568): the message previously advised "keep it as a method",
      // which is the code as written, so a developer following it kept the
      // error. These two pair byte-for-byte with the `getNextId` invalid case
      // below — the only difference is the JSDoc tag the message names.
      `
      class Counter {
        /**
         * @sideEffect increments internal counter
         */
        getNextId() {
          return ++this.count;
        }
      }
      `,
      `
      class Counter {
        /**
         * @mutates this.count
         */
        getNextId() {
          return ++this.count;
        }
      }
      `,

      // Optional methods cannot become getters
      `
      class Maybe {
        optional?() {
          return 1;
        }
      }
      `,

      // Methods with type parameters are skipped
      `
      class Identity {
        map<T>(value: T): T {
          return value;
        }
      }
      `,

      // Overload signatures keep the implementation as a method
      `
      class Overloaded {
        value(input: string): string;
        value(input: number): number;
        value(input: string | number) {
          return String(input);
        }
      }
      `,

      // Existing getter remains valid
      `
      class Profile {
        get displayName() {
          return 'name';
        }
      }
      `,

      // Override methods are left alone
      `
      class Child extends Parent {
        override serialize() {
          return super.serialize();
        }
      }
      `,

      // Minimum body lines gating
      {
        code: `
        class Info {
          brief() {
            return this.value;
          }
        }
        `,
        options: [{ minBodyLines: 3 }],
      },
      // Void-annotated methods stay as methods even when ignoreVoidReturn is false
      {
        code: `
        class VoidReturn {
          result(): void {
            return;
          }
        }
        `,
        options: [{ ignoreVoidReturn: false }],
      },

      // Throwing methods are assertions/commands, not computed properties.
      {
        code: `
          class ParticipantsFactory {
            private get participants() {
              return [1, 2, 3];
            }
            private shuffleParticipants() {
              const shuffled = [...this.participants];
              if (shuffled.length < 2) {
                throw new Error('Not enough participants');
              }
              return shuffled;
            }
          }
        `,
      },

      // Builder/factory terminal methods are imperative actions (issue #990 #4).
      {
        code: `
          class WidgetFactory {
            private get parts() {
              return [1, 2, 3];
            }
            public build() {
              return this.parts;
            }
          }
        `,
      },

      // Method that throws conditionally — still an action, must be exempt.
      {
        code: `
          class Guard {
            private value = 0;
            validate() {
              if (this.value < 0) {
                throw new Error('negative value');
              }
              return this.value;
            }
          }
        `,
      },

      // Method that throws via a non-Error constructor (HttpsError) — still exempt.
      {
        code: `
          class Tournament {
            private participants = [1, 2, 3];
            seedOrderedParticipants() {
              if (this.participants.length < 2) {
                throw new HttpsError('failed-precondition', 'Too few participants');
              }
              return [...this.participants].sort();
            }
          }
        `,
      },

      // create() and make() are factory terminals — must be exempt.
      {
        code: `
          class InstanceFactory {
            private config = { x: 1 };
            create() {
              return this.config;
            }
          }
        `,
      },
      {
        code: `
          class Builder {
            private data = [1];
            make() {
              return this.data;
            }
          }
        `,
      },

      // A throw that is ONLY inside a nested callback does NOT count as a
      // top-level throw — but this method still has no body mutations and
      // returns a value, so it IS a getter candidate and is tested as invalid below.
      // (This valid case shows a throw inside an arrow that is not top-level.)
      // NOTE: the nested-throw method IS invalid (flagged) — see invalid section.

      // Issue #1684 reproducer: the heritage type declares `count` as a METHOD,
      // so `get count()` is TS2416 ("Type 'number' is not assignable to type
      // '() => number'"). The rule's only remedy would not compile.
      `
      export interface Countable { count(): number; }
      export class Counter implements Countable {
        public count(): number { return 1; }
      }
      `,

      // A same-file type alias is as binding as an interface.
      `
      type Countable = { count(): number };
      class Counter implements Countable {
        public count(): number { return 1; }
      }
      `,

      // A function-typed member of the contract binds too: a getter returning
      // the function's result is not assignable to the function type.
      `
      interface Handler { handle: () => number; }
      class Handled implements Handler {
        public handle(): number { return 1; }
      }
      `,

      // Concrete implementation of an abstract member declared in a same-file
      // base class. `ignoreAbstract` only ever skipped the abstract
      // DECLARATION; the implementation is equally unconvertible.
      `
      abstract class BaseProcessor {
        protected abstract computeStatus(): number;
      }
      class UserStatusProcessor extends BaseProcessor {
        protected computeStatus(): number { return 1; }
      }
      `,

      // The abstract declaration may sit several links up the extends chain.
      `
      abstract class Root { protected abstract deriveKey(): string; }
      abstract class Middle extends Root {}
      class Leaf extends Middle {
        protected deriveKey(): string { return 'k'; }
      }
      `,

      // An IMPORTED interface is unknowable from this file, so no method of the
      // class can be proven convertible — the whole class is skipped. This is
      // agora's DocumentSnapshotAdapter shape, whose contract lives in a
      // third-party .d.ts and therefore has no remedy at all.
      `
      import { DocumentSnapshot } from '@google-cloud/firestore';
      export class DocumentSnapshotAdapter implements DocumentSnapshot {
        public data(): number { return 1; }
        public getMetadata(): string { return 'm'; }
      }
      `,

      // Likewise for an imported base class.
      `
      import { BaseAdapter } from './BaseAdapter';
      export class ChildAdapter extends BaseAdapter {
        public computeValue(): number { return 1; }
      }
      `,

      // A same-file interface that itself extends an imported one is only
      // partially knowable, so the class is skipped wholesale.
      `
      import { RemoteContract } from './remote';
      interface LocalContract extends RemoteContract {
        local(): number;
      }
      class Local implements LocalContract {
        public local(): number { return 1; }
        public getExtra(): number { return 2; }
      }
      `,

      // A mixin base is an expression, not a resolvable declaration.
      `
      class Mixed extends withLogging(Base) {
        public computeValue(): number { return 1; }
      }
      `,

      // Mutually recursive interfaces resolve without looping.
      `
      interface Alpha extends Beta { alpha(): number; }
      interface Beta extends Alpha { beta(): number; }
      class Both implements Alpha {
        public alpha(): number { return 1; }
        public beta(): number { return 2; }
      }
      `,

      // An ECMA private name is the same privacy as the `private` modifier and
      // mutually exclusive with it (`private #foo` is TS18010), so `#foo` is
      // analyzed like any other member — every exemption that silences a
      // `private` method must silence its `#` spelling too.

      // Already a getter: nothing to convert.
      `
      class Fingerprinter {
        get #fingerprint(): string { return 'x'; }
        describe(prefix: string): string { return prefix + this.#fingerprint; }
      }
      `,

      // Parameters keep it a method.
      `
      class Fingerprinter {
        #computeFingerprint(salt: string): string { return salt; }
      }
      `,

      // Void return is an action.
      `
      class Fingerprinter {
        #computeFingerprint(): void { this.log('x'); }
      }
      `,

      // Async is an action by default.
      `
      class Fingerprinter {
        async #computeFingerprint(): Promise<string> { return 'x'; }
      }
      `,

      // A top-level throw makes it an imperative assertion, not a property.
      `
      class Fingerprinter {
        #computeFingerprint(): string { throw new Error('nope'); }
      }
      `,

      // A `@sideEffect` tag is honored on the `#` spelling too.
      `
      class Fingerprinter {
        #hits = 0;
        /**
         * @sideEffect increments the hit counter
         */
        #computeFingerprint(): number { return ++this.#hits; }
      }
      `,

      // `ignoredMethods` matches the bare name, sigil aside.
      {
        code: `
        class Fingerprinter {
          #serialize(): string { return 'x'; }
        }
        `,
        options: [{ ignoredMethods: ['serialize'] }],
      },

      // A `#` implementation that accompanies overload signatures cannot become
      // a getter, so it is skipped entirely rather than reported without a fix.
      `
      class Fingerprinter {
        #computeFingerprint(): string;
        #computeFingerprint(): string { return 'x'; }
      }
      `,

      // A generator is never a property read.
      `
      class Fingerprinter {
        *#computeParts(): Generator<string> { yield 'x'; }
      }
      `,

      /** Explicit Promise return annotation, no async keyword. */
      `
      class A {
        fetchToken(): Promise<string> {
          return Promise.resolve('x');
        }
      }
      `,
      /** Promise returned through a call, no annotation and no async keyword. */
      `
      class Session {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.evaluate();
        }
      }
      `,
      /** PromiseLike, which is thenable without being a Promise. */
      `
      class D {
        load(): PromiseLike<number> {
          return Promise.resolve(1);
        }
      }
      `,
      /** The private shape the autofix currently rewrites into a getter. */
      `
      class E {
        private readEpoch(): Promise<string> {
          return Promise.resolve('x');
        }
      }
      `,

      // A qualified thenable name is the same type: the rightmost segment is
      // what names it.
      `
      class Qualified {
        fetchToken(): globalThis.Promise<string> {
          return Promise.resolve('x');
        }
      }
      `,
      `
      class Vendored {
        fetchToken(): bluebird.Promise<string> {
          return Promise.resolve('x');
        }
      }
      `,

      // A container holding a thenable is still awaited at the call site.
      `
      class Optional {
        fetchToken(): Promise<string> | undefined {
          return Promise.resolve('x');
        }
      }
      `,
      `
      class Branded {
        fetchToken(): Promise<string> & { tag: 'token' } {
          return Promise.resolve('x') as Promise<string> & { tag: 'token' };
        }
      }
      `,

      // Body route: every `Promise` static producer, with no annotation.
      `
      class Producers {
        fetchAll() {
          return Promise.all([Promise.resolve(1)]);
        }
      }
      `,
      `
      class Settled {
        fetchSettled() {
          return Promise.allSettled([Promise.resolve(1)]);
        }
      }
      `,
      `
      class Raced {
        fetchFirst() {
          return Promise.race([Promise.resolve(1)]);
        }
      }
      `,
      `
      class Anyed {
        fetchAny() {
          return Promise.any([Promise.resolve(1)]);
        }
      }
      `,
      `
      class Rejected {
        fetchFailure() {
          return Promise.reject(new Error('nope'));
        }
      }
      `,
      `
      class QualifiedProducer {
        fetchToken() {
          return globalThis.Promise.resolve('x');
        }
      }
      `,

      // Body route: a `.then`/`.catch`/`.finally` chain is thenable by
      // definition.
      `
      class Chained {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.evaluate().then((value) => value.length);
        }
      }
      `,
      `
      class Recovered {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.evaluate().catch(() => 'fallback');
        }
      }
      `,

      // Body route: the sibling is an `async` method carrying no annotation.
      `
      class AsyncSibling {
        private async evaluate() { return 'x'; }
        readEpoch() {
          return this.evaluate();
        }
      }
      `,

      // Body route: the sibling is an ECMA-private promise-returning method.
      `
      class EcmaPrivateSibling {
        #evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.#evaluate();
        }
      }
      `,

      // Body route: the sibling is a promise-valued FIELD, read without a call.
      `
      class PendingField {
        private pending: Promise<string> = Promise.resolve('x');
        readEpoch() {
          return this.pending;
        }
      }
      `,

      // Body route: the sibling is a function-valued field, called.
      `
      class ArrowSibling {
        private evaluate = async () => 'x';
        readEpoch() {
          return this.evaluate();
        }
      }
      `,
      `
      class TypedArrowSibling {
        private evaluate!: () => Promise<string>;
        readEpoch() {
          return this.evaluate();
        }
      }
      `,

      // Body route: the sibling is a promise-returning getter, read as one.
      `
      class GetterSibling {
        private get pending(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.pending;
        }
      }
      `,

      // Body route: combinators that pass a value straight through.
      `
      class Asserted {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.evaluate() as Promise<string>;
        }
      }
      `,
      `
      class Coalesced {
        private cached?: Promise<string>;
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.cached ?? this.evaluate();
        }
      }
      `,
      `
      class Branched {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return this.ready ? this.evaluate() : Promise.resolve('x');
        }
      }
      `,

      // The sibling carries NO annotation, so its own body has to be read. This
      // is the shape `eslint --fix` leaves behind after `no-explicit-return-type`
      // strips `: Promise<string>` off the sibling: an exemption only an
      // annotation can carry does not survive the config's own fixers.
      `
      class StrippedSibling {
        private evaluate() { return Promise.resolve('x'); }
        readEpoch() {
          return this.evaluate();
        }
      }
      `,
      `
      class StrippedGetterSibling {
        private get pending() { return Promise.resolve('x'); }
        readEpoch() {
          return this.pending;
        }
      }
      `,

      // An un-annotated promise-valued field is thenable on its own evidence.
      `
      class UntypedPendingField {
        private pending = Promise.resolve('x');
        readEpoch() {
          return this.pending;
        }
      }
      `,

      // The resolution chains: neither hop carries an annotation.
      `
      class TwoHops {
        private evaluate() { return Promise.resolve('x'); }
        private relay() { return this.evaluate(); }
        readEpoch() {
          return this.relay();
        }
      }
      `,

      // An optional call is a ChainExpression wrapping the call, so the chain
      // wrapper has to be unwrapped before the callee can be read.
      `
      class OptionallyChained {
        private evaluate?: () => Promise<string>;
        readEpoch() {
          return this.evaluate?.();
        }
      }
      `,

      // `await` in the returned position means the method hands back a promise.
      // TypeScript rejects the missing `async` keyword (TS1308) while the parser
      // still yields an `AwaitExpression`, and treating a half-written method as
      // asynchronous is the safe reading: the alternative prescribes a getter
      // rewrite the moment the keyword is typed.
      `
      class HalfWritten {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          return await this.evaluate();
        }
      }
      `,

      // Only ONE returned expression has to be thenable for the method to hand
      // back a promise.
      `
      class MixedReturns {
        private evaluate(): Promise<string> { return Promise.resolve('x'); }
        readEpoch() {
          if (this.ready) {
            return 'cached';
          }
          return this.evaluate();
        }
      }
      `,
    ],
    invalid: [
      {
        code: `
        class User {
          public fullName() {
            return this.first + this.last;
          }
        }
        `,
        // `public` method: external `instance.fullName()` callers may live in
        // other files, so the autofix is withheld. Report is kept.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'fullName', suggestedName: 'fullName' },
          },
        ],
      },
      {
        code: `
        class Person {
          getName() {
            return this.name;
          }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getName', suggestedName: 'name' },
          },
        ],
      },
      {
        code: `
        class Previewer {
          public buildPreview() {
            return { value: 1 } as const;
          }
        }
        `,
        // `public` method: autofix withheld (external callers unverifiable).
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'buildPreview', suggestedName: 'preview' },
          },
        ],
      },
      {
        code: `
        class Validator {
          isValid() {
            return true;
          }
        }
        `,
        // Unspecified accessibility (public by default): autofix withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'isValid', suggestedName: 'isValid' },
          },
        ],
      },
      {
        code: `
        class MathUtils {
          public static computePi() {
            return 3.14;
          }
        }
        `,
        // `public static` method: autofix withheld (external callers unverifiable).
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computePi', suggestedName: 'pi' },
          },
        ],
      },
      {
        code: `
        class Parser {
          result(): ParseResult {
            return this.doParse();
          }
        }
        `,
        // Unspecified accessibility: autofix withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'result', suggestedName: 'result' },
          },
        ],
      },
      {
        code: `
        class Counter {
          getNextId() {
            return ++this.count;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'getNextId',
              suggestedName: 'nextId',
              reason: 'it mutates state with ++/--',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class Mutator {
          updateValue() {
            this.value = this.value + 1;
            return this.value;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'updateValue',
              suggestedName: 'updateValue',
              reason: 'it assigns to this.value',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class Basket {
          items() {
            this.values.push('item');
            return this.values.length;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'items',
              suggestedName: 'items',
              reason: 'it calls mutating method push()',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class Buffer {
          refill() {
            return this.values.fill('x');
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'refill',
              suggestedName: 'refill',
              reason: 'it calls mutating method fill()',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class Tracker {
          count() {
            const next = ++this.counter;
            return next;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'count',
              suggestedName: 'count',
              reason: 'it mutates state with ++/--',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class Snapshotter {
          /**
           * @returns immutable snapshot without side effects
           */
          snapshot() {
            return this.state.clone();
          }
        }
        `,
        // Unspecified accessibility: autofix withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'snapshot', suggestedName: 'snapshot' },
          },
        ],
      },
      {
        code: `
        class Reporter {
          summary() {
            const title = this.title;
            return title;
          }
        }
        `,
        options: [{ minBodyLines: 1 }],
        // Unspecified accessibility: autofix withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'summary', suggestedName: 'summary' },
          },
        ],
      },
      {
        code: `
        class Account {
          getBalance() {
            return this.balance;
          }
        }
        `,
        options: [{ stripPrefixes: ['get', 'fetch'] }],
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getBalance', suggestedName: 'balance' },
          },
        ],
      },
      {
        code: `
        class TitleCase {
          URL() {
            return this.url;
          }
        }
        `,
        // Unspecified accessibility: autofix withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'URL', suggestedName: 'URL' },
          },
        ],
      },
      {
        code: `
        class Reporter {
          name() {
            return this.display;
          }

          describe() {
            return this.name();
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'name', suggestedName: 'name' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'describe', suggestedName: 'describe' },
          },
        ],
        // Both methods have unspecified accessibility: `name` is also call-used
        // in-file, and `describe` is public-by-default, so neither is autofixed.
        output: null,
      },
      {
        code: `
        class Worker {
          getResult() {
            return this.value;
          }

          bindResult() {
            return this.getResult.bind(this);
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getResult', suggestedName: 'result' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'bindResult', suggestedName: 'bindResult' },
          },
        ],
        // Unspecified accessibility on both: `getResult` is call-used via
        // `.bind`, and `bindResult` is public-by-default, so no autofix.
        output: null,
      },
      {
        code: `
        class UserProfile {
          name = 'alex';

          getName() {
            return this.name;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getName', suggestedName: 'name' },
          },
        ],
        output: null,
      },
      {
        code: `
        class MixedAccess {
          static value = 1;
          private _value = 2;

          getValue() {
            return this._value + MixedAccess.value;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
        ],
        // `getValue` has unspecified accessibility (public by default): withheld.
        output: null,
      },
      {
        code: `
        class Example {
          data() {
            return [1, 2, 3];
          }

          lengthHint() {
            return this.data.length;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'data', suggestedName: 'data' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'lengthHint', suggestedName: 'lengthHint' },
          },
        ],
        // Both methods have unspecified accessibility (public by default): withheld.
        output: null,
      },
      {
        code: `
        class OutsideCall {
          getValue() {
            return 1;
          }
        }

        const instance = new OutsideCall();
        instance.getValue();
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
        ],
        output: null,
      },
      {
        code: `
        class WithSetter {
          private _name = 'x';

          set name(value: string) {
            this._name = value;
          }

          getName() {
            return this._name;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getName', suggestedName: 'name' },
          },
        ],
        // `getName` has unspecified accessibility (public by default): withheld.
        output: null,
      },
      {
        code: `
        class StaticVsInstance {
          count = 3;

          static getCount() {
            return 10;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getCount', suggestedName: 'count' },
          },
        ],
        // `getCount` has unspecified accessibility (public by default): withheld.
        output: null,
      },
      {
        code: `
        class Caller {
          value() {
            return this.result;
          }

          invoke() {
            return this.value.apply(this);
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'value', suggestedName: 'value' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'invoke', suggestedName: 'invoke' },
          },
        ],
        // Unspecified accessibility on both: `value` is call-used via `.apply`,
        // and `invoke` is public-by-default, so neither is autofixed.
        output: null,
      },
      {
        code: `
        class Storer {
          getValue() {
            return this.value;
          }

          keep() {
            const fn = this.getValue;
            return fn();
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'keep', suggestedName: 'keep' },
          },
        ],
        // Unspecified accessibility on both: `getValue` is referenced in-file,
        // and `keep` is public-by-default, so neither is autofixed.
        output: null,
      },
      {
        code: `
        class Container {
          getValue() {
            return this.value;
          }

          callValue() {
            const { getValue } = this;
            return getValue();
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'callValue', suggestedName: 'callValue' },
          },
        ],
        // Unspecified accessibility on both: `getValue` is destructured in-file,
        // and `callValue` is public-by-default, so neither is autofixed.
        output: null,
      },
      {
        code: `
        class CallableName {
          call() {
            return this.value;
          }

          use() {
            return this.call();
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'call', suggestedName: 'call' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'use', suggestedName: 'use' },
          },
        ],
        // Unspecified accessibility on both: `call` is call-used in-file, and
        // `use` is public-by-default, so neither is autofixed.
        output: null,
      },
      {
        code: `
        class First {
          getValue() {
            return this.value;
          }

          consume(value: number) {
            return this.getValue() + value;
          }
        }

        class Second {
          getValue() {
            return 2;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
        ],
        output: null,
      },
      {
        code: `
        class Duo {
          getName() {
            return this.primary;
          }

          fetchName() {
            return this.secondary;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getName', suggestedName: 'name' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'fetchName', suggestedName: 'name' },
          },
        ],
        output: null,
      },
      {
        code: `
        class AsyncExample {
          async value() {
            return this.total;
          }
        }
        `,
        options: [{ ignoreAsync: false }],
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'value', suggestedName: 'value' },
          },
        ],
        output: null,
      },
      {
        code: `
        class Cleaner {
          remove() {
            delete this.cache;
            return 1;
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'remove',
              suggestedName: 'remove',
              reason: 'it deletes this.cache',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class MapUser {
          getEntry() {
            return this.map.set('k', 1);
          }
        }
        `,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: 'getEntry',
              suggestedName: 'entry',
              reason: 'it calls mutating method set()',
            },
          },
        ],
        output: null,
      },
      {
        code: `
        class CallbackUser {
          getValue() {
            return 1;
          }
        }

        const instance = new CallbackUser();
        consume(instance.getValue);
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
        ],
        output: null,
      },
      {
        code: `
        class OptionalRef {
          fetchValue() {
            return 2;
          }
        }

        const inst = new OptionalRef();
        const fn = inst?.fetchValue;
        `,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'fetchValue', suggestedName: 'value' },
          },
        ],
        output: null,
      },

      // A pure parameterless method with unspecified accessibility (public by
      // default): the report fires, but the autofix is withheld because
      // external `instance.getFullName()` callers may live in other files.
      {
        code: `
        class NameHolder {
          private first = 'Jane';
          private last = 'Doe';
          getFullName() {
            return this.first + ' ' + this.last;
          }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getFullName', suggestedName: 'fullName' },
          },
        ],
      },

      // A throw that lives only inside a nested arrow callback does NOT count
      // as a top-level throw, so the method is still a getter candidate and the
      // report fires. But `processItems` has unspecified accessibility (public
      // by default), so the autofix is withheld.
      {
        code: `
        class Processor {
          private items = [1, 2, 3];
          processItems() {
            return this.items.map((item) => {
              if (item < 0) {
                throw new Error('negative');
              }
              return item * 2;
            });
          }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'processItems', suggestedName: 'processItems' },
          },
        ],
      },

      {
        /**
         * Public method of an exported class. Its call sites may live in other
         * files the single-file rule cannot see, so the fixer MUST NOT convert
         * it to a getter — that silently breaks every `instance.compose()`
         * caller. Report is allowed; autofix must be withheld.
         */
        code: [
          'export class OverlayAlertComposer {',
          '  public compose(): string | undefined {',
          "    return 'x';",
          '  }',
          '}',
        ].join('\n'),
        output: null, // fix must be WITHHELD (no `get compose()` rewrite)
        errors: [{ messageId: 'preferGetter' }],
      },

      // Protected method: still API surface reachable from subclasses in other
      // files, so the fixer must be withheld. Report is kept.
      {
        code: [
          'export class ProtectedHolder {',
          "  protected foo(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // Unspecified accessibility (public by default) on an exported class with
      // no in-file caller. The rule cannot prove there are no external callers,
      // so the fixer is withheld. Report is kept.
      {
        code: [
          'export class UnspecifiedHolder {',
          "  bar(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // `ignoreAbstract: false` opts the abstract-with-body shape back in (see
      // the matching valid case for why that shape is the only one the option
      // can change). Unspecified accessibility: autofix withheld.
      {
        code: `
        abstract class BaseParser {
          abstract getValue(): string {
            return 'value';
          }
        }
        `,
        options: [{ ignoreAbstract: false }],
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getValue', suggestedName: 'value' },
          },
        ],
      },

      // Each of the next three pairs with a valid case above on identical code;
      // the option is the only difference. Unspecified accessibility means the
      // autofix is withheld, hence `output: null`.

      // `ignoredMethods` omitted → `renderSummary` reports.
      {
        code: `
        class Report {
          renderSummary(): string {
            return this.title;
          }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'renderSummary', suggestedName: 'renderSummary' },
          },
        ],
      },

      // `factoryMethods` omitted → `buildQuery` reports (the `build` prefix is
      // stripped to suggest `query`, proving the default factory list matches
      // whole names only).
      {
        code: `
        class QueryBuilder {
          buildQuery(): string {
            return this.clauses.join(' ');
          }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'buildQuery', suggestedName: 'query' },
          },
        ],
      },

      // `respectJsDocSideEffects: false` opts the `@sideEffect`-tagged method
      // back in. Without the tag on the fixture the flag would have nothing to
      // respect and the case would pass either way.
      {
        code: `
        class Metrics {
          /**
           * @sideEffect records a page view
           */
          getViewCount(): number {
            return this.views;
          }
        }
        `,
        options: [{ respectJsDocSideEffects: false }],
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getViewCount', suggestedName: 'viewCount' },
          },
        ],
      },

      // A genuinely `private` parameterless method with no in-file caller is
      // safe to convert: its call sites cannot live outside the class, so the
      // fixer STILL fires. This guards against over-withholding.
      {
        code: [
          'class Foo {',
          "  private compute(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Foo {',
          "  private get compute(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'compute', suggestedName: 'compute' },
          },
        ],
      },

      // A class with NO heritage clause keeps the pre-#1684 behaviour: the
      // control the heritage exemption must not silence.
      {
        code: `
        class Counter {
          public count(): number { return 1; }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'count', suggestedName: 'count' },
          },
        ],
      },

      // When every heritage reference resolves in-file the skip is PER METHOD:
      // `count` is contract-bound and silent, but `getExtra` is the class's own
      // invention, so it still reports — and, being `private`, is still fixed.
      {
        code: [
          'interface Countable { count(): number; }',
          'class Counter implements Countable {',
          '  public count(): number { return 1; }',
          '  private getExtra(): number { return 2; }',
          '}',
        ].join('\n'),
        output: [
          'interface Countable { count(): number; }',
          'class Counter implements Countable {',
          '  public count(): number { return 1; }',
          '  private get extra(): number { return 2; }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getExtra', suggestedName: 'extra' },
          },
        ],
      },

      // A method a same-file base class does not declare is unconstrained.
      {
        code: `
        class BaseReporter {
          public summarize(): string { return 'base'; }
        }
        class DetailReporter extends BaseReporter {
          public detail(): string { return 'detail'; }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'summarize', suggestedName: 'summarize' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'detail', suggestedName: 'detail' },
          },
        ],
      },

      // An `implements` clause constrains only the instance side, so a STATIC
      // method sharing a contract member's name keeps reporting.
      {
        code: `
        interface Countable { count(): number; }
        class Counter implements Countable {
          public count(): number { return 1; }
          public static count(): number { return 2; }
        }
        `,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'count', suggestedName: 'count' },
          },
        ],
      },

      // An ECMA private name is the strongest privacy the language offers —
      // strictly stronger than the erased `private` modifier, since `#foo` is
      // unreachable outside the class body at runtime — so it is both reported
      // and auto-fixed, and the emitted getter keeps its `#`.
      {
        code: [
          'class Fingerprinter {',
          "  #compute(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          "  get #compute(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: '#compute', suggestedName: '#compute' },
          },
        ],
      },

      // The prefix is stripped from the `#` name exactly as from a plain one.
      {
        code: [
          'class Fingerprinter {',
          "  #computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          "  get #fingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // Isolation control for the case above: renaming the member while KEEPING
      // the `private` modifier does not move the verdict, so the `#` finding is
      // about the privacy spelling and not about the name.
      {
        code: [
          'class Fingerprinter {',
          "  private computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          "  private get fingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeFingerprint', suggestedName: 'fingerprint' },
          },
        ],
      },

      // The static arm keeps `static` and the `#`.
      {
        code: [
          'class Fingerprinter {',
          '  static #computeBase(): number { return 1; }',
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          '  static get #base(): number { return 1; }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: '#computeBase', suggestedName: '#base' },
          },
        ],
      },

      // `#foo` and `foo` are separate members of one class, so a public sibling
      // named like the suggested getter is not a collision and does not block
      // the fix.
      {
        code: [
          'class Fingerprinter {',
          "  fingerprint = 'a';",
          "  #computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          "  fingerprint = 'a';",
          "  get #fingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // Both spellings in one class are two independent conversions.
      {
        code: [
          'class Fingerprinter {',
          "  private computeSignature(): string { return 'a'; }",
          "  #computeFingerprint(): string { return 'b'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          "  private get signature(): string { return 'a'; }",
          "  get #fingerprint(): string { return 'b'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeSignature', suggestedName: 'signature' },
          },
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A heritage clause cannot constrain a `#` member — a base class's `#x`
      // is a different member and no type can declare one — so the whole-class
      // exemption for unresolvable heritage does not reach it.
      {
        code: [
          "import { Base } from './base';",
          'class Fingerprinter extends Base {',
          "  #computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          "import { Base } from './base';",
          'class Fingerprinter extends Base {',
          "  get #fingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // An in-file call site must be rewritten for the conversion to compile,
      // and this rule does not rewrite call sites — so it reports and withholds,
      // exactly as it does for a called `private` method.
      {
        code: [
          'class Fingerprinter {',
          "  #computeFingerprint(): string { return 'x'; }",
          '  render(): string { return this.#computeFingerprint(); }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'render', suggestedName: 'render' },
          },
        ],
      },

      // Stored as a function reference rather than called: same withholding.
      {
        code: [
          'class Fingerprinter {',
          "  #computeFingerprint(): string { return 'x'; }",
          '  hold(): () => string { return this.#computeFingerprint; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'hold', suggestedName: 'hold' },
          },
        ],
      },

      // Reached through another instance of the same class, which only a `#`
      // member can be (`other.#x` is legal inside the class body).
      {
        code: [
          'class Fingerprinter {',
          "  #computeFingerprint(): string { return 'x'; }",
          '  same(other: Fingerprinter): boolean {',
          "    return other.#computeFingerprint() === 'x';",
          '  }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // An ergonomic brand check names the member without a MemberExpression;
      // renaming the declaration would leave it dangling, so the fix is held.
      {
        code: [
          'class Fingerprinter {',
          "  #computeFingerprint(): string { return 'x'; }",
          '  static has(candidate: object): boolean {',
          '    return #computeFingerprint in candidate;',
          '  }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A sibling `#fingerprint` field is a genuine collision: two members of
      // one private namespace are a duplicate declaration.
      {
        code: [
          'class Fingerprinter {',
          "  #fingerprint = 'a';",
          '  #computeFingerprint(): string { return this.#fingerprint; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A private name occupies ONE namespace per class: `static #base` and an
      // instance `#base` cannot coexist, so the static sibling collides even
      // though a `static base` would not.
      {
        code: [
          'class Fingerprinter {',
          '  static #base = 1;',
          '  #computeBase(): number { return 2; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: '#computeBase', suggestedName: '#base' },
          },
        ],
      },

      // Two `#` methods reducing to one getter name would emit a duplicate
      // private element, across the static boundary as well.
      {
        code: [
          'class Fingerprinter {',
          '  static #computeBase(): number { return 1; }',
          '  #deriveBase(): number { return 2; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: '#computeBase', suggestedName: '#base' },
          },
          {
            messageId: 'preferGetter',
            data: { name: '#deriveBase', suggestedName: '#base' },
          },
        ],
      },

      // A decorator cannot be applied to a `#` member under
      // `experimentalDecorators` (TS1206), so no legal getter form exists to
      // convert to and the fix is declined rather than emitted.
      {
        code: [
          'class Fingerprinter {',
          '  @Memoize()',
          "  #computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A mutating `#` method reports under the side-effect message and keeps
      // the fix withheld, matching the `private` spelling.
      {
        code: [
          'class Fingerprinter {',
          '  #hits = 0;',
          '  #computeHits(): number { return ++this.#hits; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetterSideEffect',
            data: {
              name: '#computeHits',
              suggestedName: '#hits',
              reason: 'it mutates state with ++/--',
            },
          },
        ],
      },

      // The body already reading `this.#fingerprint` would make the getter
      // self-referential.
      {
        code: [
          'class Fingerprinter {',
          '  #computeFingerprint(): string { return this.#fingerprint; }',
          '}',
        ].join('\n'),
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A sibling `set #fingerprint` is an accessor pair, not a collision, so
      // the conversion completes the pair.
      {
        code: [
          'class Fingerprinter {',
          '  set #fingerprint(value: string) { void value; }',
          "  #computeFingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        output: [
          'class Fingerprinter {',
          '  set #fingerprint(value: string) { void value; }',
          "  get #fingerprint(): string { return 'x'; }",
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // The thenable exemption must not swallow a genuinely synchronous method
      // that merely SITS BESIDE a promise-returning one. Only `evaluate` is
      // asynchronous here; `computeLabel` returns a plain string and is still a
      // getter candidate, fix included.
      {
        code: [
          'class Session {',
          "  private evaluate(): Promise<string> { return Promise.resolve('x'); }",
          '  private computeLabel(): string {',
          "    return 'epoch';",
          '  }',
          '}',
        ].join('\n'),
        output: [
          'class Session {',
          "  private evaluate(): Promise<string> { return Promise.resolve('x'); }",
          '  private get label(): string {',
          "    return 'epoch';",
          '  }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeLabel', suggestedName: 'label' },
          },
        ],
      },

      // Reading a promise-returning sibling WITHOUT calling it yields the
      // function object, not a thenable, so the method stays reportable. This
      // pins the call/read distinction the sibling lookup makes.
      {
        code: [
          'class Session {',
          "  private evaluate(): Promise<string> { return Promise.resolve('x'); }",
          '  private computeRunner() {',
          '    return this.evaluate;',
          '  }',
          '}',
        ].join('\n'),
        output: [
          'class Session {',
          "  private evaluate(): Promise<string> { return Promise.resolve('x'); }",
          '  private get runner() {',
          '    return this.evaluate;',
          '  }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeRunner', suggestedName: 'runner' },
          },
        ],
      },

      // A promise produced inside a NESTED function is that callback's result,
      // not the method's, so the method still returns a plain string.
      {
        code: [
          'class Runner {',
          '  private computeLabel() {',
          '    const later = async () => {',
          "      return Promise.resolve('x');",
          '    };',
          '    void later;',
          "    return 'label';",
          '  }',
          '}',
        ].join('\n'),
        output: [
          'class Runner {',
          '  private get label() {',
          '    const later = async () => {',
          "      return Promise.resolve('x');",
          '    };',
          '    void later;',
          "    return 'label';",
          '  }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeLabel', suggestedName: 'label' },
          },
        ],
      },

      // An explicit non-thenable annotation is the method's whole contract, so
      // it settles the question and the body is never consulted — a promise
      // mentioned on the way to a `string` does not exempt anything.
      {
        code: [
          'class Coerced {',
          '  private computeToken(): string {',
          "    return Promise.resolve('x') as unknown as string;",
          '  }',
          '}',
        ].join('\n'),
        output: [
          'class Coerced {',
          '  private get token(): string {',
          "    return Promise.resolve('x') as unknown as string;",
          '  }',
          '}',
        ].join('\n'),
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeToken', suggestedName: 'token' },
          },
        ],
      },

      // Mutually recursive un-annotated siblings terminate rather than recurse
      // forever, and neither proves a thenable, so both still report.
      {
        code: [
          'class Mutual {',
          '  private computeLeft() {',
          '    return this.computeRight();',
          '  }',
          '  private computeRight() {',
          '    return this.computeLeft();',
          '  }',
          '}',
        ].join('\n'),
        // Each name is call-used in the file, so both fixes are withheld.
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'computeLeft', suggestedName: 'left' },
          },
          {
            messageId: 'preferGetter',
            data: { name: 'computeRight', suggestedName: 'right' },
          },
        ],
      },

      // `ignoreAsync: false` re-enables the REPORT for an asynchronous method,
      // and the fixer's own thenable lock still withholds the rewrite: this
      // member is `private` with no call site, which is the exact shape the
      // broken autofix used to rewrite (#2154).
      {
        code: [
          'class AsyncOptOut {',
          '  private readEpoch(): Promise<string> {',
          "    return Promise.resolve('x');",
          '  }',
          '}',
        ].join('\n'),
        options: [{ ignoreAsync: false }],
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'readEpoch', suggestedName: 'readEpoch' },
          },
        ],
      },
    ],
  },
);
