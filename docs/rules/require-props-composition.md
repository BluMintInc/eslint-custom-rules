# Require React component Props types to compose (via Pick/Omit) with the props types of non-leaf child components rendered in JSX (`@blumintinc/blumint/require-props-composition`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforces that a React component's Props type composes (via `Pick<ChildProps, ...>` or `Omit<ChildProps, ...>`) with the Props types of non-leaf child components it renders in JSX. When a parent component renders a child component but its Props type doesn't compose with the child's Props type, consumers cannot customize the underlying child without the parent explicitly forwarding each prop one by one.

## Why This Matters

- **Forward-compatibility**: When dependency components gain new props, composed types automatically inherit them without manual updates.
- **DRY principle**: Prevents duplication of prop definitions that already exist in dependency component types.
- **Customization surface**: Consumers can customize nested components without the parent needing explicit prop forwarding for every option.
- **Aligns with TypeScript conventions**: Use `Pick`, `Omit`, `Partial`, etc. rather than redefining fields — especially for React component Props type definitions.

## Rule Details

The rule inspects each React component that:
1. Is defined in a file matching `targetPaths` (default: `src/components/**/*.tsx`)
2. Declares a Props type alias (e.g. `type MyComponentProps = ...`)
3. Renders one or more capitalized JSX elements that are not in the `excludeComponents` list

If the Props type does not reference any rendered dependency's Props type via `Pick<...>` or `Omit<...>` (including inside `Readonly<...>` and intersection types `&`), the rule reports a warning.

Composition is also recognized inside nested property types, e.g.:
```tsx
type CopyButtonProps = {
  iconProps?: Omit<GradientIconButtonProps, 'IconComponent'>;
};
```

### Inverse composition

Composition is recognized in **both directions**. If a rendered child instead
derives *its* props from the parent's props type — via `Pick<ParentProps, ...>`,
`Omit<ParentProps, ...>`, or `Readonly<...>` of either — the parent is the single
shared source of truth and the anti-duplication guarantee is already met, so the
child is treated as composed. This holds whether the child has a named
`{Child}Props` alias or the derivation is written inline on the child's first
parameter (with no `{Child}Props` type at all):

```tsx
type LiveBadgeProps = { children?: JSX.Element; size?: string };

// Child derives from the parent — no LiveProps needed.
const Live = ({ size }: Omit<LiveBadgeProps, 'children'>) => <span>{size}</span>;

const LiveBadge = ({ children, size }: LiveBadgeProps) => (
  <>
    {children}
    <Live size={size} />
  </>
);
```

### Direct whole-props references

Referencing a rendered child's **entire** props type directly — as a bare
`ChildProps`, a generic-instantiated `ChildProps<T>`, or any intersection /
`Readonly<...>` member of it — satisfies the composition requirement. Inheriting
the whole surface verbatim is the maximal form of composition, strictly stronger
than `Pick`/`Omit`: nothing is duplicated and nothing can drift, so demanding an
`Omit<ChildProps, never>` here would only add noise.

```tsx
type ChildPlainProps = { hits: readonly string[]; label: string };

// The whole child props type is intersected verbatim — this composes.
export type ParentProps = ChildPlainProps & Readonly<{ title: string }>;

const Parent = ({ title, ...props }: ParentProps) => (
  <div>
    {title}
    <ChildPlain {...props} />
  </div>
);
```

### Union props types

A union satisfies the requirement when **any** arm does — on either side of the
relationship.

On the **parent's** side, a discriminated union Props type composes as soon as
one arm composes with a rendered child. Requiring every arm to compose with every
child would flag the common shape where each arm renders a different control.

On the **child's** side, composing with a *member* of the child's union props
type composes with the child. `Pick<ChildChipProps, 'label'>` inherits exactly
the surface the child accepts on that arm, so the anti-duplication guarantee
holds just as it does for the union alias itself:

```tsx
type ChildSwitchProps = Readonly<{ variant?: 'switch'; label: string }>;
type ChildChipProps = Readonly<{ variant: 'chip'; label: string }>;
type ChildProps = ChildSwitchProps | ChildChipProps;

const Child = (props: ChildProps) => <div>{props.label}</div>;

// Composing with the chip arm composes with Child, as Pick<ChildProps, …> does.
type ChipRowProps = Readonly<Pick<ChildChipProps, 'label'>>;

const ChipRow = ({ label }: ChipRowProps) => (
  <Child label={label} variant="chip" />
);
```

