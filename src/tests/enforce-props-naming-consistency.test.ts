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
      // A correctly named constructor parameter on a generic class: neither the
      // constructor visitor nor the function visitor may fire (Issue #1514).
      {
        code: `
        type FieldPrepperProps<TData> = { data: TData; path: string };
        export class FieldPrepper<TData> {
          constructor(props: FieldPrepperProps<TData>) {
            this.data = props.data;
          }
        }
      `,
      },
      // A parameter property and a plain parameter both typed "Props" is a
      // multi-Props constructor, which defers to enforce-props-argument-name.
      // The constructor visitor owns this counting because only it can see the
      // parameter property (Issue #1514).
      {
        code: `
        class DataManager {
          constructor(
            private readonly settings: ManagerProps,
            options: OptionsProps,
          ) {}
        }
      `,
      },
    ],
    invalid: [
      // Issue #1358 repro: the annotation must survive and body references must
      // be rewritten alongside the declaration.
      {
        code: `function C(input: FooProps) {\n  return input.name;\n}`,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'input' } }],
        output: `function C(props: FooProps) {\n  return props.name;\n}`,
      },
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
        function User(props: UserProps) {
          return props.name;
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
        const Button = (props: ButtonProps) => {
          return props.label;
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
          constructor(private readonly props: TournamentFactoryProps) {
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
        function createGame(props: GameCreationProps) {
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
            private readonly props: ManagerProps,
          ) {}
        }
      `,
      },
      // Parameter property whose name is read via `this.<name>`: the field half
      // of the rename is invisible to scope analysis, so no fix is emitted.
      {
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          render() {
            return this.settings.label;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // Parameter property read as a plain identifier inside the constructor.
      {
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {
            console.log(settings.label);
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // #1882: `this['settings']` names the SAME member as `this.settings`, and
      // the fixer can rewrite neither. Keying the guard on the dot spelling
      // alone shipped the rename and left this read pointing at a member the
      // class no longer has.
      {
        name: 'a bracket-spelled this access withholds the rename',
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          render() {
            return this['settings'].label;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      {
        name: 'a template-spelled this access withholds the rename',
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          render() {
            return this[\`settings\`].label;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      {
        name: 'an optional bracket-spelled this access withholds the rename',
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          render() {
            return this?.['settings'].label;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // The guard stays keyed on the NAME, not on bracket syntax: a computed
      // access to a different member strands nothing, so the rename applies.
      {
        name: 'a bracket access to an unrelated member still autofixes',
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          render() {
            return this['unrelated'];
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        class Widget {
          constructor(private readonly props: WidgetProps) {}
          render() {
            return this['unrelated'];
          }
        }
      `,
      },
      // A dynamic key names no member statically, so it cannot be the reference
      // the rename would strand — treating it as one would withhold every fix.
      {
        name: 'a dynamic computed this access still autofixes',
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {}
          read(key: string) {
            return this[key];
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        class Widget {
          constructor(private readonly props: WidgetProps) {}
          read(key: string) {
            return this[key];
          }
        }
      `,
      },
      // Parameter property with no other occurrence in the class: the rename is
      // complete, and the annotation survives.
      {
        code: `
        class Widget {
          constructor(private readonly settings: WidgetProps) {
            console.log('ready');
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        class Widget {
          constructor(private readonly props: WidgetProps) {
            console.log('ready');
          }
        }
      `,
      },
      // Object-literal shorthand must expand so the KEY keeps its name.
      {
        code: `
        function toEntry(settings: EntryProps) {
          return { settings, id: settings.id };
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        function toEntry(props: EntryProps) {
          return { settings: props, id: props.id };
        }
      `,
      },
      // An existing `props` binding in the parameter's scope would be
      // redeclared by the rename, so the fix is withheld.
      {
        code: `
        function render(settings: RenderProps) {
          const props = normalize(settings);
          return props;
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // References spread across nested closures are all rewritten.
      {
        code: `
        const build = (settings: BuildProps) => {
          return () => {
            const inner = () => settings.depth;
            return inner() + settings.width;
          };
        };
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        const build = (props: BuildProps) => {
          return () => {
            const inner = () => props.depth;
            return inner() + props.width;
          };
        };
      `,
      },
      // An optional parameter keeps both its `?` marker and its annotation.
      {
        code: `
        function User(input?: UserProps) {
          return input?.name;
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'input' } }],
        output: `
        function User(props?: UserProps) {
          return props?.name;
        }
      `,
      },
      // A body-less interface method signature: the parameter name is
      // documentation-only, so a declaration-only rename is complete.
      {
        code: `
        interface Renderer {
          render(config: RenderProps): void;
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `
        interface Renderer {
          render(props: RenderProps): void;
        }
      `,
      },
      // The same body-less shape as an object-type member.
      {
        code: `type Renderer = { render(config: RenderProps): void };`,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `type Renderer = { render(props: RenderProps): void };`,
      },
      // A body-less constructor overload signature.
      {
        code: `
        class Widget {
          constructor(config: WidgetProps);
          constructor(config: unknown) {}
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `
        class Widget {
          constructor(props: WidgetProps);
          constructor(config: unknown) {}
        }
      `,
      },
      // A non-constructor class method (a FunctionExpression owner).
      {
        code: `
        class ComponentManager {
          initialize(config: ComponentProps) {
            return config.id;
          }
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `
        class ComponentManager {
          initialize(props: ComponentProps) {
            return props.id;
          }
        }
      `,
      },
      // A method on an object literal.
      {
        code: `
        const manager = {
          initialize(config: ComponentProps) {
            return config.id;
          },
        };
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `
        const manager = {
          initialize(props: ComponentProps) {
            return props.id;
          },
        };
      `,
      },
      // The reported parameter shares its name with the enclosing function, so
      // the rename must resolve the variable by declaration identity.
      {
        code: `
        function config(config: ComponentProps) {
          return config.id;
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'config' } }],
        output: `
        function config(props: ComponentProps) {
          return props.id;
        }
      `,
      },
      // Issue #1514 repro: a plain constructor parameter is a `MethodDefinition`
      // AND a `FunctionExpression`, so it used to be reported twice with an
      // identical message and an identical fix range. Exactly one report, and
      // the rename converges in a single pass.
      {
        code: `
        type FieldPrepperProps<TData> = { data: TData; path: string };
        export class FieldPrepper<TData> {
          constructor(settings: FieldPrepperProps<TData>) {
            this.data = settings.data;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type FieldPrepperProps<TData> = { data: TData; path: string };
        export class FieldPrepper<TData> {
          constructor(props: FieldPrepperProps<TData>) {
            this.data = props.data;
          }
        }
      `,
      },
      // A constructor and a regular method in one class: the constructor is
      // reported once (not twice), and the method still reported at all — the
      // deduplication must not swallow non-constructor `FunctionExpression`s.
      {
        code: `
        class ComponentManager {
          constructor(settings: ManagerProps) {
            this.settings = settings;
          }
          initialize(config: ComponentProps) {
            return config.id;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
          { messageId: 'usePropsName', data: { paramName: 'config' } },
        ],
        output: `
        class ComponentManager {
          constructor(props: ManagerProps) {
            this.settings = props;
          }
          initialize(props: ComponentProps) {
            return props.id;
          }
        }
      `,
      },
      // A static method and an accessor keep their own coverage.
      {
        code: `
        class WidgetFactory {
          static build(config: WidgetProps) {
            return config.id;
          }
          set options(config: WidgetProps) {
            this.stored = config;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'config' } },
          { messageId: 'usePropsName', data: { paramName: 'config' } },
        ],
        output: `
        class WidgetFactory {
          static build(props: WidgetProps) {
            return props.id;
          }
          set options(props: WidgetProps) {
            this.stored = props;
          }
        }
      `,
      },
      // A constructor parameter property stays reported exactly once, and the
      // constructor-only safety gate still supplies the fix.
      {
        code: `
        type FieldPrepperProps<TData> = { data: TData };
        export class FieldPrepper<TData> {
          constructor(private readonly settings: FieldPrepperProps<TData>) {}
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type FieldPrepperProps<TData> = { data: TData };
        export class FieldPrepper<TData> {
          constructor(private readonly props: FieldPrepperProps<TData>) {}
        }
      `,
      },
      // A reference nested inside JSX-free deep member/call chains.
      {
        code: `
        function User(settings: UserProps) {
          const { name } = settings;
          return [settings.age, name, settings];
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        function User(props: UserProps) {
          const { name } = props;
          return [props.age, name, props];
        }
      `,
      },
    ],
  },
);
