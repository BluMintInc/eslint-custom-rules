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

    // Subclass parameter property MUST keep a distinct name: the base class
    // already declares a private `props` parameter-property, so renaming the
    // subclass param to `props` collides (TS2415). The rule must not report.
    {
      code: `
        type ManagerProps = { config: string };
        type ExtendedManagerProps = ManagerProps & { extra: string };
        class Manager {
          public constructor(private readonly props: ManagerProps) {}
          public get config() { return this.props.config; }
        }
        class ExtendedManager extends Manager {
          public constructor(private readonly fullProps: ExtendedManagerProps) {
            super(fullProps);
          }
          public get extra() { return this.fullProps.extra; }
        }
      `,
    },

    // Subclass with a superClass that is a member expression (React.Component)
    // and a distinctly-named parameter property must not be reported.
    {
      code: `
        type WidgetProps = { id: string };
        class ExtendedWidget extends Some.Base.Widget {
          constructor(private readonly widgetProps: WidgetProps) {
            super(widgetProps);
          }
        }
      `,
    },

    // Subclass with a superClass that is a call expression (mixin) and a
    // distinctly-named parameter property must not be reported.
    {
      code: `
        type PanelProps = { title: string };
        class ExtendedPanel extends withMixin(BasePanel) {
          constructor(private readonly panelSettings: PanelProps) {
            super(panelSettings);
          }
        }
      `,
    },

    // Subclass parameter property that already forwards to super but happens to
    // be named `props` is fine (no rename needed, no report).
    {
      code: `
        type BaseProps = { config: string };
        class Base {
          constructor(private readonly props: BaseProps) {}
        }
        class Derived extends Base {
          constructor(private readonly props: BaseProps) {
            super(props);
          }
        }
      `,
    },

    // A non-parameter-property constructor param in a subclass is unaffected by
    // the guard when it is already correctly named `props`.
    {
      code: `
        type ThingProps = { id: string };
        class Base {}
        class Thing extends Base {
          constructor(props: ThingProps) {
            super();
          }
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

    // Multiple parameters with the exact same Props type should be allowed
    {
      code: `
        const eitherEqual = <TProps>(prevProps: TProps, nextProps: TProps) => {
          return prevProps === nextProps;
        };
      `,
    },
    {
      code: `
        type Props = { val: number };
        function compare(p1: Props, p2: Props) {
          return p1.val === p2.val;
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

    // A correctly named parameter referenced from nested closures stays valid.
    {
      code: `
        type ThemeProps = { color: string };
        const useTheme = (props: ThemeProps) => {
          const read = () => props.color;
          return () => read() + props.color;
        };
      `,
    },

    // A correctly named parameter used as object-literal shorthand stays valid.
    {
      code: `
        type CardProps = { id: string };
        function card(props: CardProps) {
          return { props };
        }
      `,
    },

    // A correctly named parameter with a default value stays valid.
    {
      code: `
        type OptionsProps = { retries: number };
        function run(props: OptionsProps = DEFAULT_OPTIONS) {
          return props.retries;
        }
      `,
    },

    // A body-less class method whose parameter is already named props.
    {
      code: `
        type OptProps = { verbose: boolean };
        declare class Runner {
          configure(props: OptProps): void;
        }
      `,
    },

    // A rest parameter hangs its type annotation off the RestElement rather
    // than the inner identifier, so the rule never inspects it — rest params
    // are outside this rule's reporting surface even when the tuple alias ends
    // in Props.
    {
      code: `
        type ArgsProps = [string, number];
        function collect(...argList: ArgsProps) {
          return argList[0];
        }
      `,
    },
  ],

  invalid: [
    // Issue #1355 repro: a nested arrow returned from a factory. The autofix
    // must rewrite every reference, not just the declaration, or the fixed
    // output no longer compiles.
    {
      code: `
        type RunnerProps = Readonly<{ isDryRun: boolean }>;
        export const build = () => {
          return (runnerProps: RunnerProps) => {
            return runnerProps.isDryRun;
          };
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'RunnerProps' },
        },
      ],
      output: `
        type RunnerProps = Readonly<{ isDryRun: boolean }>;
        export const build = () => {
          return (props: RunnerProps) => {
            return props.isDryRun;
          };
        };
      `,
    },

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
          return props.id;
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
          return props.event;
        };
      `,
    },

    // Multiple parameters with Props types. Each report's rename now spans from
    // its declaration to its last reference, and those two spans interleave, so
    // ESLint applies one per pass; `output` captures the single pass RuleTester
    // performs (a real `--fix` run converges on the second pass).
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
        function mergeConfigs(uIProps: UIProps, dataSettings: DataProps) {
          return { ...uIProps, ...dataSettings };
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
          return props;
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
          return props.name;
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
          return props.value;
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
          return props.id;
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
          return props?.value;
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
          return callback({ id, ...props });
        }
      `,
    },

    // Parameter property in a NON-extends class is still reported and safely
    // autofixed when the name is unreferenced (empty body, no this.<name>).
    {
      code: `
        type ManagerProps = { config: Config };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
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
        class Manager {
          constructor(private readonly props: ManagerProps) {}
        }
      `,
    },

    // Defense in depth: parameter property in a NON-extends class is reported
    // but NOT autofixed when the name is referenced via `this.<name>`, since a
    // declaration-only rename would leave that access dangling.
    {
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          get config() { return this.settings.config; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: null,
    },

    // Defense in depth: parameter property referenced by a plain identifier in
    // the constructor body is reported but NOT autofixed.
    {
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {
            console.log(settings);
          }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: null,
    },

    // #1881: `this['settings']` names the SAME member as `this.settings`, and
    // the fixer can rewrite neither. Keying the guard on the dot spelling alone
    // shipped the rename and left this access pointing at a member the class no
    // longer has.
    {
      name: 'a bracket-spelled this access withholds the rename',
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          get config() { return this['settings'].config; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: null,
    },
    {
      name: 'a template-spelled this access withholds the rename',
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          get config() { return this[\`settings\`].config; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: null,
    },
    {
      name: 'an optional bracket-spelled this access withholds the rename',
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          get config() { return this?.['settings'].config; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: null,
    },
    // The guard must stay keyed on the NAME, not on bracket syntax: a computed
    // access to a different member strands nothing, so the rename still applies.
    {
      name: 'a bracket access to an unrelated member still autofixes',
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          get other() { return this['unrelated']; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly props: ManagerProps) {}
          get other() { return this['unrelated']; }
        }
      `,
    },
    // A dynamic key names no member statically, so it cannot be the reference
    // the rename would strand — treating it as one would withhold every fix.
    {
      name: 'a dynamic computed this access still autofixes',
      code: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly settings: ManagerProps) {}
          read(key: string) { return this[key]; }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ManagerProps' },
        },
      ],
      output: `
        type ManagerProps = { config: string };
        class Manager {
          constructor(private readonly props: ManagerProps) {}
          read(key: string) { return this[key]; }
        }
      `,
    },

    // A REGULAR (non-parameter-property) constructor param in a subclass is not
    // covered by the parameter-property guard, so it is still reported and
    // autofixed (a plain local rename cannot collide with an inherited field).
    {
      code: `
        type ThingProps = { id: string };
        class Base {}
        class Thing extends Base {
          constructor(settings: ThingProps) {
            super();
          }
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ThingProps' },
        },
      ],
      output: `
        type ThingProps = { id: string };
        class Base {}
        class Thing extends Base {
          constructor(props: ThingProps) {
            super();
          }
        }
      `,
    },

    // A reference used as object-literal shorthand must expand to
    // `oldName: props` — rewriting the single token in place would rename the
    // property KEY too and silently change the object's shape.
    {
      code: `
        type ConfigProps = { id: string };
        function build(configData: ConfigProps) {
          return { configData, extra: 1 };
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ConfigProps' },
        },
      ],
      output: `
        type ConfigProps = { id: string };
        function build(props: ConfigProps) {
          return { configData: props, extra: 1 };
        }
      `,
    },

    // The type annotation (and the optional marker) must survive the rename:
    // an Identifier's range spans them, so replacing the whole node would
    // delete the annotation (Issue #1351).
    {
      code: `
        type WidgetProps = { id: string };
        const render = (widgetConfig?: WidgetProps): string => {
          return widgetConfig?.id ?? '';
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'WidgetProps' },
        },
      ],
      output: `
        type WidgetProps = { id: string };
        const render = (props?: WidgetProps): string => {
          return props?.id ?? '';
        };
      `,
    },

    // Default-value parameter: the AssignmentPattern's write reference IS the
    // declaration identifier, so it must be skipped to avoid overlapping fixes.
    {
      code: `
        type OptionsProps = { retries: number };
        function run(optionsConfig: OptionsProps = DEFAULT_OPTIONS) {
          return optionsConfig.retries;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'OptionsProps' },
        },
      ],
      output: `
        type OptionsProps = { retries: number };
        function run(props: OptionsProps = DEFAULT_OPTIONS) {
          return props.retries;
        }
      `,
    },

    // References spread across nested closures must all be renamed.
    {
      code: `
        type QueryProps = { id: string };
        const makeHandler = (queryData: QueryProps) => {
          const read = () => queryData.id;
          return () => read() + queryData.id;
        };
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'QueryProps' },
        },
      ],
      output: `
        type QueryProps = { id: string };
        const makeHandler = (props: QueryProps) => {
          const read = () => props.id;
          return () => read() + props.id;
        };
      `,
    },

    // The declared-variable lookup must match on declaration identity, not on
    // the name: the function and its parameter share the name `config`, and
    // renaming the function's binding instead would leave `config.id` dangling.
    {
      code: `
        type ConfigProps = { id: string };
        function config(config: ConfigProps) {
          return config.id;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ConfigProps' },
        },
      ],
      output: `
        type ConfigProps = { id: string };
        function config(props: ConfigProps) {
          return props.id;
        }
      `,
    },

    // Collision: `props` is already bound in the parameter's own scope, so the
    // rename would be a redeclaration. Report without fixing.
    {
      code: `
        type FormProps = { id: string };
        function render(formConfig: FormProps) {
          const props = normalize(formConfig);
          return props;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'FormProps' },
        },
      ],
      output: null,
    },

    // Collision: the body already uses `props` for an outer binding, which the
    // rename would capture. Report without fixing.
    {
      code: `
        type ModalProps = { open: boolean };
        const props = getGlobalProps();
        function render(modalConfig: ModalProps) {
          return props.theme + modalConfig.open;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ModalProps' },
        },
      ],
      output: null,
    },

    // Collision: an intervening scope between a reference and the declaration
    // binds `props`, so the rewritten reference would resolve to that binding.
    // Report without fixing.
    {
      code: `
        type ListProps = { items: string[] };
        function render(listConfig: ListProps) {
          return ITEMS.map((props) => {
            return props + listConfig.items;
          });
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'ListProps' },
        },
      ],
      output: null,
    },

    // A body-less class method (declare/overload) carries no in-file
    // references, so the declaration-only rename is complete rather than
    // partial and is still applied.
    {
      code: `
        type OptProps = { verbose: boolean };
        declare class Runner {
          configure(options: OptProps): void;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterName',
          data: { typeName: 'OptProps' },
        },
      ],
      output: `
        type OptProps = { verbose: boolean };
        declare class Runner {
          configure(props: OptProps): void;
        }
      `,
    },

    // Multiple Props parameters take prefixed names and each rename carries its
    // own references. The two rename spans interleave, so ESLint applies one
    // per pass; RuleTester captures that single pass.
    {
      code: `
        type UserProps = { name: string };
        type OrderProps = { total: number };
        function summarize(userInfo: UserProps, orderInfo: OrderProps) {
          return userInfo.name + orderInfo.total;
        }
      `,
      errors: [
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'UserProps', suggestedName: 'userProps' },
        },
        {
          messageId: 'usePropsParameterNameWithPrefix',
          data: { typeName: 'OrderProps', suggestedName: 'orderProps' },
        },
      ],
      output: `
        type UserProps = { name: string };
        type OrderProps = { total: number };
        function summarize(userProps: UserProps, orderInfo: OrderProps) {
          return userProps.name + orderInfo.total;
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
          return <button onClick={props.onClick}>{props.label}</button>;
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
          return <div>{props.name}</div>;
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
        const Component = (uIProps: UIProps, dataConfig: DataProps) => {
          return <div className={uIProps.theme}>{dataConfig.items.length}</div>;
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
          return <div>{JSON.stringify(props)}</div>;
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
