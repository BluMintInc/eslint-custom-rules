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
        errors: [{ messageId: 'preferGetter' }],
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
        errors: [{ messageId: 'preferGetter', data: { suggestedName: 'name' } }],
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
        errors: [{ messageId: 'preferGetter', data: { suggestedName: 'preview' } }],
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
        errors: [{ messageId: 'preferGetter', data: { suggestedName: 'isValid' } }],
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
        errors: [{ messageId: 'preferGetter', data: { suggestedName: 'pi' } }],
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
        errors: [{ messageId: 'preferGetter' }],
      },
      {
        code: `
        class Counter {
          getNextId() {
            return ++this.count;
          }
        }
        `,
        errors: [{ messageId: 'preferGetterSideEffect' }],
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
        errors: [{ messageId: 'preferGetterSideEffect' }],
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
        errors: [{ messageId: 'preferGetterSideEffect' }],
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
        errors: [{ messageId: 'preferGetterSideEffect' }],
        output: null,
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
        errors: [{ messageId: 'preferGetter' }],
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
        errors: [{ messageId: 'preferGetter', data: { suggestedName: 'balance' } }],
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
        errors: [{ messageId: 'preferGetter' }],
      },
    ],
  },
);
