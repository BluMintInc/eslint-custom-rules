import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// Regression tests for the callee-substring false-positive bug.
// callExpressionLooksBoolean must NOT infer a boolean return from a raw
// substring match ("check", "auth", "valid", "enabled") in the callee name.
// Only a proper boolean prefix at a name boundary (is/has/can/should/…) counts.

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      {
        // Getter returns an ARRAY; "preserveUsersCheckedIn" merely contains "check".
        code: `
          class ParticipantsFactory {
            get teamsCheckedIn() {
              return preserveUsersCheckedIn(this.teams);
            }
          }
        `,
      },
      {
        // Same shape with the other substring triggers — all return non-booleans.
        code: `
          class Service {
            get authenticatedUser() { return authenticateUser(this.token); }
            get validatedPayload()  { return validatePayload(this.input);  }
            get enabledFeatures()   { return getEnabledFeatures(this.cfg);  }
          }
        `,
      },
      {
        // Callee contains "check" as a middle substring — neutral callee name.
        code: `
          class Repo {
            get checkoutSummary() { return buildCheckoutData(this.cart); }
          }
        `,
      },
      {
        // Callee contains "auth" as a middle substring — non-boolean return.
        code: `
          class Gateway {
            get authToken() { return fetchAuthCredentials(this.session); }
          }
        `,
      },
      {
        // Callee contains "valid" as a middle substring — returns an object.
        code: `
          class Parser {
            get validationResult() { return runValidationPipeline(this.input); }
          }
        `,
      },
      {
        // Neutral-callee control: getter whose name contains no boolean clues
        // and whose callee has no boolean prefix — should not be flagged.
        code: `
          class Store {
            get orderedItems() { return filterParticipants(this.items); }
          }
        `,
      },
    ],
    invalid: [
      {
        // Callee IS genuinely boolean-prefixed (isValid) — getter lacks boolean prefix.
        // The rule SHOULD flag this because the call expression truly looks boolean.
        code: `
          class Validator {
            get result() { return isValid(this.input); }
          }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
      {
        // Callee IS genuinely boolean-prefixed (hasPermission) — getter lacks boolean prefix.
        code: `
          class AuthGuard {
            get access() { return hasPermission(this.user); }
          }
        `,
        errors: [{ messageId: 'missingBooleanPrefix' }],
      },
    ],
  },
);