The arms are read from wherever the child's props type is declared: the file
under lint, or the sibling module the child is imported from — under the exported
name or under any local rename (`import type { ChildChipProps as ChipProps }`).
Arms spelled as a named type reference count, including those reached through a
`Readonly<...>` wrapper or a nested union alias.

Only the union's own arms count. A type that is merely declared alongside the
child, and a fragment of one arm, say nothing about the surface the child
accepts, so a parent composing with either still reports — as does a parent that
composes with nothing at all.

### List renderers: composition through an array element

A component that renders a **list** forwards each child's props from the array's
**element type**, not from its own props. Composition is therefore recognized
through `T[]`, `readonly T[]`, `Array<T>`, `ReadonlyArray<T>` and tuple types:
the element is tested against the child exactly as a direct prop is. Demanding a
whole-props `Pick`/`Omit` on the list renderer itself would name a composition it
must not have — the child's contract belongs to the element.

```tsx
type ItemProps = Omit<ButtonProps, 'style'>;

export type ButtonListProps = Readonly<{ items: readonly ItemProps[] }>;

export const ButtonList = ({ items }: ButtonListProps) => (
  <div>
    {items.map((item, index) => (
      <Button key={index} {...item} />
    ))}
  </div>
);
```

The unwrapping composes with every other shape the rule understands, so an
element that is a union credits each arm's own child — the shape a list of
discriminated actions takes:

```tsx
type AsyncActionProps = Readonly<
  Omit<LoadingButtonProps, 'style'> & { isAsync: true }
>;
type SyncActionProps = Readonly<Omit<ButtonProps, 'style'> & { isAsync: false }>;
type ActionProps = AsyncActionProps | SyncActionProps;

export type DialogActionsProps = Readonly<{ buttons: readonly ActionProps[] }>;
```

Only the `readonly` type operator carries a prop surface through.
`keyof ChildProps` is the child's **key union** — a set of strings that hands the
child nothing — so a parent that merely names the child's keys still reports, as
does an array whose element type is unrelated to the child on screen.

### Zero-prop children

Rendering a component that takes **no props** does not by itself require
composition. A props-less child (e.g. `const Icon = () => <svg />`) has no
customization surface to compose with — the same category as a decorative icon —
so it is dropped from the dependency set and never demands a nonexistent
`{Child}Props` type.

```tsx
const ChildNoProps = () => <div />;

export type ParentProps = Readonly<{ title: string }>;

// Renders only a zero-prop child — no composition required.
const Parent = ({ title }: ParentProps) => (
  <div>
    {title}
    <ChildNoProps />
  </div>
);
```

Where the child is *declared* makes no difference. A component declared inside
the very component that renders it — the shape
[`memo-nested-react-components`](./memo-nested-react-components.md) presumes and
requires you to memoize — is resolved the same way as a hoisted one:

```tsx
export type PanelProps = Readonly<{ title: string }>;

export const Panel = memo(({ title }: PanelProps) => {
  // Declared here rather than at the top of the file — still prop-less.
  const Spinner = memo(() => <div />);
  return <Card>{title}<Spinner /></Card>;
});
```

A child **imported from a relative path** counts too, when the imported module
proves it takes no props:

```tsx
// ./BestOfText.tsx — export const BestOfText = () => <div />;
import { BestOfText } from './BestOfText';

export type TeamVersusRecordProps = Readonly<{ title: string }>;

// BestOfTextProps cannot exist, so composition with it is not required.
const TeamVersusRecord = ({ title }: TeamVersusRecordProps) => (
  <div>
    {title}
    <BestOfText />
  </div>
);
```

This relaxation is deliberately narrow, so that an unresolvable name can never
silently disable the rule. It applies **only** when all of the following hold:

- the child is bound by an import whose source is relative (`./x`, `../x`) —
  package imports (`@mui/material`, `react`) and free identifiers are unaffected;
