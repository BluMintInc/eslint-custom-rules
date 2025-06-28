export type CohortRoundVariant = 'BRACKET' | 'POOL';

export interface RoundCohort {
  roundIndex: number;
  // other properties
}

export const decideRoundVariant = (key: string): CohortRoundVariant => {
  return key.includes('bracket') ? 'BRACKET' : 'POOL';
};

export const sortCohortRounds = ({
  aIndex,
  bIndex,
}: {
  aIndex: number;
  bIndex: number;
}) => {
  return aIndex - bIndex;
};

// This function has an implicit undefined return that should be detected by the rule
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
};
