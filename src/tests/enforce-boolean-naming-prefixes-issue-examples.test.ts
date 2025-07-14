import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// Test the specific examples from the GitHub issue
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-issue-examples',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Good examples from the issue
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

      // Edge case: Getters that don't return booleans should not be flagged
      `
      class User {
        get name() {
          return this.firstName + ' ' + this.lastName; // String return - should not be flagged
        }

        get age() {
          return this.calculateAge(); // Number return - should not be flagged
        }

        get profile() {
          return { name: this.name, age: this.age }; // Object return - should not be flagged
        }
      }
      `,

      // Edge case: Getters with complex return logic (mixed types)
      `
      class User {
        get status() {
          if (this.isDeleted) return false; // Boolean
          if (this.isPending) return 'pending'; // String
          return this.isActive; // Boolean
        }

        get permissions() {
          return this.role === 'admin' ? true : this.explicitPermissions; // Mixed types
        }
      }
      `,

      // Edge case: Getters that are already correctly named
      `
      class User {
        get isActive() {
          return this.status === 'active'; // Already correct - should not be flagged
        }

        get hasPermission() {
          return this.permissions.length > 0; // Already correct - should not be flagged
        }
      }
      `,

      // Edge case: Getters with TypeScript type annotations
      `
      class User {
        get isActive(): boolean {
          return this.status === 'active'; // Explicit boolean return type
        }

        get name(): string {
          return this.firstName; // Explicit string return type - should not be flagged
        }

        get data(): unknown {
          return this.rawData; // Unknown type - should not be flagged
        }
      }
      `,

      // Edge case: Getters used for property access patterns (non-boolean)
      `
      class FeatureFlags {
        get theme() {
          return this.flags.theme || 'light'; // String fallback - should not be flagged
        }

        get config() {
          return this.settings.config || {}; // Object fallback - should not be flagged
        }
      }
      `,
    ],
    invalid: [
      // Bad examples from the issue
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

      // Additional edge cases that should be flagged
      {
        code: `
        class User {
          get authenticated() {
            return checkAuth(); // Function call that returns boolean
          }

          get online() {
            return this.connection.isActive; // Property access that returns boolean
          }

          get eligible() {
            return this.age >= 18 ? true : false; // Ternary with boolean values
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
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'getter',
              name: 'online',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
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
    ],
  },
);
