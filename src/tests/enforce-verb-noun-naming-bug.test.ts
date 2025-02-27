import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

ruleTesterTs.run('enforce-verb-noun-naming-bug', enforceVerbNounNaming, {
  valid: [
    // This should be valid because it's a React component with Unmemoized suffix
    {
      code: `/** @jsx jsx */
      const RegisteredTeamPanelUnmemoized = () => {
        return (
          <TournamentPanelV3
            Content={<DisbandTeamButton />}
            description={<RegisteredTeamEditing />}
            title={<RegisteredTeamPanelHeader />}
            wrapperSx={{ p: 4, maxWidth: MAX_TOURNAMENT_PANE_WIDTH, gap: 4 }}
          />
        );
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    // Test with memo pattern
    {
      code: `/** @jsx jsx */
      const RegisteredTeamPanelUnmemoized = () => {
        return <div>Team Panel</div>;
      };

      export const RegisteredTeamPanel = memo(RegisteredTeamPanelUnmemoized);`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
  invalid: [],
});
