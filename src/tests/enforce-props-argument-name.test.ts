import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforcePropsArgumentName } from '../rules/enforce-props-argument-name';

// Run non-JSX tests
ruleTesterTs.run('enforce-props-argument-name', enforcePropsArgumentName, {
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
    // Function with correct props naming and destructuring
    {
      code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props: UserProps) {
          const { name, age } = props;
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
    // Function with allowed exception
    {
      code: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(config: UserProps) {
          return config.name;
        }
      `,
      options: [{ allowedExceptions: ['config'] }],
    },
    // External interface implementation (should be ignored)
    {
      code: `
        interface ExternalInterface {
          configure(props: ConfigType): void;
        }
        class OurClass implements ExternalInterface {
          configure(props: ConfigType) {
            // ...
          }
        }
      `,
      options: [{ ignoreExternalInterfaces: true }],
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
        function User(config: UserProps) {
          return config.name;
        }
      `,
      errors: [{ messageId: 'usePropsForParameter', data: { paramName: 'config' } }],
      output: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props) {
          return config.name;
        }
      `,
    },
    // Class with incorrect parameter name
    {
      code: `
        type PendingStrategySettings = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(settings: PendingStrategySettings) {
            // ...
          }
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
        { messageId: 'usePropsForParameter', data: { paramName: 'settings' } },
        { messageId: 'usePropsForParameter', data: { paramName: 'settings' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Settings' } }
      ],
      output: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(props) {
            // ...
          }
        }
      `,
    },
    // Function with incorrect type suffix
    {
      code: `
        type AreQueuesEmptyParams = {
          videoPlatforms?: VideoPlatform[];
          projectId?: string;
        };
        function areQueuesEmpty(params: AreQueuesEmptyParams) {
          // ...
        }
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } },
        { messageId: 'usePropsForParameter', data: { paramName: 'params' } },
        { messageId: 'usePropsForType', data: { typeSuffix: 'Params' } }
      ],
      output: `
        type AreQueuesEmptyProps = {
          videoPlatforms?: VideoPlatform[];
          projectId?: string;
        };
        function areQueuesEmpty(props) {
          // ...
        }
      `,
    },
    // Type with incorrect suffix
    {
      code: `
        type AlgoliaLayoutConfig = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
      `,
      errors: [{ messageId: 'usePropsForType', data: { typeSuffix: 'Config' } }],
      output: `
        type AlgoliaLayoutProps = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
      `,
    },
  ],
});

// Run JSX tests
ruleTesterJsx.run('enforce-props-argument-name', enforcePropsArgumentName, {
  valid: [
    // React component with correct props naming
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return <button onClick={props.onClick}>{props.label}</button>;
        };
      `,
    },
    // React component with correct props naming and destructuring
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          const { label, onClick } = props;
          return <button onClick={onClick}>{label}</button>;
        };
      `,
    },
    // React class component with correct props naming
    {
      code: `
        type MyComponentProps = {
          title: string;
        };
        class MyComponent extends React.Component<MyComponentProps> {
          render() {
            return <div>{this.props.title}</div>;
          }
        }
      `,
    },
  ],
  invalid: [
    // React component with incorrect type suffix
    {
      code: `
        type AlgoliaLayoutConfig = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
        const AlgoliaLayout = ({ CatalogWrapper, configureOptions }: AlgoliaLayoutConfig) => {
          // ...
        };
      `,
      errors: [
        { messageId: 'usePropsForType', data: { typeSuffix: 'Config' } },
        { messageId: 'usePropsForParameter', data: { paramName: 'destructured object' } }
      ],
      options: [{ enforceDestructuring: true }],
      output: `
        type AlgoliaLayoutProps = {
          CatalogWrapper: RenderCatalogWrapper;
          configureOptions: Required<UseConfigureProps, 'filters'>;
        };
        const AlgoliaLayout = (props) => {
          // ...
        };
      `,
    },
  ],
});
