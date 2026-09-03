# Prevent inline function components defined in render from being passed to component-type props like CatalogWrapper to avoid remounts and UI flashes (`@blumintinc/blumint/no-inline-component-prop`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Disallow inline function components created inside a render scope from being passed to component-type props (e.g., `CatalogWrapper`, `*Wrapper`, `*Component`). Inline wrapper components capture changing closures and get recreated on every render, forcing React to remount entire subtrees and causing UI flashes and lost state.

## Why

- Prevents full remounts and visible flashes when parent state, URL params, or Firestore data change.
- Preserves child component state by keeping wrapper identities stable.
- Encourages lifting dynamic data into props or context instead of closing over render scope.

## Rule Details

The rule flags components passed to component-type props when those components are created via inline expressions, hooks like `useCallback`/`useMemo`, or wrapped with `React.memo`/`forwardRef` inside a render scope (`CatalogWrapper`, names ending in `Wrapper`/`Component`, or configured names).
Configured `props` patterns are honored for non-render-prop names even if the prop name is not PascalCase; when `allowRenderProps` is true, render-prop names such as `children` or `render*` are skipped even if they match a pattern. Glob patterns support up to two `*` wildcards to avoid overly complex regular expressions.

### Which scope counts

The hazard is measured **relative to the consumer**, not by absolute scope depth. A referenced wrapper is reported only when its nearest enclosing function is the same function that holds the consuming JSX attribute — that is exactly when the wrapper is recreated by the scope that passes it along, so React sees a new component type and remounts the subtree.

A wrapper declared in a **strictly outer** function is created once per call of that outer function, and every run of the consumer sees the identical reference. There is no remount to prevent, and the suggested remedy would not change anything, so those are not reported: HOC/factory functions that return a component, a wrapper declared in a `describe` callback and used from nested `it` callbacks, and class- or object-method factories. Module scope is the degenerate case of the same rule — the definition has no enclosing function at all.

Custom hooks are not exempt. A hook body re-runs on every render of its caller, so a wrapper declared next to the JSX that consumes it inside the hook churns exactly like one declared in a component:

```tsx
// ❌ Reported: useCatalogLayout re-runs per render, and it holds both the
// definition and the consuming JSX.
export function useCatalogLayout() {
  const CatalogWrapper = (props: { children: JSX.Element }) => (
    <div {...props} />
  );
  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
}
```

Blocks that are not functions — loop bodies, `if` branches, `try` blocks — do not change the enclosing function, so a wrapper declared inside one still belongs to the surrounding component and is reported. An IIFE that encloses both the definition and the consumer is likewise the same-function case.

### Wrapper calls given a name rather than a literal

`memo(...)`, `forwardRef(...)`, `useCallback(...)` and `useMemo(...)` are read through to the function they wrap, whether the argument is written inline or handed over as an identifier. An identifier is followed to its declaration through the scope chain, and the verdict is taken from **where that declaration sits** — so `memo(LocalFn)` and `memo(ModuleScopeFn)` get opposite answers.

This matters because `require-memo`'s autofix rewrites a nested component into exactly that shape: the declaration is renamed to `<Name>Unmemoized` and a sibling `const <Name> = memo(<Name>Unmemoized)` is appended beside it. Both statements stay in the render scope, so the declaration is still recreated per render and `memo` is re-invoked with a fresh argument — the wrapper is not stable, and the rewrite must not read as a repair.

```tsx
// ❌ Reported: the renamed declaration is recreated on every render of Page,
// so memo() returns a new component type each time.
function Page() {
  function ItemComponentUnmemoized(props: { value: string }) {
    return <Row {...props} />;
  }
  const ItemComponent = memo(ItemComponentUnmemoized);
  return <List ItemComponent={ItemComponent} />;
}
```

```tsx
// ✅ Not reported: the declaration and the memo() call both run once.
function ItemComponentUnmemoized(props: { value: string }) {
  return <Row {...props} />;
}
const ItemComponent = memo(ItemComponentUnmemoized);

function Page() {
  return <List ItemComponent={ItemComponent} />;
}
```

A reference is followed only where the declaration it names decides the question. The rule declines — reports nothing — when the argument is:

- an **imported** name, or one that does not resolve at all (a global, or an ambient declaration from a file the rule never sees);
- a **parameter**, whose identity is the caller's to keep stable;
- a name **declared more than once**, or **assigned more than once** (a reassigned `let`), since no single declaration fixes what `memo()` receives;
- a **class**, catch or other non-function binding;
- declared **outside** the consuming render scope, which is the stable case above;
- anything other than a plain identifier — a member expression, an element access, a call result.

