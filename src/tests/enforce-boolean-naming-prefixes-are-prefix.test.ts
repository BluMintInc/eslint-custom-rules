import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-are-prefix',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report
      `
      export type PrizePoolContextType = {
        areAllConfirmed: boolean;
      };
      `,
      // Additional test cases with "are" prefix
      `
      const areUsersOnline: boolean = true;
      `,
      `
      function areItemsAvailable(): boolean {
        return items.length > 0;
      }
      `,
      `
      interface SystemStatus {
        areServicesRunning: boolean;
      }
      `,
      `
      class StatusChecker {
        areComponentsInitialized: boolean = false;
      }
      `,
    ],
    invalid: [
      // Should still flag actual boolean variables without approved prefixes
      {
        code: `
        const allConfirmed: boolean = true;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'allConfirmed',
              capitalizedName: 'AllConfirmed',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
