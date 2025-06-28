import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-comprehensive',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // ===== EXTERNAL API FOCUSED TESTS (from HEAD - issue #628 fix) =====

      // Core case: useMemo with external API (the main bug report case)
      `
      import { Thread } from 'stream-chat-react';
      import { useMemo } from 'react';

      function ChatComponent() {
        const messageInputProps = useMemo(() => ({
          grow: true,  // Should be allowed - external API
          additionalTextareaProps: {},
        }), []);

        return Thread({ additionalMessageInputProps: messageInputProps });
      }
      `,

      // Core case: Direct object literal passed to external function
      `
      import { ExternalLib } from 'external-lib';

      function Component() {
        return ExternalLib({
          active: true,  // Should be allowed - external API
          visible: false,
        });
      }
      `,

      // Core case: Variable assigned and used with external API
      `
      import { ExternalLib } from 'external-lib';

      function Component() {
        const config = {
          enabled: true,  // Should be allowed - external API
          disabled: false,
        };

        return ExternalLib(config);
      }
      `,

      // Edge case: Multiple external libraries
      `
      import { LibA, LibB } from 'external-lib';

      function Component() {
        const configA = { active: true };
        const configB = { visible: false };

        return {
          a: LibA(configA),
          b: LibB(configB),
        };
      }
      `,

      // Edge case: Member expression external API calls
      `
      import * as ExternalLib from 'external-lib';

      function Component() {
        const config = { enabled: true };
        return ExternalLib.create(config);
      }
      `,

      // ===== PLURAL FORMS TESTING (from origin) =====

      // "are" prefix (plural of "is") - the main bug case
      `
      export type PrizePoolContextType = {
        areAllConfirmed: boolean;
      };
      `,
      `const areUsersOnline: boolean = true;`,
      `function areItemsAvailable(): boolean { return true; }`,
      `interface SystemStatus { areServicesRunning: boolean; }`,
      `class StatusChecker { areComponentsInitialized: boolean = false; }`,
      `const checkStatus = (areAllReady: boolean) => {};`,

      // "have" prefix (plural of "has")
      `const havePermissions: boolean = true;`,
      `function haveAccess(): boolean { return true; }`,
      `interface UserState { haveSubscriptions: boolean; }`,
      `class UserManager { haveActiveUsers: boolean = false; }`,
      `const validateUsers = (haveValidCredentials: boolean) => {};`,

      // "were" prefix (plural of "was")
      `const wereSuccessful: boolean = true;`,
      `function wereCompleted(): boolean { return true; }`,
      `interface TaskState { wereFinished: boolean; }`,
      `class TaskManager { wereAllProcessed: boolean = false; }`,
      `const checkTasks = (wereAllDone: boolean) => {};`,

      // ===== CASE SENSITIVITY TESTING =====

      // Mixed case variations of "are"
      `const AreAllConfirmed: boolean = true;`,
      `const areAllConfirmed: boolean = true;`,
      `const ARE_ALL_CONFIRMED: boolean = true;`,

      // Mixed case variations of other plural forms
      `const HavePermissions: boolean = true;`,
      `const WereSuccessful: boolean = true;`,

      // ===== COMPOUND NAMES TESTING =====

      // Complex compound names with plural prefixes
      `const areAllItemsValidAndReady: boolean = true;`,
      `const haveUsersConfirmedTheirEmails: boolean = true;`,
      `const wereAllTasksCompletedSuccessfully: boolean = true;`,

      // ===== CONTEXT-SPECIFIC TESTING =====

      // Variables in different scopes
      `
      function processData() {
        const areAllValid: boolean = true;
        let havePermissions: boolean = false;
        var wereProcessed: boolean = true;
      }
      `,

      // Arrow functions with plural prefixes
      `const areReady = (): boolean => true;`,
      `const haveAccess = (user: any): boolean => checkUser(user);`,
      `const wereCompleted = () => { return true as boolean; };`,

      // Method definitions with plural prefixes
      `
      class DataProcessor {
        areAllValid(): boolean { return true; }
        havePermissions(): boolean { return true; }
        wereProcessed(): boolean { return true; }
      }
      `,

      // Object properties with plural prefixes
      `const config = { areEnabled: true, haveFeatures: false, wereInitialized: true };`,

      // ===== TYPE DEFINITIONS TESTING =====

      // Interface properties with plural prefixes
      `
      interface ComplexState {
        areAllItemsLoaded: boolean;
        haveUsersLoggedIn: boolean;
        wereTasksCompleted: boolean;
      }
      `,

      // Type aliases with plural prefixes
      `
      type SystemFlags = {
        areServicesOnline: boolean;
        haveBackupsReady: boolean;
        wereUpdatesApplied: boolean;
      };
      `,

      // ===== FUNCTION PARAMETERS TESTING =====

      // Function parameters with plural prefixes
      `function processItems(areAllValid: boolean, havePermissions: boolean, wereProcessed: boolean) {}`,
      `const handleData = (areReady: boolean, haveAccess: boolean) => {};`,
      `
      function areAllItemsValid(
        areAllItemsValid: boolean,
        haveUsersConfirmed: boolean,
        wereTasksCompleted: boolean
      ): boolean {
        return areAllItemsValid && haveUsersConfirmed && wereTasksCompleted;
      }
      `,

      // ===== DESTRUCTURING TESTING =====

      // Destructuring with plural prefixes
      `const { areEnabled, haveFeatures } = config;`,
      `const { areAllReady, havePermissions, wereCompleted } = state;`,

      // ===== EDGE CASES WITH SIMILAR WORDS =====

      // Words that start with "are" but aren't the prefix
      `const area: number = 100;`, // "area" should not be flagged as boolean
      `const arena: string = "stadium";`, // "arena" should not be flagged

      // Words that start with "have" but aren't the prefix
      `const haven: string = "safe place";`, // "haven" should not be flagged
      `const harvest: number = 2023;`, // "harvest" should not be flagged

      // Words that start with plural prefixes but are boolean (should be allowed)
      `const arena: boolean = true;`, // "arena" starts with "are" so it's valid
      `const haven: boolean = true;`, // "haven" starts with "have" so it's valid

      // ===== EXISTING SINGULAR PREFIXES (regression testing) =====

      // Ensure all original prefixes still work
      `const isActive: boolean = true;`,
      `const hasPermission: boolean = true;`,
      `const doesExist: boolean = true;`,
      `const canEdit: boolean = true;`,
      `const shouldUpdate: boolean = true;`,
      `const willProcess: boolean = true;`,
      `const wasSuccessful: boolean = true;`,
      `const hadAccess: boolean = true;`,
      `const didComplete: boolean = true;`,
      `const wouldBenefit: boolean = true;`,
      `const mustValidate: boolean = true;`,
      `const allowsEditing: boolean = true;`,
      `const supportsVideo: boolean = true;`,
      `const needsRefresh: boolean = true;`,
      `const assertsValid: boolean = true;`,
      `const includesItem: boolean = true;`,

      // ===== COMPLEX TYPESCRIPT CONSTRUCTS =====

      // Generic types with plural prefixes
      `
      interface GenericState<T> {
        areItemsOfType: boolean;
        haveValidItems: boolean;
      }
      `,

      // Union types with plural prefixes
      `
      type StateFlags = {
        areReady: boolean;
      } | {
        haveErrors: boolean;
      };
      `,

      // Conditional types (should not be flagged)
      `type ConditionalType<T> = T extends string ? boolean : never;`,

      // ===== NESTED STRUCTURES =====

      // Deeply nested objects with plural prefixes
      `
      const deepConfig = {
        system: {
          status: {
            areAllServicesRunning: boolean = true,
            haveBackupsCompleted: boolean = false
          }
        }
      };
      `,

      // ===== ASYNC/AWAIT CONTEXTS =====

      // Async functions with plural prefixes
      `async function areAllReady(): Promise<boolean> { return true; }`,
      `const haveAccess = async (): Promise<boolean> => true;`,

      // ===== CLASS INHERITANCE =====

      // Inherited classes with plural prefixes
      `
      class BaseChecker {
        areValid: boolean = true;
      }

      class ExtendedChecker extends BaseChecker {
        havePermissions: boolean = false;

        wereProcessed(): boolean {
          return this.areValid && this.havePermissions;
        }
      }
      `,

      // ===== STATIC MEMBERS =====

      // Static properties and methods with plural prefixes
      `
      class StaticChecker {
        static areGloballyEnabled: boolean = true;
        static haveSystemAccess: boolean = false;

        static wereInitialized(): boolean {
          return StaticChecker.areGloballyEnabled;
        }
      }
      `,

      // ===== ADDITIONAL EDGE CASES =====

      // Test pluralize library edge cases that might be problematic
      `const hadsPermission: boolean = true;`, // "hads" is what pluralize returns for "had"
      `const didsComplete: boolean = true;`, // "dids" is what pluralize returns for "did"

      // Test boundary cases with prefix matching
      `const areNotReady: boolean = false;`, // "are" + "Not" should work
      `const haveNoAccess: boolean = false;`, // "have" + "No" should work
      `const wereNeverCompleted: boolean = false;`, // "were" + "Never" should work

      // Test with numbers and special characters
      `const are2Valid: boolean = true;`, // "are" + number
      `const have_access: boolean = true;`, // "have" + underscore
      `const were$processed: boolean = true;`, // "were" + special char

      // Test with very long compound names
      `const areAllItemsInTheSystemValidAndReadyForProcessing: boolean = true;`,
      `const haveAllUsersInTheOrganizationConfirmedTheirEmailAddresses: boolean = true;`,

      // Test with abbreviations and acronyms
      `const areAPIEndpointsReady: boolean = true;`,
      `const haveHTTPSCertificates: boolean = true;`,
      `const wereURLsValidated: boolean = true;`,
    ],
    invalid: [
      // ===== EXTERNAL API FOCUSED TESTS (from HEAD - should be invalid) =====

      // Should be invalid: Local usage without external API
      {
        code: `
        function Component() {
          const localConfig = {
            active: true,
            visible: false,
          };

          console.log(localConfig.active);
          return null;
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
              name: 'visible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: useMemo not used with external API
      {
        code: `
        import { useMemo } from 'react';

        function Component() {
          const config = useMemo(() => ({
            active: true,
            visible: false,
          }), []);

          console.log(config.active);
          return null;
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
              name: 'visible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should be invalid: Object passed to local function
      {
        code: `
        function localFunction(config: any) {
          return config;
        }

        function Component() {
          const config = {
            active: true,
            visible: false,
          };

          return localFunction(config);
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
              name: 'visible',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // ===== ENSURE NON-PREFIXED BOOLEANS ARE STILL FLAGGED =====

      // Variables without proper prefixes (should still be caught)
      {
        code: `const allConfirmed: boolean = true;`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'allConfirmed',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `const usersOnline: boolean = true;`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'usersOnline',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Functions without proper prefixes
      {
        code: `function allReady(): boolean { return true; }`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'allReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Interface properties without proper prefixes
      {
        code: `
        interface BadState {
          allConfirmed: boolean;
          usersReady: boolean;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'allConfirmed',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'usersReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Class properties without proper prefixes
      {
        code: `
        class BadChecker {
          allValid: boolean = true;
          usersReady: boolean = false;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'allValid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'usersReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Parameters without proper prefixes
      {
        code: `function processData(allValid: boolean, usersReady: boolean) {}`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'allValid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'parameter',
              name: 'usersReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // ===== EDGE CASES THAT SHOULD BE FLAGGED =====

      // Words that don't start with any approved prefix
      {
        code: `const ready: boolean = true;`, // "ready" doesn't start with any approved prefix
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'ready',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
      {
        code: `const valid: boolean = true;`, // "valid" doesn't start with any approved prefix
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

      // ===== CUSTOM PREFIX OPTIONS TESTING =====

      // Test that plural forms work with custom prefixes
      {
        code: `const areReady: boolean = true;`,
        options: [{ prefixes: ['can', 'should'] }],
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'areReady',
              prefixes: 'can, should',
            },
          },
        ],
      },

      // Test that custom prefixes still work normally
      {
        code: `const ready: boolean = true;`,
        options: [{ prefixes: ['is', 'are'] }],
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'ready',
              prefixes: 'is',
            },
          },
        ],
      },

      // ===== ADDITIONAL EDGE CASES FOR INVALID =====

      // Test complex compound names without proper prefixes
      {
        code: `const allItemsInSystemValidAndReady: boolean = true;`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'allItemsInSystemValidAndReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Test with numbers and special characters but no proper prefix
      {
        code: `const valid2Process: boolean = true;`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'valid2Process',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Test regular functions without proper prefixes (async functions returning Promise<boolean> are not flagged)
      {
        code: `function checkReady(): boolean { return true; }`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'function',
              name: 'checkReady',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Test generic types with boolean properties without proper prefixes
      {
        code: `
        interface GenericBadState<T> {
          ready: boolean;
          valid: boolean;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'ready',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'valid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
