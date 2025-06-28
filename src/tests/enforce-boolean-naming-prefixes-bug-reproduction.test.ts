import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// This test specifically reproduces and verifies the fix for the bug mentioned in the issue
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-bug-reproduction',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // The exact code from the bug report should now pass
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
    ],
    invalid: [],
  },
);
