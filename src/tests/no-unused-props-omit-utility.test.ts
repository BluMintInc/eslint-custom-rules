import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-unused-props with Omit utility type', noUnusedProps, {
  valid: [
    {
      // This test case reproduces the scenario from the bug report
      // where Omit<TeamFiltersProps, 'userId'> is used in MyTeamFilterProps
      code: `
        export type TeamFiltersProps = {
          phase: TournamentPhase;
          tournamentId: string;
          isWaitlistActive: boolean;
          userId: Loadable<string> | null;
        };

        export type MyTeamFilterProps = Omit<TeamFiltersProps, 'userId'> & {
          teamId: string;
        };

        const MyTeamFilter = ({
          phase,
          tournamentId,
          isWaitlistActive,
          teamId,
        }: MyTeamFilterProps) => {
          return (
            <div>
              <span>Phase: {phase}</span>
              <span>Tournament ID: {tournamentId}</span>
              <span>Waitlist Active: {isWaitlistActive ? 'Yes' : 'No'}</span>
              <span>Team ID: {teamId}</span>
            </div>
          );
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      // Test with multiple utility types combined
      code: `
        type BaseProps = {
          id: string;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
        };

        type DisplayProps = Omit<Partial<BaseProps>, 'createdAt' | 'updatedAt'> & {
          showDetails: boolean;
        };

        const DisplayComponent = ({
          id,
          name,
          description,
          showDetails,
        }: DisplayProps) => {
          return (
            <div>
              {id && <span>ID: {id}</span>}
              {name && <span>Name: {name}</span>}
              {showDetails && description && <p>{description}</p>}
            </div>
          );
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
    {
      code: `
        type BaseProps = { keep: string; omit: number };
        type Props = Omit<BaseProps & { extra: boolean }, 'omit'>;

        const Component = ({ keep, extra }: Props) => {
          return (
            <div>
              {keep}
              {extra ? 'y' : 'n'}
            </div>
          );
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
  invalid: [
    {
      code: `
        import type { ExternalProps } from './external';

        type Props = Omit<ExternalProps, 'disabled'> & {
          disabled: boolean;
          label: string;
        };

        const Component = ({ disabled, label }: Props) => {
          return <div>{label}{disabled ? 'on' : 'off'}</div>;
        };
      `,
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: '...ExternalProps' },
        },
      ],
    },
  ],
});
