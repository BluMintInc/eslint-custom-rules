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
    'function enableFeature(featureId: string) { features[featureId].enabled = true; }',

    // Valid positive property names
    `
    interface UserState {
      isActive: boolean;
      isVerified: boolean;
      enabledFeatures: string[];
      completedTasks: Task[];
      hasPaid: boolean;
    }
    `,

    // Allowed negative terms (technical/common)
    'const isEmpty = array.length === 0;',
    'const isOffline = !hasConnection;',
    'const isMissing = !exists;',
    'const isNaN = Number.isNaN(value);',
    'const isNull = value === null;',
    'const isUndefined = typeof value === "undefined";',
    'const isOutOfStock = quantity === 0;',
    'const isOutOfBounds = position > maxBounds;',
    'const isOffPeak = !isPeakHours;',
    'const isNone = value === null || value === undefined;',
    'const isNegative = number < 0;',
    'const isNeutral = value === 0;',
    'const isNotification = type === "notification";',
    'const isNote = type === "note";',
    'const hasNote = notes.length > 0;',

    // Valid implementation with negation but positive naming
    'const isValid = !hasErrors;',
    'const canProceed = !isBlocked && !isPaused;',
    'const isAvailable = !isReserved && !isDeleted;',

    // Words that contain negative prefixes but aren't negative
    'const isNoticeable = true;',
    'const hasNotification = true;',
    'const isNoteworthy = true;',

    // Valid array methods with positive naming
    'const activeUsers = users.filter(u => u.isActive);',
    'const enabledFeatures = features.filter(f => f.isEnabled);',

    // Valid parameter names
    'function processData(validItems, enabledFeatures) { return true; }',

    // Valid object method shorthand
    'const obj = { isValid() { return true; } };',
  ],
  invalid: [
    // Invalid boolean variables
    {
      code: 'const isInvalid = !validateInput(value);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isInvalid',
            alternatives: 'isValid',
          },
        },
      ],
    },
    {
      code: 'const isNotAllowed = checkPermissions(user);',
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
      code: 'const disabled = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disabled',
            alternatives: 'enabled',
          },
        },
      ],
    },
    {
      code: 'const incomplete = status !== "done";',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'incomplete',
            alternatives: 'complete',
          },
        },
      ],
    },
    {
      code: 'const isDisabled = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isDisabled',
            alternatives: 'isEnabled',
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
      code: 'const isUnauthorized = checkAuth(user);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isUnauthorized',
            alternatives: 'isAuthorized',
          },
        },
      ],
    },
    {
      code: 'const preventSubmission = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'preventSubmission',
            alternatives: 'allow, enable',
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

    // New negative terms
    {
      code: 'const isImpossible = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isImpossible',
            alternatives: 'isPossible',
          },
        },
      ],
    },
    {
      code: 'const isError = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isError',
            alternatives: 'isSuccess, isValid',
          },
        },
      ],
    },
    {
      code: 'const isBroken = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isBroken',
            alternatives: 'isWorking, isFunctional',
          },
        },
      ],
    },
    {
      code: 'const isRestricted = true;',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isRestricted',
            alternatives: 'isAllowed, isAccessible',
          },
        },
      ],
    },

    // Invalid function names
    {
      code: 'function isNotEligible(user: User) { return !meetsRequirements(user); }',
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
    {
      code: 'function preventUserAccess(userId: string) { return !hasPermission(userId); }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'preventUserAccess',
            alternatives: 'allow, enable',
          },
        },
      ],
    },
    {
      code: 'function disableFeature(featureId: string) { features[featureId].enabled = false; }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disableFeature',
            alternatives: 'enableFeature',
          },
        },
      ],
    },
    {
      code: 'const blockUser = function(userId) { /* implementation */ };',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'blockUser',
            alternatives: 'allowUser',
          },
        },
      ],
    },

    // Invalid property names
    {
      code: `
      interface UserState {
        isInactive: boolean;
        isNotVerified: boolean;
        disabledFeatures: string[];
        incompleteTasks: Task[];
        isUnpaid: boolean;
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isInactive',
            alternatives: 'isActive',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotVerified',
            alternatives: 'isVerified',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disabledFeatures',
            alternatives: 'enabledFeatures',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'incompleteTasks',
            alternatives: 'isComplete',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isUnpaid',
            alternatives: 'isPaid, hasPaid',
          },
        },
      ],
    },

    // Invalid array methods with negative variables
    {
      code: 'const inactiveUsers = users.filter(u => u.isInactive);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'inactiveUsers',
            alternatives: 'activeUsers',
          },
        },
      ],
    },
    {
      code: 'const disabledFeatures = features.filter(f => f.disabled);',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disabledFeatures',
            alternatives: 'enabledFeatures',
          },
        },
      ],
    },

    // Invalid method definitions
    {
      code: `
      class Service {
        disableAccount(userId: string) {
          // implementation
        }

        isNotActive() {
          return !this.active;
        }
      }
      `,
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disableAccount',
            alternatives: 'enableAccount',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'isNotActive',
            alternatives: 'isActive',
          },
        },
      ],
    },

    // Object method shorthand
    {
      code: 'const obj = { isNotValid() { return false; } };',
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

    // Function parameters
    {
      code: 'function process(invalidData, disabledFeatures) { return true; }',
      errors: [
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'invalidData',
            alternatives: 'isValid',
          },
        },
        {
          messageId: 'avoidNegativeNaming',
          data: {
            name: 'disabledFeatures',
            alternatives: 'enabledFeatures',
          },
        },
      ],
    },

    // Additional prefix patterns
    {
      code: 'const shouldNotProceed = condition;',
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
      code: 'const willNotWork = condition;',
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
      code: 'const doesNotExist = condition;',
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
