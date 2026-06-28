export type CohortRoundVariant = 'BRACKET' | 'POOL';
export interface RoundCohort {
    roundIndex: number;
}
export declare const decideRoundVariant: (key: string) => CohortRoundVariant;
export declare const sortCohortRounds: ({ aIndex, bIndex, }: {
    aIndex: number;
    bIndex: number;
}) => number;
export declare const deriveRounds: (type: CohortRoundVariant, rounds?: Record<string, RoundCohort>) => RoundCohort[] | undefined;
