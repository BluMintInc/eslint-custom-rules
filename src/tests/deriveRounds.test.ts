import { noUndefinedNullPassthrough } from '../rules/no-undefined-null-passthrough';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-undefined-null-passthrough-deriveRounds', noUndefinedNullPassthrough, {
  valid: [],
  invalid: [
    // Test case for deriveRounds function with multiple parameters
    {
      code: `
export const deriveRounds = (
  type: CohortRoundVariant,
  rounds?: Record<string, RoundCohort>,
) => {
  if (!rounds) {
    return; // This implicitly returns undefined but isn't being flagged
  }

  // Rest of the function that returns a sorted array of RoundCohort objects
  return Object.entries(rounds)
    .reduce<RoundCohort[]>((acc, [key, round]) => {
      if (decideRoundVariant(key) === type) {
        acc.push(round);
      }
      return acc;
    }, [])
    .sort((a, b) => {
      return sortCohortRounds({
        aIndex: a.roundIndex,
        bIndex: b.roundIndex,
      });
    });
};`,
      errors: [{ messageId: 'unexpected' }],
    },
  ],
});
