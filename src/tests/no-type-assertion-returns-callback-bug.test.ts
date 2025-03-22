import { ruleTesterTs } from '../utils/ruleTester';
import { noTypeAssertionReturns } from '../rules/no-type-assertion-returns';

ruleTesterTs.run('no-type-assertion-returns-callback-bug', noTypeAssertionReturns, {
  valid: [
    // Bug fix case: Type assertion inside a callback function (not in a return statement)
    `
    function findTournamentChannelGroup(tournamentIdToFind: string, channelGroupType: string) {
      return realtimeChannelGroups.find((channelGroup) => {
        const { groupFilter } =
          channelGroup as unknown as ChannelGroup<'Tournament'>;
        return groupFilter.find(({ type, tournamentId }) => {
          return (
            type === channelGroupType && tournamentId === tournamentIdToFind
          );
        });
      });
    }
    `,
  ],
  invalid: [],
});
