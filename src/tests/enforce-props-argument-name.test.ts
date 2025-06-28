import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { enforcePropsArgumentName } from '../rules/enforce-props-argument-name';

// Run non-JSX tests
ruleTesterTs.run('enforce-props-argument-name', enforcePropsArgumentName, {
  valid: [
    // Basic valid cases - correct props naming
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

    // Destructured parameters should be ignored
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
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = ({ label, onClick }: ButtonProps) => {
          return label;
        };
      `,
    },
    {
      code: `
        type ConfigProps = {
          setting1: string;
          setting2: number;
        };
        class MyClass {
          constructor({ setting1, setting2 }: ConfigProps) {
            // ...
          }
        }
      `,
    },

    // Non-Props types should be ignored
    {
      code: `
        function getId(id: string) {
          return id;
        }
      `,
    },
    {
      code: `
        type UserConfig = {
          name: string;
        };
        function configure(config: UserConfig) {
          return config.name;
        }
      `,
    },
    {
      code: `
        interface DatabaseConnection {
          host: string;
          port: number;
        }
        function connect(connection: DatabaseConnection) {
          // ...
        }
      `,
    },

    // Multiple parameters with non-Props types
    {
      code: `
        function createUser(name: string, age: number) {
          return { name, age };
        }
      `,
    },
    {
      code: `
        type UserConfig = { name: string };
        function processUser(id: string, config: UserConfig) {
          // ...
        }
      `,
    },

    // Functions without type annotations
    {
      code: `
        function process(data) {
          return data;
        }
      `,
    },
    {
      code: `
        const handler = (event) => {
          // ...
        };
      `,
    },

    // Generic Props types
    {
      code: `
        function process<T extends ComponentProps>(props: T) {
          return props;
        }
      `,
    },

    // Array destructuring
    {
      code: `
        type ArrayProps = [string, number];
        function process([first, second]: ArrayProps) {
          return first;
        }
      `,
    },

    // Rest parameters
    {
      code: `
        type ItemProps = { id: string };
        function process(...items: ItemProps[]) {
          return items;
        }
      `,
    },

    // Method signatures in interfaces
    {
      code: `
        interface Service {
          process(props: ServiceProps): void;
        }
      `,
    },

    // Private constructor parameters
    {
      code: `
        type ManagerProps = {
          config: Config;
        };
        class Manager {
          constructor(private readonly props: ManagerProps) {}
        }
      `,
    },

    // Multiple parameters where only one has Props type
    {
      code: `
        type UserProps = { name: string };
        function createUser(id: string, props: UserProps) {
          return { id, ...props };
        }
      `,
    },

    // Multiple Props parameters with correct naming
    {
      code: `
        type UIProps = { theme: string };
        type DataProps = { source: string };
        function mergeConfigs(uIProps: UIProps, dataProps: DataProps) {
          return { ...uIProps, ...dataProps };
        }
      `,
    },

    // Built-in Web API types should be whitelisted
    {
      code: `
        function parseQuery(params: URLSearchParams) {
          return Object.fromEntries(params.entries());
        }
      `,
    },
    {
      code: `
        function initializeAudio(options: AudioContextOptions) {
          return new AudioContext(options);
        }
      `,
    },
    {
      code: `
        function setupCanvas(settings: CanvasRenderingContext2DSettings) {
          // implementation
        }
      `,
    },
    {
      code: `
        function processPayment(options: PaymentRequestOptions) {
          // implementation
        }
      `,
    },
    // Node.js types should be whitelisted
    {
      code: `
        function readFile(options: ReadFileOptions) {
          // implementation
        }
      `,
    },
    {
      code: `
        function writeFile(options: WriteFileOptions) {
          // implementation
        }
      `,
    },
    // DOM types should be whitelisted
    {
      code: `
        function parseDOM(options: DOMParserOptions) {
          // implementation
        }
      `,
    },
    // TypeScript Compiler types should be whitelisted
    {
      code: `
        function compile(options: CompilerOptions) {
          // implementation
        }
      `,
    },
  ],

  invalid: [
    // Basic invalid cases - wrong parameter names for Props types
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
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'UserProps' },
        },
      ],
      output: `
        type UserProps = {
          name: string;
          age: number;
        };
        function User(props: UserProps) {
          return config.name;
        }
      `,
    },
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (settings: ButtonProps) => {
          return settings.label;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ButtonProps' },
        },
      ],
      output: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return settings.label;
        };
      `,
    },
    {
      code: `
        type PendingStrategyProps = {
          tournament: Tournament;
          match: MatchAggregated;
        };
        class PendingStrategy {
          constructor(settings: PendingStrategyProps) {
            // ...
          }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'PendingStrategyProps' },
        },
      ],
      output: `
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

    // Arrow functions
    {
      code: `
        type GameProps = { id: string };
        const createGame = (gameConfig: GameProps) => {
          return gameConfig.id;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'GameProps' },
        },
      ],
      output: `
        type GameProps = { id: string };
        const createGame = (props: GameProps) => {
          return gameConfig.id;
        };
      `,
    },

    // Function expressions
    {
      code: `
        type HandlerProps = { event: Event };
        const handler = function(eventData: HandlerProps) {
          return eventData.event;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'HandlerProps' },
        },
      ],
      output: `
        type HandlerProps = { event: Event };
        const handler = function(props: HandlerProps) {
          return eventData.event;
        };
      `,
    },

    // Multiple parameters with Props types
    {
      code: `
        type UIProps = { theme: string };
        type DataProps = { source: string };
        function mergeConfigs(uiSettings: UIProps, dataSettings: DataProps) {
          return { ...uiSettings, ...dataSettings };
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'UIProps', suggestedName: 'uIProps' },
        },
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'DataProps', suggestedName: 'dataProps' },
        },
      ],
      output: `
        type UIProps = { theme: string };
        type DataProps = { source: string };
        function mergeConfigs(uIProps: UIProps, dataProps: DataProps) {
          return { ...uiSettings, ...dataSettings };
        }
      `,
    },

    // Class with multiple constructor parameters
    {
      code: `
        type ManagerProps = { config: Config };
        class DataManager {
          constructor(
            dataSource: DataSource,
            settings: ManagerProps,
          ) {}
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: `
        type ManagerProps = { config: Config };
        class DataManager {
          constructor(
            dataSource: DataSource,
            props: ManagerProps,
          ) {}
        }
      `,
    },

    // Generic Props types - only if the generic type itself ends with Props
    {
      code: `
        function process<TProps extends ComponentProps>(data: TProps) {
          return data;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'TProps' },
        },
      ],
      output: `
        function process<TProps extends ComponentProps>(props: TProps) {
          return data;
        }
      `,
    },

    // Method signatures
    {
      code: `
        interface Service {
          process(data: ServiceProps): void;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ServiceProps' },
        },
      ],
      output: `
        interface Service {
          process(props: ServiceProps): void;
        }
      `,
    },

    // Edge case: Props type with different casing
    {
      code: `
        type userProps = { name: string };
        function createUser(userData: userProps) {
          return userData.name;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'userProps' },
        },
      ],
      output: `
        type userProps = { name: string };
        function createUser(props: userProps) {
          return userData.name;
        }
      `,
    },

    // Edge case: Just "Props" type
    {
      code: `
        type Props = { value: string };
        function render(data: Props) {
          return data.value;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'Props' },
        },
      ],
      output: `
        type Props = { value: string };
        function render(props: Props) {
          return data.value;
        }
      `,
    },

    // Complex type names
    {
      code: `
        type VeryLongComponentNameProps = { id: string };
        function process(componentData: VeryLongComponentNameProps) {
          return componentData.id;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'VeryLongComponentNameProps' },
        },
      ],
      output: `
        type VeryLongComponentNameProps = { id: string };
        function process(props: VeryLongComponentNameProps) {
          return componentData.id;
        }
      `,
    },

    // Nested class methods
    {
      code: `
        type ConfigProps = { setting: string };
        class OuterClass {
          method(config: ConfigProps) {}
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ConfigProps' },
        },
      ],
      output: `
        type ConfigProps = { setting: string };
        class OuterClass {
          method(props: ConfigProps) {}
        }
      `,
    },

    // Optional parameters
    {
      code: `
        type OptionalProps = { value?: string };
        function process(data?: OptionalProps) {
          return data?.value;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'OptionalProps' },
        },
      ],
      output: `
        type OptionalProps = { value?: string };
        function process(props?: OptionalProps) {
          return data?.value;
        }
      `,
    },

    // Mixed valid and invalid parameters
    {
      code: `
        type UserProps = { name: string };
        function createUser(id: string, userData: UserProps, callback: Function) {
          return callback({ id, ...userData });
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'UserProps' },
        },
      ],
      output: `
        type UserProps = { name: string };
        function createUser(id: string, props: UserProps, callback: Function) {
          return callback({ id, ...userData });
        }
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

    // React component with destructuring (should be ignored)
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = ({ label, onClick }: ButtonProps) => {
          return <button onClick={onClick}>{label}</button>;
        };
      `,
    },

    // React class component (doesn't apply to class components)
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

    // React component with correct props naming in function declaration
    {
      code: `
        type UserCardProps = {
          name: string;
          avatar: string;
        };
        function UserCard(props: UserCardProps) {
          return <div>{props.name}</div>;
        }
      `,
    },

    // React component with multiple parameters where one is Props
    {
      code: `
        type ComponentProps = { data: string };
        function Component(key: string, props: ComponentProps) {
          return <div key={key}>{props.data}</div>;
        }
      `,
    },

    // React component with non-Props types
    {
      code: `
        type ComponentConfig = { theme: string };
        const Component = (config: ComponentConfig) => {
          return <div className={config.theme}>Content</div>;
        };
      `,
    },
  ],

  invalid: [
    // React component with wrong parameter name
    {
      code: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (buttonConfig: ButtonProps) => {
          return <button onClick={buttonConfig.onClick}>{buttonConfig.label}</button>;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ButtonProps' },
        },
      ],
      output: `
        type ButtonProps = {
          label: string;
          onClick: () => void;
        };
        const Button = (props: ButtonProps) => {
          return <button onClick={buttonConfig.onClick}>{buttonConfig.label}</button>;
        };
      `,
    },

    // React function component with wrong parameter name
    {
      code: `
        type UserCardProps = {
          name: string;
          avatar: string;
        };
        function UserCard(userInfo: UserCardProps) {
          return <div>{userInfo.name}</div>;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'UserCardProps' },
        },
      ],
      output: `
        type UserCardProps = {
          name: string;
          avatar: string;
        };
        function UserCard(props: UserCardProps) {
          return <div>{userInfo.name}</div>;
        }
      `,
    },

    // React component with multiple Props parameters
    {
      code: `
        type UIProps = { theme: string };
        type DataProps = { items: Item[] };
        const Component = (uiConfig: UIProps, dataConfig: DataProps) => {
          return <div className={uiConfig.theme}>{dataConfig.items.length}</div>;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'UIProps', suggestedName: 'uIProps' },
        },
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'DataProps', suggestedName: 'dataProps' },
        },
      ],
      output: `
        type UIProps = { theme: string };
        type DataProps = { items: Item[] };
        const Component = (uIProps: UIProps, dataProps: DataProps) => {
          return <div className={uiConfig.theme}>{dataConfig.items.length}</div>;
        };
      `,
    },

    // React component with generic Props
    {
      code: `
        function GenericComponent<TProps extends ComponentProps>(data: TProps) {
          return <div>{JSON.stringify(data)}</div>;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'TProps' },
        },
      ],
      output: `
        function GenericComponent<TProps extends ComponentProps>(props: TProps) {
          return <div>{JSON.stringify(data)}</div>;
        }
      `,
    },

    // React component with complex Props type
    {
      code: `
        type VeryComplexComponentProps = {
          data: ComplexData;
          handlers: EventHandlers;
          config: Configuration;
        };
        const VeryComplexComponent = (componentData: VeryComplexComponentProps) => {
          return <div>Complex component</div>;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'VeryComplexComponentProps' },
        },
      ],
      output: `
        type VeryComplexComponentProps = {
          data: ComplexData;
          handlers: EventHandlers;
          config: Configuration;
        };
        const VeryComplexComponent = (props: VeryComplexComponentProps) => {
          return <div>Complex component</div>;
        };
      `,
    },
  ],
});
