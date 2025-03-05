import { classMethodsReadTopToBottom } from '../rules/class-methods-read-top-to-bottom';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * Tests for the bug where methods with similar names are incorrectly treated as duplicates
 */

ruleTesterTs.run(
  'class-methods-read-top-to-bottom-similar-names',
  classMethodsReadTopToBottom,
  {
    valid: [
      {
        code: `
        export abstract class Pairer<TSettings extends RoundSettingsStandard> {
          constructor(protected readonly params: PairerProps<TSettings>) {}

          @Memoize()
          public get nextMatches() {
            if (this.matchesPrevious.length <= 1) {
              return;
            }
            return this.nextMatchesWithPreviousIds.map(
              ({ results, ...rest }, index) => {
                const matchFactory = new MatchFactory({
                  settings: this.settingsNext,
                  results,
                });
                return matchFactory.buildMatch({
                  ...rest,
                  name: toMatchName(index, this.matchCount > 1),
                });
              },
            );
          }

          @Memoize()
          protected get nextMatchesWithPreviousIds() {
            return this.nextMatchesWithResults.map(({ resultsNew, ...rest }) => {
              const teamIds = resultsNew.map(({ parent: { team: { id } } }) => id);
              const previousIds =
                teamIds.length === 0 ? [] : this.findPreviousMatchIds(teamIds);
              return {
                ...rest,
                results: resultsNew,
                previousIds,
              };
            });
          }

          @Memoize()
          protected get nextMatchesWithResults() {
            const distributor = new TeamDistributor({
              numberOfMatches: this.matchCount,
              scoredMatchesPrevious: this.scoredMatches,
              isLoserPairing: this.pairingMethod === 'loser',
            });
            return distributor.nextMatches;
          }
        }`,
      },
    ],
    invalid: [],
  },
);
