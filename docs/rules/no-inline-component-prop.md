# no-inline-component-prop

<!-- begin auto-generated rule header -->
<!-- end auto-generated rule header -->

Disallow inline function components created inside a render scope from being passed to component-type props (e.g., `CatalogWrapper`, `*Wrapper`, `*Component`). Inline wrapper components capture changing closures and get recreated on every render, forcing React to remount entire subtrees and causing UI flashes and lost state.

## Why

- Prevents full remounts and visible flashes when parent state, URL params, or Firestore data change.
- Preserves child component state by keeping wrapper identities stable.
- Encourages lifting dynamic data into props or context instead of closing over render scope.

## Rule Details

The rule flags components passed to component-type props when those components are created via inline expressions, hooks like `useCallback`/`useMemo`, or wrapped with `React.memo`/`forwardRef` inside a render scope (`CatalogWrapper`, names ending in `Wrapper`/`Component`, or configured names).
Configured `props` patterns are honored for non-render-prop names even if the prop name is not PascalCase; when `allowRenderProps` is true, render-prop names such as `children` or `render*` are skipped even if they match a pattern. Glob patterns support up to two `*` wildcards to avoid overly complex regular expressions.

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
- `allowModuleScopeFactories` (default `true`): skips components defined at module scope (stable references and top-level factories/HOCs).

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
