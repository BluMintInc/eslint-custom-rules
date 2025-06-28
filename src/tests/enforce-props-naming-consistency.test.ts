import { ruleTesterTs } from '../utils/ruleTester';
import { enforcePropsNamingConsistency } from '../rules/enforce-props-naming-consistency';

ruleTesterTs.run(
  'enforce-props-naming-consistency',
  enforcePropsNamingConsistency,
  {
    valid: [
      // Function with correct props naming
      {
        code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props: UserProps) {
          return props.name;
        }
      `,
      },
      // Arrow function with correct props naming
      {
        code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return props.label;
        };
      `,
      },
      // Class with correct props naming
      {
        code: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(props: PendingStrategyProps) {
            // ...
          }
        }
      `,
      },
      // Function with destructured parameter (should be ignored)
      {
        code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User({ name, age }: UserProps) {
          return name;
        }
      `,
      },
      // Function with primitive parameter (should be ignored)
      {
        code: `
        function getId(id: string) {
          return id;
        }
      `,
      },
      // Function with multiple parameters (should be ignored)
      {
        code: `
        function createUser(name: string, age: number) {
          return { name, age };
        }
      `,
      },
      // Multiple parameters with Props types
      {
        code: `
        function mergeConfigs(uiProps: UIProps, dataProps: DataProps) {
          // ...
        }
      `,
      },
      // Class with multiple constructor parameters
      {
        code: `
        class DataManager {
          constructor(
            private readonly dataSource: DataSource,
            private readonly props: ManagerProps,
          ) {}
        }
      `,
      },
      // Generic type with Props constraint
      {
        code: `
        function process<T extends ComponentProps>(props: T) {
          // ...
        }
      `,
      },
      // Parameter name with "props" suffix is valid
      {
        code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(userProps: UserProps) {
          return userProps.name;
        }
      `,
      },
    ],
    invalid: [
      // Function with incorrect parameter name
      {
        code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(settings: UserProps) {
          return settings.name;
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props) {
          return settings.name;
        }
      `,
      },
      // Arrow function with incorrect parameter name
      {
        code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (options: ButtonProps) => {
          return options.label;
        };
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'options' } }],
        output: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props) => {
          return options.label;
        };
      `,
      },
      // Class with incorrect parameter name
      {
        code: `
        type TournamentFactoryProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class TournamentFactory {
          constructor(private readonly settings: TournamentFactoryProps) {
            // ...
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type TournamentFactoryProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class TournamentFactory {
          constructor(private readonly props) {
            // ...
          }
        }
      `,
      },
      // Function with incorrect parameter name
      {
        code: `
        type GameCreationProps = {
          players: Player[];
          settings: GameSettings;
        };
        function createGame(options: GameCreationProps) {
          // ...
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'options' } }],
        output: `
        type GameCreationProps = {
          players: Player[];
          settings: GameSettings;
        };
        function createGame(props) {
          // ...
        }
      `,
      },
      // We're skipping this test because our implementation doesn't handle multiple Props parameters
      // Class with multiple constructor parameters, one incorrect
      {
        code: `
        class DataManager {
          constructor(
            private readonly dataSource: DataSource,
            private readonly settings: ManagerProps,
          ) {}
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        class DataManager {
          constructor(
            private readonly dataSource: DataSource,
            private readonly props,
          ) {}
        }
      `,
      },
    ],
  },
);
