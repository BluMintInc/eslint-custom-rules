import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePositiveNaming } from '../rules/enforce-positive-naming';

ruleTesterTs.run('enforce-positive-naming', enforcePositiveNaming, {
  valid: [
    // Valid positive boolean variables
    'const isValid = validateInput(value);',
    'const isAllowed = checkPermissions(user);',
    'const isEnabled = true;',
    'const isComplete = status === "done";',
    'const canAccess = user.permissions.includes("admin");',
    'const isAdmin = user.role === "admin";',
    'const isAuthorized = checkAuth(user);',
    'const canSubmit = true;',
    'const isVerified = user.verified;',

    // Valid positive function names
    'function isEligible(user: User) { return meetsRequirements(user); }',
    'function canAccessUser(userId: string) { return hasPermission(userId); }',

    // Valid positive property names
    `
    interface UserState {
      isActive: boolean;
      isVerified: boolean;
      hasPaid: boolean;
    }
    `,

    // Valid implementation with negation but positive naming
    'const isValid = !hasErrors;',
    'const canProceed = !isBlocked && !isPaused;',
    'const isAvailable = !isReserved && !isDeleted;',

    // Non-boolean variables should not be flagged
    'const errorMessage = "Something went wrong";',
    'const rejectedItems = items.filter(item => !item.accepted);',
    'const disabledFeatures: string[] = ["feature1", "feature2"];',
    'const errorHandler = (err: Error) => console.error(err);',
    'function handleError(error: Error) { console.log(error); }',
    'const invalidInputs = ["a", "b", "c"];',

    // Valid object method shorthand
    'const obj = { isValid() { return true; } };',

    // Non-boolean methods should not be flagged
    'const utils = { disableFeature(id: string) { /* implementation */ } };',
    'class ErrorHandler { handleError(err: Error) { /* implementation */ } }',
  ],
  invalid: [
    // Invalid boolean variables with "not" prefix
    {
      code: 'const isNotAllowed: boolean = checkPermissions(user);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotAllowed',
            alternatives: 'isAllowed',
          },
        },
      ],
    },
    {
      code: 'const hasNoAccess = !user.permissions.includes("admin");',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'hasNoAccess',
            alternatives: 'hasAccess',
          },
        },
      ],
    },
    {
      code: 'const isNotAdmin = user.role !== "admin";',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotAdmin',
            alternatives: 'isAdmin',
          },
        },
      ],
    },
    {
      code: 'const isNotVerified = !user.verified;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
      ],
    },

    // Boolean function names with negative prefixes
    {
      code: 'function isNotEligible(user: User): boolean { return !meetsRequirements(user); }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotEligible',
            alternatives: 'isEligible',
          },
        },
      ],
    },

    // Boolean property names with negative prefixes
    {
      code: `
      interface UserState {
        isNotVerified: boolean;
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
      ],
    },

    // Boolean method definitions with negative prefixes
    {
      code: `
      class Service {
        isNotActive(): boolean {
          return !this.active;
        }
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotActive',
            alternatives: 'isActive',
          },
        },
      ],
    },

    // Object method shorthand with negative prefixes
    {
      code: 'const obj = { isNotValid(): boolean { return false; } };',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotValid',
            alternatives: 'isValid',
          },
        },
      ],
    },

    // Additional boolean prefix patterns
    {
      code: 'const shouldNotProceed: boolean = condition;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'shouldNotProceed',
            alternatives: 'shouldProceed',
          },
        },
      ],
    },
    {
      code: 'const willNotWork = false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'willNotWork',
            alternatives: 'willWork',
          },
        },
      ],
    },
    {
      code: 'const doesNotExist = condition === false;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'doesNotExist',
            alternatives: 'doesExist',
          },
        },
      ],
    },
  ],
});