- that source resolves to a real file on disk (`<source>.tsx|.ts|.jsx|.js`, then
  `<source>/index.tsx|.ts|.jsx|.js`);
- **parsing** that file positively proves the imported binding is a component
  declared with an empty parameter list — as `export const X = () => …`,
  `export function X() {}`, a props-preserving HOC wrapper of either (see below),
  an `export { X }` clause, or a default export of any of these;
- nothing inside the rendering component re-declares the name, so the import
  really is what the JSX resolves to.

The child module is parsed into an AST rather than pattern-matched as text, so
text that merely *looks* like a zero-argument declaration — inside a string,
template literal or comment, in a nested scope, or in a TypeScript overload
signature ahead of a props-taking implementation — can never stand in for the
definition.

Anything ambiguous — a missing, unreadable or unparsable file, a re-export whose
definition lives in yet another module, a namespace import, a binding that cannot
be located, a name shadowed by a local declaration, a parameter list that is not
empty — leaves the child in the dependency set, so the rule still reports.

#### Which wrappers the zero-prop proof sees through

Only wrappers that hand a component's props surface through **unchanged** may be
unwrapped when proving a child prop-less:

| Wrapper | Bare form | Qualified form |
| --- | --- | --- |
| `memo` | `memo(…)` | `React.memo(…)` |
| `forwardRef` | `forwardRef(…)` | `React.forwardRef(…)` |
| `observer` | `observer(…)` | — |

```tsx
// ./MemoChild.tsx — export const MemoChild = memo(() => <div />);
// Still prop-less: memo forwards the wrapped component's props verbatim.
import { MemoChild } from './MemoChild';
```

Every other call expression is treated as **unprovable**, so the child stays a
composition dependency and the rule keeps reporting. This matters because the
zero-parameter function inside such a call is usually not the component at all:

```tsx
// ./LazyChild.tsx — export const LazyChild = lazy(() => import('./ChildWithProps'));
// The zero-parameter arrow is a LOADER, not the component: LazyChild exposes
// ChildWithProps' entire props surface, so composition is still required.
import { LazyChild } from './LazyChild';
```

The same applies to `dynamic(() => import('./X'), { ssr: false })` (the shape
[`prefer-next-dynamic`](./prefer-next-dynamic.md) autofixes into), to
`styled(Box)(() => ({ … }))` whose zero-parameter argument is a style callback,
and to any props-injecting HOC (`withTooltip(…)`, `connect(mapState)(…)`).

Verdicts are memoized per child module and stamped with the file's modification
time and size, so adding props to a previously prop-less child takes effect on
the next lint even under a long-lived host (the VS Code ESLint extension,
`eslint_d`) — no restart required.

### Framework-contract props

A component whose props shape is dictated by an **external framework contract**
has no composable source of truth on screen: the routing layer, not the rendered
child, decides what it receives. Composing such props from the presentational
child would invert the dependency — a styling prop added to the child would leak
into a routing contract. A component annotated with one is therefore skipped.

Two spellings qualify, and both are decided from syntax alone (no type
information is required).

**1. A type the framework itself exports.** A props type written against a type
imported from `next` or a `next/*` subpath, reached bare or through `Pick`,
`Omit`, `Readonly`, `Partial` or `Required`, under the exported name or a local
rename:

```tsx
import type { NextPageContext } from 'next';

export type ErrorPageContentProps = Readonly<Pick<NextPageContext, 'err'>>;

export const ErrorPageContent = ({ err }: ErrorPageContentProps) => (
  <UniversalAppStatus err={err} />
);
```

**2. The `/_error` routing contract spelled out.** An object type whose **every**
member is a property Next hands a custom `pages/_error` — `statusCode` typed
`number` and `err` typed `Error` — is that contract written by hand. Each member
may be widened by the absence the framework can hand instead (`| undefined`,
`| null`, or an optional `?`), since that describes the same contract:

```tsx
export type ErrorPageContentProps = Readonly<{
  statusCode: number | undefined;
  err: Error | undefined;
}>;

export const ErrorPageContent = ({ statusCode, err }: ErrorPageContentProps) => (
  <UniversalAppStatus statusCode={statusCode} err={err} />
);
```

