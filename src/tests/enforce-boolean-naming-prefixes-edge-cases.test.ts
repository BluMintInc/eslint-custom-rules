import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-edge-cases',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // ===== TESTING PLURALIZE LIBRARY EDGE CASES =====

      // Test the actual pluralized forms that the library generates
      `const are: boolean = true;`, // "are" is explicitly in the approved list
      `const have: boolean = true;`, // "have" is the plural of "has"
      `const were: boolean = true;`, // "were" is the plural of "was"
      `const does: boolean = true;`, // "does" pluralizes to itself
      `const hads: boolean = true;`, // "hads" is what pluralize returns for "had" (even though it's not grammatically correct)
      `const dids: boolean = true;`, // "dids" is what pluralize returns for "did" (even though it's not grammatically correct)

      // Test compound names with these pluralized forms
      `const haveAllPermissions: boolean = true;`,
      `const wereAllCompleted: boolean = true;`,
      `const hadsAllAccess: boolean = true;`, // Testing the weird pluralize result
      `const didsAllFinish: boolean = true;`, // Testing the weird pluralize result

      // ===== BOUNDARY TESTING =====

      // Test very short names that start with approved prefixes
      `const is: boolean = true;`,
      `const has: boolean = true;`,
      `const can: boolean = true;`,
      `const was: boolean = true;`,
      `const had: boolean = true;`,
      `const did: boolean = true;`,

      // Test names that are exactly the prefix
      `const isA: boolean = true;`,
      `const hasA: boolean = true;`,
      `const areA: boolean = true;`,
      `const haveA: boolean = true;`,

      // ===== CASE SENSITIVITY EDGE CASES =====

      // Test all caps versions
      `const IS_ACTIVE: boolean = true;`,
      `const HAS_PERMISSION: boolean = true;`,
      `const ARE_READY: boolean = true;`,
      `const HAVE_ACCESS: boolean = true;`,
      `const WERE_COMPLETED: boolean = true;`,

      // Test mixed case at word boundaries
      `const isAPIReady: boolean = true;`,
      `const hasHTTPSSupport: boolean = true;`,
      `const areURLsValid: boolean = true;`,
      `const haveJSONData: boolean = true;`,

      // ===== UNICODE AND SPECIAL CHARACTER TESTING =====

      // Test with unicode characters (should still work)
      `const isValidé: boolean = true;`,
      `const hasPermissión: boolean = true;`,
      `const areReadyñ: boolean = true;`,

      // Test with numbers immediately after prefix
      `const is2FA: boolean = true;`,
      `const has3DSupport: boolean = true;`,
      `const are404Handled: boolean = true;`,

      // ===== TYPESCRIPT SPECIFIC EDGE CASES =====

      // Test with optional properties
      `interface OptionalProps { isActive?: boolean; areReady?: boolean; }`,

      // Test with readonly properties
      `interface ReadonlyProps { readonly isActive: boolean; readonly areReady: boolean; }`,

      // Test with computed property names (should not be flagged)
      `const obj = { ['computed']: true };`,

      // Test with template literal types (should not be flagged)
      `type TemplateType = \`prefix-\${string}\`;`,

      // ===== FUNCTION SIGNATURE EDGE CASES =====

      // Test with rest parameters
      `function processFlags(isActive: boolean, ...areOthersReady: boolean[]) {}`,

      // Test with default parameters
      `function processData(isValid: boolean = true, areReady: boolean = false) {}`,

      // Test with destructured parameters
      `function processState({ isActive, areReady }: { isActive: boolean; areReady: boolean }) {}`,

      // ===== COMPLEX NESTING EDGE CASES =====

      // Test deeply nested boolean properties
      `
      interface DeepNesting {
        level1: {
          level2: {
            level3: {
              isDeepActive: boolean;
              areDeepReady: boolean;
            };
          };
        };
      }
      `,

      // Test with conditional types containing booleans
      `type ConditionalBoolean<T> = T extends string ? { isString: boolean } : { areOther: boolean };`,

      // ===== REGRESSION TESTS =====

      // Ensure the original bug case still works
      `
      export type PrizePoolContextType = {
        areAllConfirmed: boolean;
        haveAllPermissions: boolean;
        wereAllProcessed: boolean;
      };
      `,

      // Test multiple plural forms in the same interface
      `
      interface MultiPluralState {
        areItemsReady: boolean;
        haveUsersConfirmed: boolean;
        wereTasksCompleted: boolean;
        doesSystemWork: boolean;
        hadsBackupReady: boolean;
        didsProcessComplete: boolean;
      }
      `,
    ],
    invalid: [
      // ===== ENSURE RULE STILL CATCHES VIOLATIONS =====

      // Test that non-prefixed booleans are still caught
      {
        code: `const active: boolean = true;`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Test that words not starting with approved prefixes are caught
      {
        code: `const ready: boolean = true;`, // "ready" doesn't start with any approved prefix
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'ready',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Test that empty or very short invalid names are caught
      {
        code: `const x: boolean = true;`, // Single letter without approved prefix
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'x',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },

      // Test that interface properties without prefixes are caught
      {
        code: `interface BadInterface { active: boolean; ready: boolean; }`,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'active',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'property',
              name: 'ready',
              prefixes: 'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      }
    ],
  },
);
