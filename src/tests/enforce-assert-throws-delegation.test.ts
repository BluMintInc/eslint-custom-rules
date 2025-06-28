import { ruleTesterTs } from '../utils/ruleTester';
import { enforceAssertThrows } from '../rules/enforce-assert-throws';

ruleTesterTs.run('enforce-assert-throws-delegation', enforceAssertThrows, {
  valid: [
    // This should be valid: assertDeletable delegates to assertTournamentDeletable
    {
      code: `
        class ChannelGroupDeleter {
          @Memoize()
          private async assertDeletable() {
            const groupFilter = await this.fetchGroupFilter();
            if (!groupFilter) {
              return 'already-deleted'; // Does not throw directly
            }

            // Delegates throwing to assertTournamentDeletable
            return await this.assertTournamentDeletable(groupFilter);
          }

          @Memoize()
          private async assertTournamentDeletable(groupFilter: GroupFilter) {
            // ... some logic ...
            const tournament = await ChannelGroupDeleter.fetchTournament(groupFilter);

            if (!tournament) {
              return;
            }
            // ... more logic ...

            // This method actually throws
            throw new HttpsError('failed-precondition', 'ERROR_CANNOT_LEAVE_TOURNAMENT');
          }
        }
      `,
    },
    // Another example with a different class structure
    {
      code: `
        class Validator {
          async assertValid() {
            // Delegates to another assert method
            return this.assertDataValid();
          }

          async assertDataValid() {
            throw new Error('Invalid data');
          }
        }
      `,
    },
    // Example with method chaining
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
  ],
  invalid: [
    // This should be invalid: assertDeletable doesn't throw and doesn't call another assert method
    {
      code: `
        class ChannelGroupDeleter {
          @Memoize()
          private async assertDeletable() {
            const groupFilter = await this.fetchGroupFilter();
            if (!groupFilter) {
              return 'already-deleted'; // Does not throw directly
            }

            // Doesn't delegate to another assert method
            return await this.validateTournament(groupFilter);
          }

          @Memoize()
          private async validateTournament(groupFilter: GroupFilter) {
            // This method name doesn't start with assert
            throw new HttpsError('failed-precondition', 'ERROR_CANNOT_LEAVE_TOURNAMENT');
          }
        }
      `,
      errors: [{ messageId: 'assertShouldThrow' }],
    },
  ],
});