The carve-out is **universal, not existential**: the props type must be dictated
upstream in its entirety. Every member of an intersection and every arm of a
union must qualify, so a single prop of the author's own re-opens the question
and the rule reports again — the rendered child is a candidate owner of that
prop:

```tsx
// Still reported: `sx` is the author's own surface, which the child can own.
export type ErrorPageContentProps = Readonly<Pick<NextPageContext, 'err'>> & {
  sx?: SxProps;
};
```

Nesting is deliberately not followed either. A framework contract sitting inside
a property signature or an array element describes one **field's** shape, leaving
the surrounding props the author's to compose (`{ context: NextPageContext;
label: string }` still reports).

Anything that merely resembles a framework contract keeps the composition
requirement in force:

- a contract **name** carrying a different type (`statusCode: string`,
  `err: ApiFailure`, `err: Error | ApiFailure`);
- a differently named prop (`error` rather than `err`);
- an index signature, a method signature, or a computed key — none of them names
  a contract property;
- an empty props type, which declares no contract at all;
- a framework-shaped name imported from anywhere but `next` / `next/*`
  (a relative module, or a package such as `nextish-helpers`);
- a framework name shadowed by an in-file type alias, which is what the
  annotation actually resolves to;
- `err: Error` in a file that binds `Error` itself — through an import, a type
  alias, an interface or a class, in any scope. The contract member is credited
  on its type, and the only type it names is the ambient `Error`; a file with its
  own means the author's shape at that annotation, not the router's;
- a namespace-qualified reference (`Next.NextPageContext`) — only the local name
  a **named** import binds is credited.

### Where in-file declarations are resolved

Every in-file name the rule resolves — the component's own `{Component}Props`
alias, a rendered child's component function, and a child's `{Child}Props` alias
— is looked up **lexically**: from the site that asks, outward through each
enclosing statement container (`Program`, a block, a `namespace` body, a `static`
block, a `switch` case), stopping at the first container that declares the name.
An `export` wrapper is looked through, so `export type XProps = …` resolves
exactly as `type XProps = …` does.

The rule therefore checks a component wherever it is written. A component and its
props alias declared inside a factory, a hook, or an `export namespace` are
resolved and checked just like top-level ones:

```tsx
export namespace Widgets {
  // Reported: WidgetButtonProps composes with nothing the button renders.
  type WidgetButtonProps = { label: string };
  export const WidgetButton = ({ label }: WidgetButtonProps) => (
    <LoadingButton>{label}</LoadingButton>
  );
}
```

Two consequences follow from resolution being lexical rather than file-wide:

- **The innermost declaration wins.** An alias declared beside the component
  shadows a same-named one further out, so the verdict describes the type the
  component actually annotates.
- **A sibling scope is invisible.** A declaration in a scope the component cannot
  see never answers for it. When the props type cannot be resolved at all, the
  rule has nothing to test composition against and skips the component rather
  than guessing.
- **A type parameter shadows too.** In `function MyButton<Data>({ ... }: Data)`
  the annotation names the component's own opaque parameter rather than an outer
  `Data`, so the props type is unresolvable and the component is skipped. The
  shadow is read only in type space: a value named `Data` binds no type and
  leaves the alias resolvable.

### What counts as the component's own render output

The dependency scan reads the whole component function — its body **and its
parameters**. A destructured parameter default renders whenever the caller omits
that prop, so it is render output exactly as a `??` fallback written in the body
is, and the two spellings reach the same verdict:

```tsx
export type PanelProps = Readonly<{ header?: ReactNode }>;

// Reported for `Header`: <Header /> renders whenever `header` is omitted,
// exactly as `header ?? <Header />` in the body would.
export const Panel = ({ header = <Header title="Details" /> }: PanelProps) => (
  <div>{header}</div>
);
```

The scan stops at a **component declared inside the body**. Such a component
renders its own children and is checked on its own declaration, so its JSX is
never charged to the component enclosing it — the nested spelling reaches the
same verdict as hoisting the declaration to module scope:

```tsx
type CellProps = { label: string; dense: boolean };
type RowProps = Pick<CellProps, 'label'>;
export type ListPanelProps = Pick<RowProps, 'label'> & { rows: string[] };

export const ListPanel = ({ rows }: ListPanelProps) => {
  // `Row` renders `Cell`, so `Cell` is a dependency of `Row` — checked where
  // `Row` is declared — and never one of `ListPanel`. `ListPanel` renders
  // `Row`, and composes with `RowProps`.
  const Row = ({ label }: RowProps) => <Cell label={label} dense />;
  return (
    <>
      {rows.map((label) => (
        <Row key={label} label={label} />
      ))}
    </>
  );
};
```

The boundary is a component *declaration*, not any nested function. An anonymous
callback binds no component, so the JSX inside `rows.map((row) => <Row ... />)`
above is `ListPanel`'s own output and counts as its dependency.

## Options

```js
'@blumintinc/blumint/require-props-composition': ['error', {
  // Glob patterns for files to check (default: ['src/components/**/*.tsx'])
  targetPaths: ['src/components/**/*.tsx'],

  // Component names to skip as "leaf" components that don't need composition
  // (merged with the built-in default exclusions)
  excludeComponents: ['Box', 'Stack', 'Typography', 'Fragment'],

  // Minimum number of non-excluded dependency components before the rule applies
  minDependencyCount: 1,

  // When false (default), flag only when Props composes with NONE of the deps.
  // When true, flag when Props is missing composition with ANY dep.
  requireAllDependencies: false,
}]
```

### Default `excludeComponents`

The built-in list includes layout and utility primitives that don't benefit from composition:
`Box`, `Stack`, `Typography`, `Fragment`, `Divider`, `Container`, `Grid`, `Paper`, `Card`, `CardContent`, `CardHeader`, `CardActions`, `List`, `ListItem`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableRow`, `Toolbar`, `AppBar`, `Drawer`, `Modal`, `Backdrop`, `Collapse`, `Fade`, `Grow`, `Slide`, `Zoom`, `CircularProgress`, `LinearProgress`, `Skeleton`, `Suspense`, `StrictMode`, `Profiler`, `ErrorBoundary`, `React.Fragment`, `React.Suspense`, `React.StrictMode`.