Alias chains through wrapper calls are followed for a bounded number of hops, so `const Inner = forwardRef(InnerUnmemoized); const Wrapper = memo(Inner);` still lands on the local declaration while a self-referential initializer terminates rather than recursing.

❌ Inline wrapper recreated per render:

```tsx
import { useCallback } from 'react';

function Teams({ header }: { header: JSX.Element }) {
  const CatalogWrapper = useCallback(
    (props: { children: JSX.Element }) => (
      <TeamsCarouselWrapper {...props} header={header} />
    ),
    [header],
  );

  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
}
```

✅ Stable, top-level component reference that lifts dynamic data out of the render scope:

```tsx
const TeamsCatalogWrapper = memo(function TeamsCatalogWrapper(
  props: { children: JSX.Element },
) {
  const header = useTeamsHeader();
  return <TeamsCarouselWrapper {...props} header={header} />;
});

function Teams({ header }: { header: JSX.Element }) {
  return (
    <TeamsHeaderProvider header={header}>
      <AlgoliaLayout CatalogWrapper={TeamsCatalogWrapper} />
    </TeamsHeaderProvider>
  );
}
```

✅ Lift data via context and pass a stable component:

```tsx
const ContentGrid = () => (
  <ContentGridHeaderProvider header={<ContentSearch />}>
    <AlgoliaLayout CatalogWrapper={ContentCarouselWrapper} />
  </ContentGridHeaderProvider>
);
```

## Options

```json
{
  "@blumintinc/blumint/no-inline-component-prop": [
    "error",
    {
      "props": ["CatalogWrapper", "*Wrapper", "*Component"],
      "allowRenderProps": true,
      "allowModuleScopeFactories": true
    }
  ]
}
```

- `props` (default `["CatalogWrapper", "*Wrapper", "*Component"]`): prop name patterns treated as component-type props.
- `allowRenderProps` (default `true`): when `true`, props such as `render*`, `children`, and similar render-prop names are ignored.
- `allowModuleScopeFactories` (default `true`): skips components whose identity is stable from the consumer's point of view — those defined at module scope, and those defined in a function that strictly encloses the consumer (factories, HOCs, `describe` bodies, method factories). Setting it to `false` withdraws **every** stability carve-out, so any component-like definition passed to a component-type prop is reported no matter where it is declared. Withdrawing only the module-scope half would be incoherent: a module binding is strictly more stable than one held by an outer function, so it cannot be the only shape that reports.

## Valid

```tsx
const StableWrapper = (props: { children: JSX.Element }) => <div>{props.children}</div>;
const Page = () => <AlgoliaLayout CatalogWrapper={StableWrapper} />;
```

```tsx
const Grid = ({ items }: { items: string[] }) => (
  <VirtualizedList items={items} renderItem={(row) => <Row row={row} />} />
);
```

```tsx
const wrappers = { CatalogWrapper: StableWrapper };
const Page = () => <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
```

```tsx
// Created once per withCatalog() call; every render of Page sees the same
// reference, so there is nothing to remount.
export function withCatalog(Inner: ComponentType<{ children: JSX.Element }>) {
  const StableWrapper = (props: { children: JSX.Element }) => (
    <Inner>{props.children}</Inner>
  );

  return function Page() {
    return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
  };
}
```

```tsx
// The describe body runs once, so the wrapper is fixed across every it callback.
describe('CustomHitsPreempted', () => {
  const CatalogWrapper = ({ hits }: { hits: Hit[] }) => <div>{hits.length}</div>;

  it('renders', () => {
    render(<CustomHitsPreempted CatalogWrapper={CatalogWrapper} />);
  });
});
```

## Invalid

```tsx
const Page = () => (
  <AlgoliaLayout CatalogWrapper={(props) => <Wrapper {...props} />} />
);
```

```tsx
function Page({ header }: { header: JSX.Element }) {
  const CatalogWrapper = useCallback(
    (props: { children: JSX.Element }) => <Wrapper {...props} header={header} />,
    [header],
  );
  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
}
```

```tsx
function Page() {
  const wrappers = { CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} /> };
  return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
}
```

```tsx
// A local name handed to memo() is judged on its declaration, so the
// rename-plus-wrap shape a fixer emits is still reported.
function Page() {
  const CatalogWrapperUnmemoized = (props: { children: JSX.Element }) => (
    <Wrapper {...props} />
  );
  const CatalogWrapper = memo(CatalogWrapperUnmemoized);
  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
}
```
