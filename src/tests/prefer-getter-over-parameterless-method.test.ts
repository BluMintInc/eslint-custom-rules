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
    ],
  },
);