Icons are also treated as decorative leaves and excluded — icons expose no composable customization surface a parent should re-expose. The carve-out keys on **two** signals, either of which suffices:

- **The name suffix.** Any component whose name ends in `Icon` (e.g. `CheckIcon`, `RefreshIcon`).
- **The import source.** Any binding imported from `@mui/icons-material`, through the barrel (`import { CheckRounded } from '@mui/icons-material'`) or a per-icon deep path (`import CheckRounded from '@mui/icons-material/CheckRounded'`), under any local alias. MUI's own export names carry no `Icon` suffix, and the `enforce-mui-rounded-icons` fixer emits exactly that spelling (`PersonOutlined` becomes `PersonRounded`), so the suffix alone leaves those icons demanding a `<Icon>Props` type that does not exist.

Both signals are narrow. Interactive components like `IconButton` are unaffected by the suffix (they end in `Button`, not `Icon`), and the source test covers the icon package alone: a child from `@mui/material`, `@mui/lab` or any other `@mui/*` package keeps its customization surface and stays a composition dependency, as does one from a package whose name merely begins with `@mui/icons-material`.

### Component slots declared as props

A JSX element whose name resolves to one of the component's **own props** — a rendering strategy the caller injects — is not a dependency and imposes no composition obligation:

```tsx
export type RangeViewProps = ViewComponentPropsBase<Range<number>> & {
  ViewComponent: ComponentType<ViewComponentPropsBase<string>>;
};

export const RangeView = ({ value, ViewComponent, ...rest }: RangeViewProps) => {
  return <ViewComponent {...rest} value={formatRange(value)} />;
};
```

The parent cannot compose with `ViewComponent`: the concrete component is chosen per call site, there is no `ViewComponentProps` type to `Pick` from, and the slot's accepted props are already constrained by the prop's own annotation. This covers the slot destructured in the signature, destructured from `props` in the body, renamed (`{ render: Renderer }`), defaulted (`{ Slot = Fallback }`), nested (`{ slots: { Header } }`), and the `<props.Slot />` spelling.

