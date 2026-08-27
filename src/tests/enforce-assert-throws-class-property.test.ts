import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

/**
 * A class member declared as a field holding a function is the same member as its
 * prototype-method spelling, so both halves of the assert- contract have to read it
 * the same way. Every fixture here pins an exact report count, because the failure
 * this suite guards against has two opposite shapes: the field spelling seeing no
 * report at all, and the field spelling seeing two once the field-valued function is
 * named by both its own visitor and the member it initializes.
 */
ruleTesterTs.run('enforce-assert-throws-class-property', enforceAssertThrows, {
  valid: [
    // An assert-prefixed field arrow that throws satisfies the contract, exactly as
    // the method spelling of it does.
    {
      code: `
        class Validator {
          assertNotNull = (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // Throw guarded by a condition inside a field arrow
    {
      code: `
        class Validator {
          assertNotNull = (data: any) => {
            if (!data) {
              throw new Error('Data is required');
            }
          };
        }
      `,
    },
    // Field holding a function expression rather than an arrow
    {
      code: `
        class Validator {
          assertNotNull = function (data: any) {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // process.exit(1) is a fail-fast exit and satisfies the contract
    {
      code: `
        class Validator {
          assertNotNull = (data: any) => {
            if (!data) {
              process.exit(1);
            }
          };
        }
      `,
    },
    // Delegating to a sibling assert helper declared as a method
    {
      code: `
        class Validator {
          assertPayload = (data: any) => {
            this.assertNotNull(data);
          };

          assertNotNull(data: any) {
            throw new Error('Data is required');
          }
        }
      `,
    },
    // Delegating to a sibling assert helper that is itself a field
    {
      code: `
        class Validator {
          assertPayload = (data: any) => {
            this.assertNotNull(data);
          };

          assertNotNull = (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // Rethrowing from a catch block inside a field arrow
    {
      code: `
        class Validator {
          assertParsed = (raw: string) => {
            try {
              JSON.parse(raw);
            } catch (error) {
              throw error;
            }
          };
        }
      `,
    },
    // Throw inside a switch statement in a field arrow
    {
      code: `
        class Validator {
          assertKnownKind = (kind: string) => {
            switch (kind) {
              case 'known':
                return;
              default:
                throw new Error('Unknown kind');
            }
          };
        }
      `,
    },
    // private field arrow that throws
    {
      code: `
        class Validator {
          private assertNotNull = (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // ECMAScript-private field arrow that throws
    {
      code: `
        class Validator {
          #assertNotNull = (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // static field arrow that throws
    {
      code: `
        class Validator {
          static assertNotNull = (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // async field arrow that throws
    {
      code: `
        class Validator {
          assertNotNull = async (data: any) => {
            throw new Error('Data is required');
          };
        }
      `,
    },
    // A data field holding a function that neither claims the assert- prefix nor
    // calls an assert helper is untouched.
    {
      code: `
        class Formatter {
          format = (value: string) => {
            return value.trim();
          };
        }
      `,
    },
    // A field holding a plain value is not a function at all
    {
      code: `
        class Formatter {
          assertions = 0;
        }
      `,
    },
    // A computed key spells an expression, not a member name, so it contributes no
    // name to the assert- convention in either spelling.
    {
      code: `
        declare const assertKey: string;
        class Validator {
          [assertKey] = (data: any) => {
            return data !== null;
          };
        }
      `,
    },
    // A string-literal key is not an identifier, matching how the method spelling
    // treats it.
    {
      code: `
        class Validator {
          'assertNotNull' = (data: any) => {
            return data !== null;
          };
        }
      `,
    },
    // A `declare` field states a type with no implementation, so it has no control
    // flow that could throw.
    {
      code: `
        class Validator {
          declare assertNotNull: (data: any) => void;
        }
      `,
    },
    // An abstract property likewise declares only a signature
    {
      code: `
        abstract class Validator {
          abstract assertNotNull: (data: any) => void;
        }
      `,
    },
    // A function nested inside a field's initializer is not the member, so it does
    // not borrow the member's name.
    {
      code: `
        class Validator {
          assertNotNull = withLogging(() => {
            return true;
          });
        }
      `,
    },
    // A non-assert field whose nested callback is passed on rather than invoked here
    {
      code: `
        class Formatter {
          register = () => {
            return () => {
              return 1;
            };
          };
        }
      `,
    },
  ],
  invalid: [
    // The reported defect: an assert-prefixed field arrow that returns instead of
    // throwing, silent before the member name was derived from its field.
    {
      code: `
        class Validator {
          assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [
        {
          messageId: 'assertShouldThrow',
          data: { functionName: 'assertMethodNoThrow' },
        },
      ],
    },
    // The same member as a function expression
    {
      code: `
        class Validator {
          assertMethodNoThrow = function (data: any) {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Concise-body field arrow, matching the const-arrow spelling the rule already
    // reported on.
    {
      code: `
        class Validator {
          assertMethodNoThrow = (data: any) => data !== null;
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // public
    {
      code: `
        class Validator {
          public assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // private
    {
      code: `
        class Validator {
          private assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // protected
    {
      code: `
        class Validator {
          protected assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // static
    {
      code: `
        class Validator {
          static assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // readonly
    {
      code: `
        class Validator {
          readonly assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // async
    {
      code: `
        class Validator {
          assertMethodNoThrow = async (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // The `#` sigil is a privacy marker rather than part of the governed name, and
    // the finding quotes the name as written so it is not read as a public namesake.
    {
      code: `
        class Validator {
          #assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [
        {
          messageId: 'assertShouldThrow',
          data: { functionName: '#assertMethodNoThrow' },
        },
      ],
    },
    // An explicit type annotation on the field does not change the member's name
    {
      code: `
        class Validator {
          assertMethodNoThrow: (data: any) => boolean = (data) => {
            return data !== null;
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Returning a throwing function is not throwing, in either spelling
    {
      code: `
        class Validator {
          assertLazily = () => {
            return () => {
              throw new Error('Too late');
            };
          };
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // A field of a class expression is still a class member
    {
      code: `
        const Validator = class {
          assertMethodNoThrow = (data: any) => {
            return data !== null;
          };
        };
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // A class declared inside a function is still a class
    {
      code: `
        function createValidator() {
          class Validator {
            assertMethodNoThrow = (data: any) => {
              return data !== null;
            };
          }
          return Validator;
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Exactly one report per member: the method and the field spellings of two
    // sibling members yield two findings, not three or four.
    {
      code: `
        class Validator {
          assertAsMethod(data: any) {
            return data !== null;
          }

          assertAsField = (data: any) => {
            return data !== null;
          };
        }
      `,
      errors: [
        {
          messageId: 'assertShouldThrow',
          data: { functionName: 'assertAsMethod' },
        },
        {
          messageId: 'assertShouldThrow',
          data: { functionName: 'assertAsField' },
        },
      ],
    },
    // The other half of the contract: a field arrow that calls a free assert helper
    // has to carry the prefix itself.
    {
      code: `
        class Session {
          endSession = (userId: string) => {
            assertSafe(userId);
          };
        }
      `,
      errors: [
        {
          messageId: 'shouldBeAssertPrefixed',
          data: { functionName: 'endSession' },
        },
      ],
    },
    // Calling a sibling assert method from a non-assert field arrow
    {
      code: `
        class Session {
          endSession = () => {
            this.assertActive();
          };

          assertActive() {
            throw new Error('Session is closed');
          }
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // Calling an ECMAScript-private assert helper from a non-assert field arrow
    {
      code: `
        class Session {
          endSession = () => {
            this.#assertActive();
          };

          #assertActive() {
            throw new Error('Session is closed');
          }
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // The caller written as a function expression rather than an arrow
    {
      code: `
        class Session {
          endSession = function (userId: string) {
            assertSafe(userId);
          };
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // static caller
    {
      code: `
        class Session {
          static endSession = (userId: string) => {
            assertSafe(userId);
          };
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // async caller
    {
      code: `
        class Session {
          endSession = async (userId: string) => {
            assertSafe(userId);
          };
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // private caller
    {
      code: `
        class Session {
          private endSession = (userId: string) => {
            assertSafe(userId);
          };
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // The assert call reached through a callback inside the field arrow
    {
      code: `
        class Session {
          endAll = (userIds: string[]) => {
            userIds.forEach((userId) => {
              assertSafe(userId);
            });
          };
        }
      `,
      errors: [{ messageId: 'shouldBeAssertPrefixed' }],
    },
    // A non-assert field arrow calling an assert helper that is itself a field
    {
      code: `
        class Session {
          assertActive = () => {
            throw new Error('Session is closed');
          };

          endSession = () => {
            this.assertActive();
          };
        }
      `,
      errors: [
        {
          messageId: 'shouldBeAssertPrefixed',
          data: { functionName: 'endSession' },
        },
      ],
    },
    // The half-enforced contract from the report, both halves in one class: the
    // caller was already told to carry the prefix while the field-declared helper it
    // calls escaped the guarantee that report assumes.
    {
      code: `
        class Session {
          assertActive = () => {
            return true;
          };

          endSession() {
            this.assertActive();
          }
        }
      `,
      errors: [
        {
          messageId: 'assertShouldThrow',
          data: { functionName: 'assertActive' },
        },
        {
          messageId: 'shouldBeAssertPrefixed',
          data: { functionName: 'endSession' },
        },
      ],
    },
  ],
});
