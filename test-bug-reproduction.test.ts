import { noUnusedProps } from './src/rules/no-unused-props';
import { ruleTesterTs } from './src/utils/ruleTester';

// Test case to reproduce the exact bug from the issue
ruleTesterTs.run('no-unused-props bug reproduction', noUnusedProps, {
  valid: [
    {
      // This should be valid but might currently fail
      code: `
        export type TeamFiltersProps = {
          phase: string;
          tournamentId: string;
          isWaitlistActive: boolean;
          userId: string | null;
        };

        export type MyTeamFilterProps = Omit<TeamFiltersProps, 'userId'> & {
          teamId: string;
        };

        const MyTeamFilter = ({ phase, tournamentId, isWaitlistActive, teamId }: MyTeamFilterProps) => {
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
      // Test with Pick utility type
      code: `
        export type BaseProps = {
          id: string;
          name: string;
          description: string;
          createdAt: Date;
        };

        export type DisplayProps = Pick<BaseProps, 'id' | 'name'> & {
          showDetails: boolean;
        };

        const DisplayComponent = ({ id, name, showDetails }: DisplayProps) => {
          return (
            <div>
              <span>ID: {id}</span>
              <span>Name: {name}</span>
              {showDetails && <p>Details shown</p>}
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
      // Test with Partial utility type
      code: `
        export type ConfigProps = {
          theme: string;
          language: string;
          debug: boolean;
        };

        export type OptionalConfigProps = Partial<ConfigProps> & {
          onSave: () => void;
        };

        const ConfigComponent = ({ theme, language, debug, onSave }: OptionalConfigProps) => {
          return (
            <div>
              {theme && <span>Theme: {theme}</span>}
              {language && <span>Language: {language}</span>}
              {debug && <span>Debug mode</span>}
              <button onClick={onSave}>Save</button>
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
      // Test with Required utility type
      code: `
        export type UserProps = {
          id: string;
          name?: string;
          email?: string;
        };

        export type RequiredUserProps = Required<UserProps> & {
          role: string;
        };

        const UserComponent = ({ id, name, email, role }: RequiredUserProps) => {
          return (
            <div>
              <span>ID: {id}</span>
              <span>Name: {name}</span>
              <span>Email: {email}</span>
              <span>Role: {role}</span>
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
      // Test with nested utility types
      code: `
        export type BaseEntity = {
          id: string;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
        };

        export type EditableEntity = Omit<Partial<BaseEntity>, 'id' | 'createdAt'> & {
          onSave: (data: any) => void;
        };

        const EditableComponent = ({ name, description, updatedAt, onSave }: EditableEntity) => {
          return (
            <div>
              {name && <input value={name} />}
              {description && <textarea value={description} />}
              {updatedAt && <span>Last updated: {updatedAt.toString()}</span>}
              <button onClick={() => onSave({})}>Save</button>
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
      // This test case should trigger the bug if it exists
      // The issue mentions that "...Omit" is flagged as unused
      code: `
        export type TeamFiltersProps = {
          phase: string;
          tournamentId: string;
          isWaitlistActive: boolean;
          userId: string | null;
        };

        export type MyTeamFilterProps = Omit<TeamFiltersProps, 'userId'> & {
          teamId: string;
        };

        const MyTeamFilter = ({ phase, tournamentId, teamId }: MyTeamFilterProps) => {
          return (
            <div>
              <span>Phase: {phase}</span>
              <span>Tournament ID: {tournamentId}</span>
              <span>Team ID: {teamId}</span>
            </div>
          );
        };
      `,
      errors: [
        {
          messageId: 'unusedProp',
          data: { propName: 'isWaitlistActive' },
        },
      ],
      filename: 'test.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 2018,
        sourceType: 'module',
      },
    },
  ],
});
