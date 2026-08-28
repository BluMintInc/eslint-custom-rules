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

      // #2179: the #1276 carve-out. enforce-props-argument-name — the
      // authoritative rule this one defers to — treats a distinct name on a
      // subclass constructor parameter property as intentional, because renaming
      // it to `props` can collide with a private `props` in the base class
      // (TS2415) and strands `super(settings)` / `this.settings`. Reporting it
      // here made that carve-out void in the shipped recommended config.
      {
        code: `
        type SubProps = { a: number };
        class Widget extends Base {
          constructor(private readonly settings: SubProps) {
            super();
          }
        }
      `,
      },
      // The same carve-out when the superclass is a mixin call expression.
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
      // The same carve-out when the superclass is a member expression.
      {
        code: `
        type WidgetProps = { id: string };
        class ExtendedWidget extends Some.Base.Widget {
          constructor(private readonly widgetSettings: WidgetProps) {
            super(widgetSettings);
          }
        }
      `,
      },
      // #2180: a default value nests the identifier in an `AssignmentPattern`,
      // and the deferral counter only recognised a bare `Identifier`. The
      // defaulted parameter went uncounted, this two-Props constructor read as a
      // single-Props one, and the rule renamed `next` to `props` — a rename its
      // own deferral contract forbids, and one enforce-props-argument-name
      // contradicts (it keeps both descriptive names when two parameters share a
      // Props type, and asks for prefixed names when they do not).
      {
        code: `
        type RowProps = { id: string };
        const fallback = { id: '' };
        class Differ {
          constructor(
            private readonly prev: RowProps = fallback,
            private readonly next: RowProps,
          ) {}
        }
      `,
      },
      // The same counter gap on a plain function signature.
      {
        code: `
        type RowProps = { id: string };
        const fallback = { id: '' };
        function diff(prev: RowProps = fallback, next: RowProps) {
          return [prev, next];
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

      // #2178: a `public` parameter property publishes the field to the whole
      // file, so `w.settings` in a sibling function reads the very member the
      // rename removes. The safety scan was handed the enclosing class and could
      // not see that read, so `--fix` renamed the declaration and left the
      // reader pointing at a member the class no longer has (TS2339).
      {
        name: 'a public parameter property read outside the class withholds the rename',
        code: `
        type FooProps = { a: number };
        class Widget {
          constructor(public readonly settings: FooProps) {}
        }
        export function read(w: Widget) {
          return w.settings.a;
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // #2178: a `protected` field is readable by a subclass declared elsewhere
      // in the file — the same read, one class node away from the scan root.
      {
        name: 'a protected parameter property read by a subclass withholds the rename',
        code: `
        type FooProps = { a: number };
        export class Widget {
          constructor(protected readonly settings: FooProps) {}
        }
        export class Sub extends Widget {
          get a() {
            return this.settings.a;
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // #2178: a bracket-spelled external read names the SAME member as the dot
      // form (the #1882 spelling, one scope out), and the fixer rewrites neither.
      {
        name: 'a bracket-spelled external read withholds the rename',
        code: `
        type FooProps = { a: number };
        class Widget {
          constructor(public readonly settings: FooProps) {}
        }
        export function read(w: Widget) {
          return w['settings'].a;
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: null,
      },
      // Control for #2178: nothing outside the class reads the field, so
      // widening the scan past the class must not cost the fix.
      {
        name: 'a public parameter property with no reader still autofixes',
        code: `
        type FooProps = { a: number };
        class Widget {
          constructor(public readonly settings: FooProps) {}
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type FooProps = { a: number };
        class Widget {
          constructor(public readonly props: FooProps) {}
        }
      `,
      },
      // Boundary for #2178: `private` confines every legal read to the class
      // body, so the scan stays class-scoped and the rename still applies. The
      // external `w.settings` below is already a TS2341 error before the fix
      // runs, so it is not a read the rename can strand.
      {
        name: 'a private parameter property keeps its class-scoped scan',
        code: `
        type FooProps = { a: number };
        class Widget {
          constructor(private readonly settings: FooProps) {}
        }
        export function read(w: Widget) {
          return w.settings.a;
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type FooProps = { a: number };
        class Widget {
          constructor(private readonly props: FooProps) {}
        }
        export function read(w: Widget) {
          return w.settings.a;
        }
      `,
      },
      // Control for #2179: the carve-out is keyed on `extends`. Drop the extends
      // clause and the identical parameter property is reported and renamed, so
      // the gate cannot silently swallow the non-subclass case.
      {
        name: 'the same parameter property without an extends clause is still reported',
        code: `
        type SubProps = { a: number };
        class Widget {
          constructor(private readonly settings: SubProps) {
            console.log('ready');
          }
        }
      `,
        errors: [
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
        ],
        output: `
        type SubProps = { a: number };
        class Widget {
          constructor(private readonly props: SubProps) {
            console.log('ready');
          }
        }
      `,
      },
      // Control for #2179: the carve-out is keyed on parameter PROPERTIES. A
      // plain constructor parameter in a subclass declares no field, so a local
      // rename cannot collide with an inherited one and is still enforced —
      // matching enforce-props-argument-name on the same input.
      {
        name: 'a plain constructor parameter in a subclass is still reported',
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
          { messageId: 'usePropsName', data: { paramName: 'settings' } },
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
      // Control for #2180: the deferral counter counts Props-TYPED parameters,
      // not defaulted ones. A defaulted parameter of an unrelated type leaves a
      // lone Props parameter, which is still this rule's to report.
      {
        name: 'a defaulted non-Props parameter does not trigger the multi-Props deferral',
        code: `
        type BProps = { b: number };
        class Widget {
          constructor(
            private readonly flag: string = 'x',
            private readonly beta: BProps,
          ) {}
        }
      `,
        errors: [{ messageId: 'usePropsName', data: { paramName: 'beta' } }],
        output: `
        type BProps = { b: number };
        class Widget {
          constructor(
            private readonly flag: string = 'x',
            private readonly props: BProps,
          ) {}
        }
      `,
      },
    ],
  },
);
