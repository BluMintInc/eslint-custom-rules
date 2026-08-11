import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

const assertShouldThrowError = (functionName: string) => ({
  messageId: 'assertShouldThrow' as const,
  data: { functionName },
});

const shouldBeAssertPrefixedError = (functionName: string) => ({
  messageId: 'shouldBeAssertPrefixed' as const,
  data: { functionName },
});

ruleTesterTs.run('enforce-assert-throws', enforceAssertThrows, {
  valid: [
    // Function declaration with throw
    {
      code: `
        function assertValidUser(user: any) {
          if (!user) {
            throw new Error('User is not valid');
          }
        }
      `,
    },
    // Arrow function with throw
    {
      code: `
        const assertDataLoaded = (data: any) => {
          if (!data) {
            throw new Error('Data must be loaded');
          }
        };
      `,
    },
    // Class method with throw
    {
      code: `
        class Validator {
          assertValidName(name: string) {
            if (name.length === 0) {
              throw new Error('Name cannot be empty');
            }
          }
        }
      `,
    },
    // Async function with throw
    {
      code: `
        async function assertDataFetched(response: any) {
          if (!response.ok) {
            throw new Error('Failed to fetch data');
          }
        }
      `,
    },
    // Function that doesn't start with assert
    {
      code: `
        function validateUser(user: any) {
          return user !== null;
        }
      `,
    },
    // Function that calls another assert function
    {
      code: `
        function assertAuthenticated(request: any) {
          if (!request.auth) {
            throw new Error('Not authenticated');
          }
        }

        function assertGroupMember(request: any) {
          assertAuthenticated(request);
          const evaluator = new MembershipEvaluator(request);
          evaluator.assertMember();
        }
      `,
    },
    // Function that calls an object's assert method
    {
      code: `
        function assertValidData(data: any) {
          const validator = new Validator();
          validator.assertValid(data);
        }
      `,
    },
    // Function that uses process.exit(1)
    {
      code: `
        export const assertFirebaseAuthenticated = async () => {
          try {
            logWithTimestamp(ANSI_GREEN, 'Checking Firebase authentication...');
            await runCommand('firebase projects:list');
            logWithTimestamp(ANSI_GREEN, 'Successfully authenticated with Firebase');
          } catch {
            logWithTimestamp(
              ANSI_MAGENTA,
              'Not authenticated with Firebase. Please run "firebase login" first.',
            );
            process.exit(1);
          }
        };
      `,
    },
    // Function that uses process.exit(1) in if statement
    {
      code: `
        function assertEnvironmentVars() {
          if (!process.env.API_KEY) {
            console.error('API_KEY environment variable is required');
            process.exit(1);
          }
        }
      `,
    },
    // Function that calls assert- method and is correctly prefixed with assert-
    {
      code: `
        function assertValidData() {
          assertNotNull(data);
        }
      `,
    },
    // Method that calls assert- method and is correctly prefixed with assert-
    {
      code: `
        class Validator {
          assertComplexValidation() {
            this.assertBasicValidation();
          }
        }
      `,
    },
    // ECMA private (#) members carry the same privacy as the `private` modifier
    // and the same assert- naming convention (issue #1934).
    // A `private` caller that delegates to a `#assert` helper still delegates.
    {
      code: `
        class Session {
          private assertSessionActive(id: string) {
            return this.#assertKnownSession(id);
          }

          #assertKnownSession(id: string) {
            throw new Error('Unknown session');
          }
        }
      `,
    },
    // Isolation control for the delegation case: renaming the delegate while
    // keeping `private` must not move the verdict.
    {
      code: `
        class Session {
          private assertSessionActive(id: string) {
            return this.assertKnownSessionProbe(id);
          }

          private assertKnownSessionProbe(id: string) {
            throw new Error('Unknown session');
          }
        }
      `,
    },
    // #assert helper that throws
    {
      code: `
        class Validator {
          #assertValidName(name: string) {
            if (name.length === 0) {
              throw new Error('Name cannot be empty');
            }
          }
        }
      `,
    },
    // #assert helper delegating to another #assert helper
    {
      code: `
        class Validator {
          #assertOuter() {
            return this.#assertInner();
          }

          #assertInner() {
            throw new Error('Invalid');
          }
        }
      `,
    },
    // #assert-prefixed caller of a #assert helper needs no rename
    {
      code: `
        class Validator {
          #assertFoo() {
            throw new Error('Invalid');
          }

          #assertDoStuff() {
            this.#assertFoo();
          }
        }
      `,
    },
    // #assert helper that exits the process
    {
      code: `
        class Validator {
          #assertEnvironment() {
            if (!process.env.API_KEY) {
              process.exit(1);
            }
          }
        }
      `,
    },
    // Static delegation through the class name: A.#assertInner()
    {
      code: `
        class Validator {
          private static assertOuter() {
            return Validator.#assertInner();
          }

          static #assertInner() {
            throw new Error('Invalid');
          }
        }
      `,
    },
    // Awaited delegation to a #assert helper
    {
      code: `
        class Validator {
          private async assertOuter() {
            await this.#assertInner();
          }

          async #assertInner() {
            throw new Error('Invalid');
          }
        }
      `,
    },
    // Promise chain rooted at a #assert helper
    {
      code: `
        class Validator {
          private assertOuter() {
            return this.#assertInner().then(() => undefined);
          }

          async #assertInner() {
            throw new Error('Invalid');
          }
        }
      `,
    },
    // Variable assigned a #assert method and then invoked
    {
      code: `
        class Validator {
          private assertOuter() {
            const check = this.#assertInner;
            check();
          }

          #assertInner() {
            throw new Error('Invalid');
          }
        }
      `,
    },
    // Non-assert # member that calls nothing assert-like
    {
      code: `
        class Validator {
          #doStuff() {
            return 1;
          }
        }
      `,
    },
  ],
  invalid: [
    // Simple function that calls assert- method but is not prefixed with assert-
    {
      code: `
        function isDeletable() {
          assertTournamentDeletable();
        }
      `,
      errors: [shouldBeAssertPrefixedError('isDeletable')],
    },
    // Arrow function that calls assert- method but is not prefixed with assert-
    {
      code: `
        const validateData = () => {
          assertNotEmpty(data);
        };
      `,
      errors: [shouldBeAssertPrefixedError('validateData')],
    },
    // Method that calls assert- method but is not prefixed with assert-
    {
      code: `
        class DataProcessor {
          processData() {
            this.assertValidInput();
            return processedData;
          }
        }
      `,
      errors: [shouldBeAssertPrefixedError('processData')],
    },
    // Function that calls assert- method in conditional
    {
      code: `
        function validateInput(input) {
          if (input) {
            assertNotNull(input.value);
          }
        }
      `,
      errors: [shouldBeAssertPrefixedError('validateInput')],
    },
    // Function declaration without throw
    {
      code: `
        function assertValidUser(user: any) {
          return user !== null;
        }
      `,
      errors: [assertShouldThrowError('assertValidUser')],
    },
    // Arrow function without throw
    {
      code: `
        const assertDataLoaded = (data: any) => {
          return Boolean(data);
        };
      `,
      errors: [assertShouldThrowError('assertDataLoaded')],
    },
    // Class method without throw
    {
      code: `
        class Validator {
          assertValidName(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [assertShouldThrowError('assertValidName')],
    },
    // Function with console.warn instead of throw
    {
      code: `
        function assertPositiveNumber(num: number) {
          if (num < 0) {
            console.warn('Number should be positive');
          }
        }
      `,
      errors: [assertShouldThrowError('assertPositiveNumber')],
    },
    // Function that catches and suppresses error
    {
      code: `
        function assertFileExists(filePath: string) {
          try {
            fs.accessSync(filePath);
          } catch (err) {
            return false;
          }
        }
      `,
      errors: [assertShouldThrowError('assertFileExists')],
    },
    // Method that calls non-assert method (should fail)
    {
      code: `
        class TestClass {
          assertSomething() {
            return this.validateSomething();
          }

          validateSomething() {
            return true;
          }
        }
      `,
      errors: [assertShouldThrowError('assertSomething')],
    },
    // Method that calls assert method but also has other logic without throw (edge case)
    {
      code: `
        class TestClass {
          assertComplexLogic() {
            const result = this.assertHelper();
            console.log('This should not prevent throwing');
            return result;
          }

          assertHelper() {
            throw new Error('Helper throws');
          }
        }
      `,
      errors: [assertShouldThrowError('assertComplexLogic')],
    },
    // ECMA private (#) assert helper that does not throw (issue #1934, arm A)
    {
      code: `
        class Validator {
          #assertValidName(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [assertShouldThrowError('#assertValidName')],
    },
    // Isolation control for arm A: renaming while keeping `private` still reports,
    // so the blindness is the privacy spelling and not the name.
    {
      code: `
        class Validator {
          private assertValidNameProbe(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [assertShouldThrowError('assertValidNameProbe')],
    },
    // Non-assert # member calling an assert helper (issue #1934, arm C)
    {
      code: `
        class DataProcessor {
          #processData() {
            this.assertValidInput();
          }

          private assertValidInput() {
            throw new Error('Invalid input');
          }
        }
      `,
      errors: [shouldBeAssertPrefixedError('#processData')],
    },
    // Non-assert `private` member calling a # assert helper (issue #1934, arm D)
    {
      code: `
        class DataProcessor {
          private processData() {
            this.#assertValidInput();
          }

          #assertValidInput() {
            throw new Error('Invalid input');
          }
        }
      `,
      errors: [shouldBeAssertPrefixedError('processData')],
    },
    // Both members spelled with #: the caller still needs the assert- prefix
    {
      code: `
        class DataProcessor {
          #processData() {
            this.#assertValidInput();
          }

          #assertValidInput() {
            throw new Error('Invalid input');
          }
        }
      `,
      errors: [shouldBeAssertPrefixedError('#processData')],
    },
    // Static # assert helper without a throw
    {
      code: `
        class Validator {
          static #assertValidName(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [assertShouldThrowError('#assertValidName')],
    },
    // Getter # assert helper without a throw
    {
      code: `
        class Validator {
          get #assertValidName() {
            return true;
          }
        }
      `,
      errors: [assertShouldThrowError('#assertValidName')],
    },
    // Setter # assert helper without a throw
    {
      code: `
        class Validator {
          set #assertValidName(name: string) {
            this.name = name;
          }
        }
      `,
      errors: [assertShouldThrowError('#assertValidName')],
    },
    // A # member and a public member of the same name are distinct members:
    // only the one that fails to throw is reported, and it is named with its sigil.
    {
      code: `
        class Validator {
          assertValidName(name: string) {
            throw new Error('Name cannot be empty');
          }

          #assertValidName(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [
        {
          ...assertShouldThrowError('#assertValidName'),
          line: 7,
        },
      ],
    },
    // Both privacy spellings are checked in the same class
    {
      code: `
        class Validator {
          private assertPrivateModifier(name: string) {
            return name.length > 0;
          }

          #assertEcmaPrivate(name: string) {
            return name.length > 0;
          }
        }
      `,
      errors: [
        assertShouldThrowError('assertPrivateModifier'),
        assertShouldThrowError('#assertEcmaPrivate'),
      ],
    },
  ],
});
