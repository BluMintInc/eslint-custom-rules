import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-getters',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Getters with proper boolean prefixes and explicit return types
      `
      class User {
        get isActive(): boolean {
          return this.status === 'active';
        }
      }
      `,
      `
      class User {
        get hasPermission(): boolean {
          return this.role === 'admin';
        }
      }
      `,
      `
      class User {
        get canEdit(): boolean {
          return this.permissions.includes('edit');
        }
      }
      `,

      // Getters with proper boolean prefixes without explicit return types
      `
      class User {
        get isActive() {
          return this.status === 'active';
        }
      }
      `,
      `
      class User {
        get hasPermission() {
          return this.role === 'admin';
        }
      }
      `,
      `
      class User {
        get canEdit() {
          return this.permissions.includes('edit');
        }
      }
      `,

      // Getters returning boolean literals
      `
      class Config {
        get isDebugMode() {
          return true;
        }
      }
      `,
      `
      class Config {
        get hasFeature() {
          return false;
        }
      }
      `,

      // Getters with logical expressions
      `
      class User {
        get isVerified() {
          return this.emailVerified && this.phoneVerified;
        }
      }
      `,
      `
      class User {
        get hasAccess() {
          return this.isAdmin || this.hasPermission;
        }
      }
      `,

      // Getters with unary expressions
      `
      class User {
        get isNotBlocked() {
          return !this.blocked;
        }
      }
      `,

      // Getters with function calls that return boolean
      `
      class User {
        get isAuthenticated() {
          return checkAuth();
        }
      }
      `,
      `
      class User {
        get hasValidToken() {
          return validateToken();
        }
      }
      `,

      // Getters with member expressions that return boolean
      `
      class User {
        get isOnline() {
          return this.connection.isActive;
        }
      }
      `,
      `
      class User {
        get hasNotifications() {
          return this.notifications.hasUnread;
        }
      }
      `,

      // Getters with ternary operators returning boolean values
      `
      class User {
        get isEligible() {
          return this.age >= 18 ? true : false;
        }
      }
      `,

      // Getters that don't return booleans should not be flagged
      `
      class User {
        get name() {
          return this.firstName + ' ' + this.lastName;
        }
      }
      `,
      `
      class User {
        get age() {
          return this.calculateAge();
        }
      }
      `,
      `
      class User {
        get profile() {
          return { name: this.name, age: this.age };
        }
      }
      `,

      // Getters with mixed return types should not be flagged
      `
      class User {
        get status() {
          if (this.isDeleted) return false;
          if (this.isPending) return 'pending';
          return this.isActive;
        }
      }
      `,

      // Getters with underscore prefixes (private/internal) should be allowed
      `
      class User {
        get _isInternal() {
          return this.internal === true;
        }
      }
      `,

      // Setters should not be checked for getter naming (they don't return values)
      // Note: The parameter 'value' will still be flagged by the existing boolean parameter rule
      `
      class User {
        set active(isActive: boolean) {
          this.status = isActive ? 'active' : 'inactive';
        }
      }
      `,

      // Multiple getters in the same class
      `
      class User {
        get isActive() {
          return this.status === 'active';
        }

        get hasPermissions() {
          return this.permissions.length > 0;
        }

        get canEdit() {
          return this.role === 'editor' || this.role === 'admin';
        }

        get name() {
          return this.firstName + ' ' + this.lastName;
        }
      }
      `,

      // Getters in different class contexts
      `
      abstract class BaseUser {
        abstract get isValid(): boolean;
      }
      `,
      `
      interface UserInterface {
        get isActive(): boolean;
      }
      `,

      // Getters with complex boolean expressions
      `
      class User {
        get isEligibleForUpgrade() {
          return this.subscription?.tier !== 'premium' &&
                 this.account.isActive &&
                 this.payments.isUpToDate;
        }
      }
      `,

      // Getters with comparison operators
      `
      class User {
        get isAdult() {
          return this.age >= 18;
        }
      }
      `,
      `
      class User {
        get hasRecentActivity() {
          return this.lastLogin > Date.now() - 86400000;
        }
      }
      `,

      // Getters with inequality operators
      `
      class User {
        get isNotGuest() {
          return this.role !== 'guest';
        }
      }
      `,

      // Getters with all approved prefixes
      `
      class User {
        get isActive() { return true; }
        get hasPermission() { return true; }
        get doesExist() { return true; }
        get canEdit() { return true; }
        get shouldRefresh() { return true; }
        get willUpdate() { return true; }
        get wasSuccessful() { return true; }
        get hadAccess() { return true; }
        get didComplete() { return true; }
        get wouldBenefit() { return true; }
        get mustValidate() { return true; }
        get allowsEditing() { return true; }
        get supportsFeature() { return true; }
        get needsUpdate() { return true; }
        get assertsValid() { return true; }
      }
      `,
    ],
    invalid: [
      // Getters with explicit boolean return types but bad names
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
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
        class User {
          get admin(): boolean {
            return this.role === 'admin';
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'admin',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters without explicit return types but returning boolean expressions
      {
        code: `
        class User {
          get active() {
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
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `
        class User {
          get verified() {
            return this.emailVerified && this.phoneVerified;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'verified',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters returning boolean literals
      {
        code: `
        class Config {
          get debugMode() {
            return true;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'debugMode',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with logical expressions
      {
        code: `
        class User {
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
              name: 'premium',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with unary expressions
      {
        code: `
        class User {
          get notBlocked() {
            return !this.blocked;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'notBlocked',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with function calls that return boolean
      {
        code: `
        class User {
          get authenticated() {
            return checkAuth();
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'authenticated',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with member expressions that return boolean
      {
        code: `
        class User {
          get online() {
            return this.connection.isActive;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'online',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with ternary operators returning boolean values
      {
        code: `
        class User {
          get eligible() {
            return this.age >= 18 ? true : false;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'eligible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Multiple getters with bad names in the same class
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

          get name() {
            return this.firstName + ' ' + this.lastName;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'admin',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'verified',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with comparison operators
      {
        code: `
        class User {
          get adult() {
            return this.age >= 18;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'adult',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Getters with inequality operators
      {
        code: `
        class User {
          get notGuest() {
            return this.role !== 'guest';
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'notGuest',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Complex boolean expressions
      {
        code: `
        class User {
          get eligibleForUpgrade() {
            return this.subscription?.tier !== 'premium' &&
                   this.account.isActive &&
                   this.payments.isUpToDate;
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'eligibleForUpgrade',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
