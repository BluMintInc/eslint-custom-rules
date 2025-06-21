import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

ruleTesterTs.run('enforce-assert-throws-method-chaining', enforceAssertThrows, {
  valid: [
    // Method chaining with promise then
    {
      code: `
        class AuthValidator {
          assertUserPermissions(user) {
            return this.assertUserExists(user)
              .then(() => this.assertUserHasAccess(user));
          }

          async assertUserExists(user) {
            if (!user) {
              throw new Error('User does not exist');
            }
          }

          async assertUserHasAccess(user) {
            if (!user.hasAccess) {
              throw new Error('User does not have access');
            }
          }
        }
      `,
    },
    // Method chaining with await
    {
      code: `
        class DataValidator {
          async assertDataValid(data) {
            const result = await this.assertDataExists(data);
            return await this.assertDataFormatCorrect(result);
          }

          async assertDataExists(data) {
            if (!data) {
              throw new Error('Data does not exist');
            }
            return data;
          }

          async assertDataFormatCorrect(data) {
            if (!data.format) {
              throw new Error('Data format is incorrect');
            }
            return true;
          }
        }
      `,
    },
    // Method chaining with multiple then calls
    {
      code: `
        class UserValidator {
          assertUserValid(user) {
            return this.assertUserExists(user)
              .then(user => this.assertUserHasEmail(user))
              .then(user => this.assertUserHasName(user));
          }

          async assertUserExists(user) {
            if (!user) {
              throw new Error('User does not exist');
            }
            return user;
          }

          async assertUserHasEmail(user) {
            if (!user.email) {
              throw new Error('User does not have email');
            }
            return user;
          }

          async assertUserHasName(user) {
            if (!user.name) {
              throw new Error('User does not have name');
            }
            return user;
          }
        }
      `,
    },
  ],
  invalid: [
    // Method that doesn't call an assert method
    {
      code: `
        class AuthValidator {
          assertUserPermissions(user) {
            return this.validateUser(user)
              .then(() => this.checkAccess(user));
          }

          async validateUser(user) {
            if (!user) {
              throw new Error('User does not exist');
            }
          }

          async checkAccess(user) {
            if (!user.hasAccess) {
              throw new Error('User does not have access');
            }
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
  ],
});