A default written on the **parameter** rather than on the property is the same binding, so it is unwrapped the same way:

```tsx
export type RangeViewProps = {
  ViewComponent?: ComponentType<ViewComponentPropsBase<string>>;
};

export const RangeView = ({ ViewComponent }: RangeViewProps = {}) => (
  <ViewComponent />
);
```

The slot is also followed through an **intermediate props binding**, to a fixed point rather than one hop: `({ slots }) => { const { Header } = slots; }`, the alias `const Item = renderItem`, the member access `const { Header } = props.slots`, and a slot taken out of a `...rest` element all name the same caller-injected component. The chain is rooted at the props parameter only — a component destructured out of any other object is a fixed child the parent chose, and still needs composition. Fixed children rendered alongside a slot are still checked.

## Examples

### Incorrect

```tsx
// src/components/header/ShareUrlButton.tsx
export type ShareUrlButtonProps = Readonly<{
  customUrl?: string;
  children?: string | ReactNode;
}>;

export const ShareUrlButton = ({ customUrl, children }: ShareUrlButtonProps) => {
  return (
    <Box sx={{ display: 'flex' }}>
      <ClipboardShareUrl description={description} value={urlCopied}>
        <ShareButtonBase guide={guide}>{children}</ShareButtonBase>
      </ClipboardShareUrl>
    </Box>
  );
};
// Problem: ShareUrlButtonProps doesn't compose with ClipboardShareUrlProps
// or ShareButtonBaseProps — consumers cannot customize those components.
```

```tsx
type BadChipTabProps = Readonly<{
  isActive: boolean;
  label?: string;
  sx?: SxProps; // Manually added instead of inherited
}>;

const BadChipTab = ({ isActive, label, sx, ...rest }: BadChipTabProps) => {
  return <Chip sx={sx} label={label} />;
};
// Problem: ManualSxProps instead of Omit<ChipProps, 'variant'>
```

### Correct

```tsx
// src/components/cards/friend/FriendCardLayout.tsx
export type FriendCardLayoutProps = Omit<UserCardLayoutProps, 'avatarProps'> & {
  mutualFriendsCountEstimate?: number;
  children?: ReactNode;
};

const FriendCardLayout = ({
  children,
  mutualFriendsCountEstimate,
  ...props
}: FriendCardLayoutProps) => (
  <UserCardLayout {...props}>
    {children}
  </UserCardLayout>
);
```

```tsx
// src/components/wallet/transfer/WithdrawButton.tsx
export type WithdrawButtonProps = Readonly<
  Pick<LoadingButtonProps, 'sx' | 'size'>
>;

const WithdrawButton = forwardRef<HTMLButtonElement, WithdrawButtonProps>(
  (props, ref) => (
    <LoadingButton {...props} ref={ref} color="secondary">
      Withdraw
    </LoadingButton>
  )
);
```

```tsx
// Nested composition via property type
type CopyButtonProps = {
  value: string;
  iconProps?: Omit<GradientIconButtonProps, 'IconComponent'>;
};

const CopyButton = ({ value, iconProps }: CopyButtonProps) => (
  <ClipboardShare value={value}>
    <GradientIconButton {...iconProps} />
  </ClipboardShare>
);
```

```tsx
// src/components/dialog/DialogActions.tsx
// Composition through the array's element type — the list renderer forwards
// each element onto the child it was composed from.
type ActionButtonProps = Readonly<
  Omit<LoadingButtonProps, 'style' | 'className'> & { disabledTooltip?: string }
>;

export type DialogActionsProps = Readonly<{
  buttons: readonly ActionButtonProps[];
}>;

const DialogActions = ({ buttons }: DialogActionsProps) => (
  <div>
    {buttons.map((button, index) => (
      <LoadingButton key={index} {...button} />
    ))}
  </div>
);
```

## When to Disable

- When a component intentionally does NOT expose any props from its child components (e.g., it fully controls all aspects of the child's configuration).
- Props dictated by a framework contract need no disable — see
  [Framework-contract props](#framework-contract-props).
- For legacy components during migration. Enable the rule as `'warn'` first, then fix components incrementally.
- When the child component's Props type is not importable (e.g., it's defined inline without an export).
