// No need to import AST_NODE_TYPES since we're not using it in this test
import { noUnusedProps } from '../rules/no-unused-props';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-unused-props with imported types', noUnusedProps, {
  valid: [
    {
      // This test case simulates the scenario from the bug report
      // where TeammateProps is imported and used in TeammateRowProps
      code: `
        import { Tournament } from './types';
        import { TeammateProps } from './teammate-types';
        import { TournamentPhase } from './enums';

        export type TeammateRowProps = Pick<Tournament, 'continuousRegistration'> &
          TeammateProps & {
            phase: TournamentPhase;
            checkIn: (entireTeam: boolean, userId?: string) => Promise<void>;
            isCaptain?: boolean;
            uninvite?: (userId: string) => Promise<void>;
          };

        const TeammateRow = ({
          name,
          avatar,
          userId,
          phase,
          checkIn,
          isCaptain,
          uninvite,
          continuousRegistration,
          ...rest
        }: TeammateRowProps) => {
          return (
            <div>
              <img src={avatar} alt={name} />
              <span>{name}</span>
              {isCaptain && <span>Captain</span>}
              <button onClick={() => checkIn(false, userId)}>Check In</button>
              {uninvite && <button onClick={() => uninvite(userId)}>Uninvite</button>}
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
      // Another test case with multiple imported types
      code: `
        import { ButtonProps } from './button-types';
        import { IconProps } from './icon-types';

        type CustomButtonProps = ButtonProps & IconProps & {
          label: string;
          variant?: 'primary' | 'secondary';
        };

        const CustomButton = ({
          onClick,
          disabled,
          size,
          color,
          name,
          label,
          variant = 'primary',
          ...rest
        }: CustomButtonProps) => {
          return (
            <button
              onClick={onClick}
              disabled={disabled}
              className={\`btn-\${size} \${color} \${variant}\`}
            >
              <Icon name={name} />
              {label}
            </button>
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
        import { ExternalProps } from './external';

        type Props = Partial<ExternalProps>;

        const Component = ({ ...rest }: Props) => {
          return <Widget {...rest} />;
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
  invalid: [],
});
