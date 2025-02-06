import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

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
  ],
  invalid: [
    // Function declaration without throw
    {
      code: `
        function assertValidUser(user: any) {
          return user !== null;
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
    // Arrow function without throw
    {
      code: `
        const assertDataLoaded = (data: any) => {
          return Boolean(data);
        };
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
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
      errors: [{ messageId: 'assertShouldThrow' }],
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
      errors: [{ messageId: 'assertShouldThrow' }],
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
      errors: [{ messageId: 'assertShouldThrow' }],
    },
  ],
});
