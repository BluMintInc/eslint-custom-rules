import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { enforceSingleExportedUnitPerFile } from '../rules/enforce-single-exported-unit-per-file';

const tsx = (name: string) => ({ filename: `src/components/${name}.tsx` });

// Component-oriented cases (need JSX parsing).
ruleTesterJsx.run(
  'enforce-single-exported-unit-per-file',
  enforceSingleExportedUnitPerFile,
  {
    valid: [
      // Single arrow component.
      {
        ...tsx('Simple'),
        code: `export const Simple = () => { return <div />; };`,
      },
      // Single function-declaration component.
      {
        ...tsx('Header'),
        code: `export function Header() { return <header />; }`,
      },
      // Edge Case 1: the *Unmemoized + memo() pair is ONE unit.
      {
        ...tsx('TeamStatusChip'),
        code: `
export const TeamStatusChipUnmemoized = ({ sx }) => { return <div style={sx} />; };
export const TeamStatusChip = memo(TeamStatusChipUnmemoized);
`,
      },
      // Edge Case 1/4: Logo — type + const + component + memo pair = ONE unit.
      {
        ...tsx('Logo'),
        code: `
export type LogoProps = { isLink?: boolean };
export const BLUMINT_LOGO_URL = '/assets/word_logo.svg';
export function LogoUnmemoized(props: LogoProps) { return <a>{props.isLink}</a>; }
export const Logo = memo(LogoUnmemoized, compareDeeply('width'));
`,
      },
      // Edge Case 1: custom HOC with a sibling-export argument collapses.
      {
        ...tsx('SignInDropdown'),
        code: `
export const SignInDropdownMenuless = () => { return <div />; };
export const SignInDropdown = withMenu(SignInDropdownMenuless, SignInMenu);
`,
      },
      // Edge Case 1: nested memo(forwardRef(sibling)) collapses.
      {
        ...tsx('FancyInput'),
        code: `
export const FancyInput = (props) => { return <input {...props} />; };
export const FancyInputMemo = memo(forwardRef(FancyInput));
`,
      },
      // React.memo (member-expression wrapper) collapses with its sibling source.
      {
        ...tsx('Toolbar'),
        code: `
export const ToolbarUnmemoized = () => { return <header />; };
export const Toolbar = React.memo(ToolbarUnmemoized);
`,
      },
      // A multi-level collapse chain (source -> memo -> memo) is still ONE unit;
      // exercises union-find path compression across three linked exports.
      {
        ...tsx('Badge'),
        code: `
export const BadgeUnmemoized = () => { return <div />; };
export const Badge = memo(BadgeUnmemoized);
export const BadgeWrapped = memo(Badge);
`,
      },
      // A lone class-expression component (const = class extends Component) is
      // one component unit.
      {
        ...tsx('Boxed'),
        code: `
export const Boxed = class extends Component {
  render() { return <div />; }
};
`,
      },
      // A curried HOC (connect(mapState)(Base)) is still one component; the
      // call-callee is itself a call, which yields no simple callee name.
      {
        ...tsx('Connected'),
        code: `export const Connected = connect(mapState)(BaseComponent);`,
      },
      // A PascalCase const from a factory call with no component-like argument
      // is not a component, so it never counts against the single component.
      {
        ...tsx('AppShell'),
        code: `
export const Store = makeStore('config', 123);
export const AppShell = () => { return <div />; };
`,
      },
      // An exported uninitialized binding (no initializer) is not a unit and
      // never counts against the single component.
      {
        ...tsx('Deferred'),
        code: `
export let deferredHandle;
export const Deferred = () => { return <div />; };
`,
      },
      // A component initializer wrapped in an `as` cast is unwrapped before
      // classification, so the cast does not hide the single component.
      {
        ...tsx('CastCard'),
        code: `export const CastCard = (() => { return <div />; }) as any;`,
      },
      // Edge Case 4: createContext result is not a component.
      {
        ...tsx('ValueOriginContext'),
        code: `
const ValueOriginProviderUnmemoized = () => { return <div />; };
export const ValueOriginContext = createContext(null);
export const ValueOriginProvider = memo(ValueOriginProviderUnmemoized);
`,
      },
      // Edge Case 8: co-located hook contributes nothing.
      {
        ...tsx('CompetitorAccordion'),
        code: `
export const useAccordionState = (id: string) => { return id; };
const CompetitorAccordionUnmemoized = () => { return <div />; };
export const CompetitorAccordion = memo(CompetitorAccordionUnmemoized);
`,
      },
      // Edge Case 4: supporting constants/types/hooks alongside one component.
      {
        ...tsx('Widget'),
        code: `
export const WIDGET_ID = 'widget';
export type WidgetProps = { id: string };
export const useWidget = () => { return 1; };
export const Widget = (props: WidgetProps) => { return <div>{props.id}</div>; };
`,
      },
      // Edge Case 5: declaration + default reference to the SAME declaration.
      {
        ...tsx('Panel'),
        code: `
const Panel = () => { return <section />; };
export default Panel;
`,
      },
      // Edge Case 5: a lone default-exported component.
      {
        ...tsx('ProfilePage'),
        code: `export default function ProfilePage() { return <div />; }`,
      },
      // Edge Case 9: a lone React class component is compliant.
      {
        ...tsx('ErrorBoundary'),
        code: `
export class ErrorBoundary extends Component {
  render() { return <div />; }
}
`,
      },
      // One component + one class = within both budgets.
      {
        ...tsx('MyComponent'),
        code: `
export const MyComponent = () => { return <div />; };
export class MyService { doThing() { return 1; } }
`,
      },
      // Edge Case 10: test files are exempt even with multiple components.
      {
        filename: 'src/components/Foo.test.tsx',
        code: `
export const HarnessProvider = ({ children }) => { return <div>{children}</div>; };
export const StatefulWrapper = () => { return <span />; };
`,
      },
      // Edge Case 10: spec files are exempt.
      {
        filename: 'src/components/Foo.spec.tsx',
        code: `
export const WrapperA = () => { return <div />; };
export const WrapperB = () => { return <span />; };
`,
      },
      // Edge Case 10: __mocks__ files are exempt.
      {
        filename: 'src/__mocks__/Foo.tsx',
        code: `
export const MockA = () => { return <div />; };
export const MockB = () => { return <span />; };
`,
      },
    ],
    invalid: [
      // Edge Case 2: four thin variant components -> 3 diagnostics.
      {
        ...tsx('SlideTransition'),
        code: `
export const SlideTransitionDown = memo(function SlideTransitionDownUnmemoized(props) { return <Slide {...props} direction="down" />; });
export const SlideTransitionUp = memo(function SlideTransitionUpUnmemoized(props) { return <Slide {...props} direction="up" />; });
export const SlideTransitionLeft = memo(function SlideTransitionLeftUnmemoized(props) { return <Slide {...props} direction="left" />; });
export const SlideTransitionRight = memo(function SlideTransitionRightUnmemoized(props) { return <Slide {...props} direction="right" />; });
`,
        errors: [
          { messageId: 'multipleExportedComponents' },
          { messageId: 'multipleExportedComponents' },
          { messageId: 'multipleExportedComponents' },
        ],
      },
      // Edge Case 1 contrast: two INDEPENDENT memoized components -> flag.
      {
        ...tsx('LiveBadge'),
        code: `
const LiveUnmemoized = () => { return <div />; };
const LiveBadgeUnmemoized = () => { return <span />; };
export const Live = memo(LiveUnmemoized, compareDeeply('onClick', 'sx'));
export const LiveBadge = memo(LiveBadgeUnmemoized, compareDeeply('sx'));
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Edge Case 2: derivation from an IMPORTED base does not collapse.
      {
        ...tsx('DateEdit'),
        code: `
export const DateEdit = withDatePickerEdit(DatePicker);
export const DateEditUtc = withDatePickerEdit(DatePicker, { utc: true });
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Edge Case 3: a component that RENDERS a sibling does not collapse.
      {
        ...tsx('Link'),
        code: `
export const NextLinkComposed = forwardRef(function NextLinkComposed(props, ref) {
  return <NextLink><Anchor ref={ref} {...props} /></NextLink>;
});
export const Link = forwardRef(function Component(props, ref) {
  return <MuiLink component={NextLinkComposed} />;
});
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Edge Case 5: default + named are two independent components.
      {
        ...tsx('Page'),
        code: `
export default function Page() { return <Widget />; }
export const Widget = () => { return <div />; };
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Edge Case 9: class component + functional fallback -> two components.
      {
        ...tsx('ErrorBoundary'),
        code: `
export class ErrorBoundary extends Component {
  render() { return this.props.children; }
}
export const ErrorFallback = ({ error }) => { return <div>{error.message}</div>; };
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Two full-bodied function components.
      {
        ...tsx('HeaderFooter'),
        code: `
export function Header() { return <header />; }
export function Footer() { return <footer />; }
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Three components -> two diagnostics, exact count/names.
      {
        ...tsx('Trio'),
        code: `
export const A = () => { return <div />; };
export const B = () => { return <span />; };
export const C = () => { return <p />; };
`,
        errors: [
          {
            messageId: 'multipleExportedComponents',
            data: { count: 3, names: 'A, B, C', name: 'B' },
          },
          {
            messageId: 'multipleExportedComponents',
            data: { count: 3, names: 'A, B, C', name: 'C' },
          },
        ],
      },
      // Edge Case 9: React.Component (member-expression superclass) class
      // component + functional fallback -> two components.
      {
        ...tsx('Boundary'),
        code: `
export class Boundary extends React.Component {
  render() { return <div />; }
}
export const BoundaryFallback = () => { return <div />; };
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // A generic HOC wrapping a nested wrapper call (withTheme(memo(fn))) is a
      // component; sits beside another component -> flag.
      {
        ...tsx('Themed'),
        code: `
export const Themed = withTheme(memo(() => { return <div />; }));
export const Plain = () => { return <span />; };
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Anonymous default-exported function component + a named component.
      {
        ...tsx('Sidebar'),
        code: `
export default function () { return <aside />; }
export const SidebarToggle = () => { return <button />; };
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Default export whose declaration is a bare memo(...) expression, beside
      // a named component.
      {
        ...tsx('NavBar'),
        code: `
export const NavLink = () => { return <a />; };
export default memo(() => { return <nav />; });
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // Default export that is a parenthesized class expression component.
      {
        ...tsx('Overlay'),
        code: `
export const OverlayTrigger = () => { return <button />; };
export default (class extends Component {
  render() { return <div />; }
});
`,
        errors: [{ messageId: 'multipleExportedComponents' }],
      },
      // One component (within budget) but two plain classes -> class flag.
      {
        ...tsx('Mixed'),
        code: `
export const MyComponent = () => { return <div />; };
export class ServiceA { doA() { return 1; } }
export class ServiceB { doB() { return 2; } }
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
    ],
  },
);

// Class-oriented cases (no JSX).
ruleTesterTs.run(
  'enforce-single-exported-unit-per-file',
  enforceSingleExportedUnitPerFile,
  {
    valid: [
      // A single class with real methods is fine.
      {
        filename: 'src/services/UserFetcher.ts',
        code: `
export class UserFetcher {
  async fetch() { return 1; }
  parse() { return 2; }
}
`,
      },
      // A single utility function + types is zero units.
      {
        filename: 'src/util/doThing.ts',
        code: `
export function doThing(x: number) { return x * 2; }
export type Thing = { a: number };
`,
      },
      // Edge Case 7: re-export barrel introduces no new declarations.
      {
        filename: 'src/components/index.ts',
        code: `
export { TournamentStatusChips } from './TournamentStatusChips';
export { TournamentEditableChips } from './TournamentEditableChips';
export * from './chips/types';
`,
      },
      // Edge Case 6: trivial subclasses of a common imported base -> exempt.
      {
        filename: 'scripts/github/topological-sort-errors.ts',
        code: `
export class CircularDependencyError extends HttpsError {
  constructor(path: string[]) { super({ code: 'x', message: 'y' }); this.name = 'CircularDependencyError'; }
}
export class CrossPhaseDependencyError extends HttpsError {
  constructor() { super({ code: 'a', message: 'b' }); this.name = 'CrossPhaseDependencyError'; }
}
export class MissingDependencyError extends HttpsError {
  constructor() { super({ code: 'c', message: 'd' }); this.name = 'MissingDependencyError'; }
}
`,
      },
      // Edge Case 6: base declared IN the file, subclasses extend it -> exempt.
      {
        filename: 'scripts/github/parse-migration-metadata.ts',
        code: `
export class MigrationMetadataError extends Error {
  constructor(message: string) { super(message); this.name = 'MigrationMetadataError'; }
}
export class InvalidMigrationPhaseError extends MigrationMetadataError {
  constructor(value: string) { super('Invalid: ' + value); }
}
export class MissingMigrationTagError extends MigrationMetadataError {
  constructor(tag: string) { super('Missing: ' + tag); }
}
`,
      },
      // Edge Case 10: .d.ts declaration files are exempt.
      {
        filename: 'src/types/foo.d.ts',
        code: `
export class Foo {}
export class Bar {}
`,
      },
      // Two classes sharing a plain in-file base with no superclass -> exempt.
      {
        filename: 'src/errors/base-family.ts',
        code: `
export class BaseThing {}
export class ThingA extends BaseThing { constructor() { super(); } }
export class ThingB extends BaseThing { constructor() { super(); } }
`,
      },
    ],
    invalid: [
      // Edge Case 6 contrast: classes with real methods are not a taxonomy.
      {
        filename: 'src/services/fetchers.ts',
        code: `
export class UserFetcher {
  constructor() {}
  async fetch() { return 1; }
}
export class ScoreCalculator {
  calculate() { return 2; }
}
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
      // Two unrelated trivial classes with different imported bases -> flag.
      {
        filename: 'src/errors/unrelated.ts',
        code: `
export class FooError extends BaseA { constructor() { super(); } }
export class BarError extends BaseB { constructor() { super(); } }
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
      // Three trivial classes with no shared base -> two diagnostics.
      {
        filename: 'src/errors/trio.ts',
        code: `
export class Foo { constructor() {} }
export class Bar { constructor() {} }
export class Baz { constructor() {} }
`,
        errors: [
          {
            messageId: 'multipleExportedClasses',
            data: { count: 3, names: 'Foo, Bar, Baz', name: 'Bar' },
          },
          {
            messageId: 'multipleExportedClasses',
            data: { count: 3, names: 'Foo, Bar, Baz', name: 'Baz' },
          },
        ],
      },
      // A trivial-base hierarchy where one member has extra members -> flag.
      {
        filename: 'src/errors/mixed-hierarchy.ts',
        code: `
export class BaseError extends Error { constructor(m: string) { super(m); } }
export class RichError extends BaseError {
  constructor(m: string) { super(m); }
  describe() { return 'rich'; }
}
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
      // Two independent classes exported via specifiers (not inline).
      {
        filename: 'src/services/registry.ts',
        code: `
class Alpha { run() { return 1; } }
class Beta { run() { return 2; } }
export { Alpha, Beta };
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
      // Classes extending mixin-call superclasses have no resolvable base name,
      // so they cannot form a shared-base hierarchy -> flag.
      {
        filename: 'src/services/mixed-bases.ts',
        code: `
export class Widget extends mixin(Base) { constructor() { super(); } }
export class Gadget extends compose(Other) { constructor() { super(); } }
`,
        errors: [{ messageId: 'multipleExportedClasses' }],
      },
    ],
  },
);
