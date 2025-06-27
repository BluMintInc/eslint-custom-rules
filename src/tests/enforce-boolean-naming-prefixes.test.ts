import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Variables with proper boolean prefixes
      'const isActive = true;',
      'const isUserLoggedIn = false;',
      'const hasCompleted = isTaskFinished();',
      'const canEdit = user.permissions.includes("edit");',
      'const shouldRefresh = needsUpdate();',
      'const willUpdate = condition;',
      'const wasSuccessful = operation.status === "success";',
      'const hadPermission = previousState.allowed;',
      'const didUpdate = checkUpdateStatus();',
      'const wouldBenefit = calculateBenefit() > threshold;',
      'const mustValidate = isRequired && !isValidated;',
      'const allowsEditing = checkPermission("edit");',
      'const supportsVideo = checkFeatures().video;',
      'const needsRefresh = isStale || isOutdated;',

      // Function parameters with proper boolean prefixes
      'function toggleFeature(isEnabled: boolean) { /* ... */ }',
      'function processUser(hasAccess: boolean, canModify: boolean) { /* ... */ }',
      'const handleSubmit = (isValid: boolean) => { /* ... */ };',

      // Class properties with proper boolean prefixes
      `
    class UserAccount {
      private isVerified = false;
      static isPremium = false;

      isAccountLocked(): boolean {
        return this.failedAttempts > 3;
      }
    }
    `,

      // Interface properties with proper boolean prefixes
      `
    interface UserState {
      isActive: boolean;
      hasSubscription: boolean;
      canAccessPremium: boolean;
    }
    `,

      // Type predicates (special case that should pass regardless)
      'function isString(value: any): value is string { return typeof value === "string"; }',
      'function isUser(obj: any): obj is User { return obj && obj.id && obj.name; }',
      'const isNumber = (val: any): val is number => typeof val === "number";',

      // Non-boolean variables should not be flagged
      'const name = "John";',
      'const count = 42;',
      'const users = ["user1", "user2"];',
      'function getName() { return "John"; }',
      'const getCount = () => 42;',
      'class User { getName() { return this.name; } }',

      // Object literal with boolean properties using approved prefixes
      'const settings = { isEnabled: true, hasFeature: false };',

      // Arrow functions returning boolean with approved prefixes
      'const isValid = () => true;',
      'const hasPermission = (user) => checkAccess(user);',

      // Function declarations returning boolean with approved prefixes
      'function isAuthorized(): boolean { return checkAuth(); }',
      'function canPerformAction(): boolean { return true; }',
    ],
    invalid: [
      // Variables without proper boolean prefixes
      {
        code: 'const active = true;',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: 'const userLoggedIn = false;',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'userLoggedIn',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: 'const completed = isTaskFinished();',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'completed',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Function parameters without proper boolean prefixes
      {
        code: 'function toggleFeature(enabled: boolean) { /* ... */ }',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: 'const handleSubmit = (valid: boolean) => { /* ... */ };',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'valid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Class properties without proper boolean prefixes
      {
        code: `
      class UserAccount {
        private verified = false;
        static premium = false;

        accountLocked(): boolean {
          return this.failedAttempts > 3;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'verified',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'premium',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'method',
              name: 'accountLocked',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Interface properties without proper boolean prefixes
      {
        code: `
      interface UserState {
        active: boolean;
        subscription: boolean;
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'subscription',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Object literal with boolean properties without approved prefixes
      {
        code: 'const settings = { enabled: true, feature: false };',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'feature',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Function declarations returning boolean without approved prefixes
      {
        code: 'function authorized(): boolean { return checkAuth(); }',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'authorized',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: 'function userExists(id: string): boolean { /* ... */ }',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'userExists',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Arrow functions returning boolean without approved prefixes
      {
        code: 'const valid = (): boolean => true;',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'valid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: 'const permission = (user): boolean => checkAccess(user);',
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'permission',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Custom prefixes test
      {
        code: 'const isActive = true;',
        options: [{ prefixes: ['has', 'can'] }],
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'isActive',
              prefixes: 'has, can',
            },
          },
        ],
      },
    ],
  },
);
