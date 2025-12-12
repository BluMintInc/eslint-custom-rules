import type { TSESLint } from '@typescript-eslint/utils';

import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

const defaultPrefixes =
  'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts';

type MessageArgs = {
  type: string;
  name: string;
  capitalizedName: string;
  prefixes: string;
};

const buildMessage = ({
  type,
  name,
  capitalizedName,
  prefixes,
}: MessageArgs) =>
  `Boolean ${type} "${name}" is missing a common approved boolean prefix (${prefixes}). ` +
  `Prefixes immediately communicate that the value is a true/false predicate; without one, checks like \`if (${name})\` read as generic truthiness guards and hide the boolean intent. ` +
  `Rename by prepending any approved prefix so the name becomes \`<prefix>${capitalizedName}\`, making the boolean contract obvious at call sites and API boundaries.`;

const buildError = (
  args: MessageArgs,
): TSESLint.TestCaseError<'missingBooleanPrefix'> =>
  ({
    message: buildMessage(args),
  } as unknown as TSESLint.TestCaseError<'missingBooleanPrefix'>);

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

      // Getters already using boolean prefixes
      `
    class User {
      get isActive() {
        return this.status === 'active';
      }

      get isAdmin() {
        return this.role === 'admin';
      }

      get isVerified() {
        return this.emailVerified && this.phoneVerified;
      }

      get hasPremium() {
        return this.subscription?.tier === 'premium';
      }
    }
    `,

      // Getters that return non-boolean values should not be flagged
      `
    class Profile {
      get name() {
        return this.firstName + ' ' + this.lastName;
      }

      get age() {
        return this.calculateAge();
      }

      get profile() {
        return { name: this.name, age: this.age };
      }
    }
    `,

      // Getter returning private non-boolean field should not imply boolean
      `
    class PrivateState {
      get name() {
        return this._name;
      }
    }
    `,

      // Getters with mixed return types are ignored
      `
    class UserWithStatus {
      get status() {
        if (this.isDeleted) return false;
        if (this.isPending) return 'pending';
        return this.isActive;
      }
    }
    `,

      // Underscore-prefixed getter is allowed
      `
    class FeatureFlags {
      get _enabled() {
        return !!this.flags.featureX;
      }
    }
    `,

      // Getter returning boolean but ignored when configured for overrides
      {
        code: `
    abstract class BaseEntity {
      abstract get active(): boolean;
    }

    class User extends BaseEntity {
      override get active() {
        return this.status === 'active';
      }
    }
    `,
        options: [{ ignoreOverriddenGetters: true }],
      },

      // Getter with explicit boolean annotation and prefix
      `
    class Account {
      get isLocked(): boolean {
        return this.failedAttempts > 3;
      }
    }
    `,
    ],
    invalid: [
      // Variables without proper boolean prefixes
      {
        code: 'const active = true;',
        errors: [
          buildError({
            type: 'variable',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const userLoggedIn = false;',
        errors: [
          buildError({
            type: 'variable',
            name: 'userLoggedIn',
            capitalizedName: 'UserLoggedIn',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const completed = isTaskFinished();',
        errors: [
          buildError({
            type: 'variable',
            name: 'completed',
            capitalizedName: 'Completed',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Function parameters without proper boolean prefixes
      {
        code: 'function toggleFeature(enabled: boolean) { /* ... */ }',
        errors: [
          buildError({
            type: 'parameter',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const handleSubmit = (valid: boolean) => { /* ... */ };',
        errors: [
          buildError({
            type: 'parameter',
            name: 'valid',
            capitalizedName: 'Valid',
            prefixes: defaultPrefixes,
          }),
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
          buildError({
            type: 'property',
            name: 'verified',
            capitalizedName: 'Verified',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'premium',
            capitalizedName: 'Premium',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'method',
            name: 'accountLocked',
            capitalizedName: 'AccountLocked',
            prefixes: defaultPrefixes,
          }),
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
          buildError({
            type: 'property',
            name: 'active',
            capitalizedName: 'Active',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'subscription',
            capitalizedName: 'Subscription',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Object literal with boolean properties without approved prefixes
      {
        code: 'const settings = { enabled: true, feature: false };',
        errors: [
          buildError({
            type: 'property',
            name: 'enabled',
            capitalizedName: 'Enabled',
            prefixes: defaultPrefixes,
          }),
          buildError({
            type: 'property',
            name: 'feature',
            capitalizedName: 'Feature',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: `
        const config = { enabled: true };

        if (config && extraCondition) {
          doSomething(config);
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'enabled',
              capitalizedName: 'Enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
        const flags = { visible: true };
        flags === otherConfig;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'visible',
              capitalizedName: 'Visible',
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
          buildError({
            type: 'function',
            name: 'authorized',
            capitalizedName: 'Authorized',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'function userExists(id: string): boolean { /* ... */ }',
        errors: [
          buildError({
            type: 'function',
            name: 'userExists',
            capitalizedName: 'UserExists',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Arrow functions returning boolean without approved prefixes
      {
        code: 'const valid = (): boolean => true;',
        errors: [
          buildError({
            type: 'variable',
            name: 'valid',
            capitalizedName: 'Valid',
            prefixes: defaultPrefixes,
          }),
        ],
      },
      {
        code: 'const permission = (user): boolean => checkAccess(user);',
        errors: [
          buildError({
            type: 'variable',
            name: 'permission',
            capitalizedName: 'Permission',
            prefixes: defaultPrefixes,
          }),
        ],
      },

      // Getters returning booleans without prefixes
      {
        code: `
      class User {
        get active() {
          return this.status === 'active';
        }

        get admin() {
          return this.role === 'admin';
        }

        get verified() {
          return this.emailVerified && this.phoneVerified;
        }

        get premium() {
          return this.subscription?.tier === 'premium';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'admin',
              capitalizedName: 'Admin',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'verified',
              capitalizedName: 'Verified',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'premium',
              capitalizedName: 'Premium',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class FeatureFlags {
        get enabled() {
          return true;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'enabled',
              capitalizedName: 'Enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class User {
        get active(): boolean {
          return this.status === 'active';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class Dictionary {
        map = {};

        get keyPresent() {
          return 'key' in this.map;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'keyPresent',
              capitalizedName: 'KeyPresent',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class Checker {
        value: unknown;

        get instance() {
          return this.value instanceof Error;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'instance',
              capitalizedName: 'Instance',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      class User {
        get trusted() {
          return this.isVerified ? this.isAdmin : this.isActive;
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'trusted',
              capitalizedName: 'Trusted',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
      abstract class Base {
        abstract get active(): boolean;
      }

      class User extends Base {
        override get active() {
          return this.status === 'active';
        }
      }
      `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              capitalizedName: 'Active',
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
          buildError({
            type: 'variable',
            name: 'isActive',
            capitalizedName: 'IsActive',
            prefixes: 'has, can',
          }),
        ],
      },
    ],
  },
);
