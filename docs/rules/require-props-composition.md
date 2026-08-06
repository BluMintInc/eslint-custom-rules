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

Any component whose name ends in `Icon` (e.g. `CheckIcon`, `RefreshIcon` from `@mui/icons-material`) is also treated as a decorative leaf and excluded — icons expose no composable customization surface a parent should re-expose. Interactive components like `IconButton` are unaffected (they end in `Button`, not `Icon`).

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

The parent cannot compose with `ViewComponent`: the concrete component is chosen per call site, there is no `ViewComponentProps` type to `Pick` from, and the slot's accepted props are already constrained by the prop's own annotation. This covers the slot destructured in the signature, destructured from `props` in the body, renamed (`{ render: Renderer }`), defaulted (`{ Slot = Fallback }`), nested (`{ slots: { Header } }`), and the `<props.Slot />` spelling. Fixed children rendered alongside a slot are still checked.

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

## When to Disable

- When a component intentionally does NOT expose any props from its child components (e.g., it fully controls all aspects of the child's configuration).
- For legacy components during migration. Enable the rule as `'warn'` first, then fix components incrementally.
- When the child component's Props type is not importable (e.g., it's defined inline without an export).
