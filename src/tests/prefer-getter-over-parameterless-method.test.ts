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
        output: `
        class User {
          public get fullName() {
            return this.first + this.last;
          }
        }
        `,
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
        output: `
        class Person {
          get name() {
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
      },
      {
        code: `
        class Previewer {
          public buildPreview() {
            return { value: 1 } as const;
          }
        }
        `,
        output: `
        class Previewer {
          public get preview() {
            return { value: 1 } as const;
          }
        }
        `,
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
        output: `
        class Validator {
          get isValid() {
            return true;
          }
        }
        `,
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
        output: `
        class MathUtils {
          public static get pi() {
            return 3.14;
          }
        }
        `,
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
        output: `
        class Parser {
          get result(): ParseResult {
            return this.doParse();
          }
        }
        `,
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
        output: `
        class Snapshotter {
          /**
           * @returns immutable snapshot without side effects
           */
          get snapshot() {
            return this.state.clone();
          }
        }
        `,
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
        output: `
        class Reporter {
          get summary() {
            const title = this.title;
            return title;
          }
        }
        `,
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
        output: `
        class Account {
          get balance() {
            return this.balance;
          }
        }
        `,
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
        output: `
        class TitleCase {
          get URL() {
            return this.url;
          }
        }
        `,
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
        output: `
        class Reporter {
          name() {
            return this.display;
          }

          get describe() {
            return this.name();
          }
        }
        `,
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
        output: `
        class Worker {
          getResult() {
            return this.value;
          }

          get bindResult() {
            return this.getResult.bind(this);
          }
        }
        `,
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
        output: `
        class MixedAccess {
          static value = 1;
          private _value = 2;

          get value() {
            return this._value + MixedAccess.value;
          }
        }
        `,
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
        output: `
        class WithSetter {
          private _name = 'x';

          set name(value: string) {
            this._name = value;
          }

          get name() {
            return this._name;
          }
        }
        `,
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
        output: `
        class StaticVsInstance {
          count = 3;

          static get count() {
            return 10;
          }
        }
        `,
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
        output: `
        class Caller {
          value() {
            return this.result;
          }

          get invoke() {
            return this.value.apply(this);
          }
        }
        `,
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
        output: `
        class Storer {
          getValue() {
            return this.value;
          }

          get keep() {
            const fn = this.getValue;
            return fn();
          }
        }
        `,
      },
      {
        code: `
        class VoidReturn {
          result(): void {
            return;
          }
        }
        `,
        options: [{ ignoreVoidReturn: false }],
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'result', suggestedName: 'result' },
          },
        ],
        output: `
        class VoidReturn {
          get result(): void {
            return;
          }
        }
        `,
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
        output: `
        class CallableName {
          call() {
            return this.value;
          }

          get use() {
            return this.call();
          }
        }
        `,
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
        output: `
        class First {
          getValue() {
            return this.value;
          }

          consume(value: number) {
            return this.getValue() + value;
          }
        }

        class Second {
          get value() {
            return 2;
          }
        }
        `,
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
    ],
  },
);
