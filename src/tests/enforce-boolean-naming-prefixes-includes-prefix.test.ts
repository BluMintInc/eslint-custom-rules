import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-includes-prefix',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report
      `
      export type DoubleEliminationSettings = {
        [K in keyof MultiBracketSettings]: Omit<
          MultiBracketSettings[K],
          'includesRedemption' | 'maxTeamsPerMatch'
        > & {
          includesRedemption?: boolean;
          maxTeamsPerMatch: MaxTeamsPerMatchCohort;
        };
      };
      `,
      // Additional test cases with 'includes' prefix
      `
      interface ContentSettings {
        includesImages: boolean;
        includesVideos?: boolean;
      }
      `,
      `
      const includesAdmin = users.some(user => user.role === 'admin');
      `,
      `
      function includesRestricted(items: string[]): boolean {
        return items.some(item => restrictedItems.has(item));
      }
      `,
      `
      class ContentFilter {
        includesKeyword(text: string): boolean {
          return this.keywords.some(keyword => text.includes(keyword));
        }
      }
      `,
    ],
    invalid: [
      // Should still flag other boolean variables without approved prefixes
      {
        code: `
        const redemption = true;
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'redemption',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts, includes',
            },
          },
        ],
      },
    ],
  },
);
