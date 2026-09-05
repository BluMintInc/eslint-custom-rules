# Disallow React components defined in render bodies, hooks, or passed as props (`@blumintinc/blumint/memo-nested-react-components`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

React components should never be created dynamically inside render bodies, hooks, or any context where they can receive a new identity on re-render. This includes inline components in `useCallback` / `useMemo`, components created in render bodies, and components passed to component-type props (e.g., `CatalogWrapper`, `*Wrapper`, `*Component`).

When a component function reference changes, React treats it as a **different component type**, causing a full unmount/remount of the component and all its children. This leads to loss of state and effects, replaying of animations, and visible UI flashes.

## Rule Details

- **Why**: Component identity stability is critical for React. Inline components often receive a new identity when their containing scope re-renders, causing React to unmount and remount them. Wrapping with `memo()` does NOT fix this—`memo()` only prevents re-renders when props change, not when the component identity itself changes. `useCallback` and `useMemo` can produce stable references when dependencies don't change, but inline component definitions remain fragile and can easily become unstable or stale if dependencies are incorrectly managed.
- **What it checks**:
  - Flags components created inside `useCallback`, `useLatestCallback`, `useMemo`, `useDeepCompareCallback`, or `useDeepCompareMemo`.
  - Flags components defined inside render bodies, decided by where the binding
    is USED rather than by how it is spelled. A binding reports when something
    mounts it — rendered as `<Binding />`, handed to `createElement`, or passed
    to a component-type prop (`*Wrapper`, `*Component`, `*Template`, `*Header`,
    `*Footer`). It stays silent when the parent CALLS it instead: invoked
    directly, or passed to any other prop (`render={...}`, `PopoverChildren={...}`).
    Where a binding has no such use in its own file — an exported component, for
    instance — an uppercase initial is still taken as the answer.
  - Flags inline function components passed to component-type props (`*Wrapper`, `*Component`, `*Template`, `*Header`, `*Footer`).
- **Exemptions**:
  - A `useMemo` / `useDeepCompareMemo` callback that returns a `memo(...)` or `forwardRef(...)`-wrapped component. The memo hook stabilizes the component's identity across re-renders (a new identity is produced only when dependencies change), so the component does not remount on an ordinary re-render. A bare inner component (e.g. `useMemo(() => (props) => <div />, deps)`) stays flagged—wrap it in `memo()` for the fully-stabilized pattern.
  - A `memo(...)` element returned directly (`useMemo(() => <JSX />, deps)`), which memoizes an element rather than defining a component.
  - A factory that hands its component back already wrapped (`return memo(Row)`, `return memo(forwardRef(Inner))`). Such a factory runs once per call rather than once per render, so the component it returns has a stable identity.
  - The same wrapped hand-back carried inside a container, at any depth and in either spelling — an object (`return { __esModule: true, default: memo(Row) }`, the interop shape every `jest.mock()` factory returns) or an array (`return [memo(Row)]`, `return [{ __esModule: true, default: memo(Row) }]`). A bare reference carried in an array (`return [Row]`) is **not** exempt: it hands the component out un-memoized, which is what the paired `require-memo` rule reports there.
### Render callbacks are not components

A render callback is a function a parent invokes so it can drop the result into
its own tree. It is never mounted, so React never gives it an identity to churn,
and the rule leaves it alone regardless of its name:

```tsx
const Consumer = () => {
  // Not reported: `PopoverWrapper` CALLS this, it does not mount it.
  const PopoverChildren = useLatestCallback((onClose: () => void) => {
    return <Panel onPopoverClose={onClose} />;
  });
  return <PopoverWrapper PopoverChildren={PopoverChildren} />;
};
```

The remedy this rule prescribes is actively wrong for that shape. A parent that
selects the callback arm with `typeof Children === 'function'` will not take it
for a memoized value, because `memo()` returns an exotic object rather than a
function — so moving the callback to module scope wrapped in `memo()` sends it
down the `ReactNode` arm and React renders the memo object as a child.

The declaration spelling is not part of the question either. A memo hook, a
plain arrow, and a `function` declaration are read the same way — only the use
site decides:

```tsx
const Consumer = () => {
  // Not reported: `List` CALLS this through `render`, whatever declares it.
  const PopoverChildren = () => <Panel />;
  return <List render={PopoverChildren} />;
};
```

The converse holds too. A lowercase binding handed to a component-type prop IS
mounted, and is reported:

```tsx
const Consumer = () => {
  // Reported: `ContentComponent` is a prop the host mounts.
  const inlinePanel = useLatestCallback((props) => <Panel {...props} />);
  return <Wrapper ContentComponent={inlinePanel} />;
};
```

- **Fix behavior**: This rule does not provide an auto-fix because the correct solution usually involves moving the component definition to the module scope and using React Context or props to provide dynamic data.

### Options

```json
{
  "ignorePatterns": ["**/*.spec.tsx"]
}
```

- `ignorePatterns` (string[], default `[]`): Glob patterns for files the rule should ignore (useful for tests or stories).

## Examples

### Inline Component in Hook (Bad)

```tsx
// BAD: Component created inside useCallback
const LoadingWrapperInternal = useCallback<FC<Props>>(
  (props) => {
    return <LoadingWrapper isLoading={isLoading} {...props} />;
  },
  [isLoading], // When isLoading changes → new component identity → remount
);

// STILL BAD: `use-latest-callback`'s auto-fix only renames the wrapping hook.
// The component is constructed inline in render scope either way.
const LoadingWrapperInternal = useLatestCallback<FC<Props>>((props) => {
  return <LoadingWrapper isLoading={isLoading} {...props} />;
});
```

### Component-Type Prop (Bad)

```tsx
// BAD: CatalogWrapper changes identity when header or gridProps change.
// Using the rest object 'gridProps' in dependencies causes unnecessary churn
// as rest objects are unstable across renders.
const ContentVerticalCarouselGrid = ({ header, ...gridProps }) => {
  const { someStableProp } = gridProps;

  const CatalogWrapper = useCallback(
    (props) => {
      return (
        <ContentCarouselWrapper
          {...props}
          {...gridProps}
          header={header}
        />
      );
    },
    [someStableProp, header], // Destructure stable primitives or use useMemo
  );

  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
};
```

### Correct Solution

1. Define the component at **module scope** in its own file, wrapped with `memo()`.
2. Use **React Context** and/or directly provide props to supply any dynamic data the component needs.
3. Pass the stable, imported component reference to props like `CatalogWrapper`.

```tsx
import { createContext, useContext, memo, ReactNode } from 'react';

// Step 1: Create a context for the dynamic header
export const ContentGridHeaderContext = createContext<ReactNode | null>(null);

export const useContentGridHeader = () => useContext(ContentGridHeaderContext);

// Step 2: Wrapper consumes header from context
// Component defined at module scope and memoized
const ContentCarouselWrapperUnmemoized = (props: any) => {
  const headerFromContext = useContentGridHeader();
  return <VerticalCarouselGrid header={headerFromContext} {...props} />;
};
export const ContentCarouselWrapper = memo(ContentCarouselWrapperUnmemoized);

// Step 3: Wrap with provider and pass stable reference
const MyPage = () => {
  return (
    <ContentGridHeaderContext.Provider value={<ContentSearch />}>
      <AlgoliaLayout CatalogWrapper={ContentCarouselWrapper} />
    </ContentGridHeaderContext.Provider>
  );
};
```

## Edge Cases

- **Render-prop callbacks** (e.g., `render={...}`) are fine; this rule targets component-type props only. A prop counts as component-type only when its name is uppercase-initial **and** ends in `Wrapper`, `Component`, `Template`, `Header`, or `Footer`. A lowercase-initial prop is a render callback even when its tail matches a suffix, so `renderHeader={...}`, `renderFooter={...}`, and `renderTemplate={...}` are not flagged, while `HeaderComponent={...}` and `CatalogWrapper={...}` are. This is the same test the binding side applies when it asks whether a use site mounts a value, so a prop cannot count as component-type in one path and not the other.
- **JSX elements** passed directly to props are fine (e.g., `header={<TitleSelect />}`).
- **`useLatestCallback` is inspected like `useCallback`.** The paired `use-latest-callback` rule rewrites `useCallback(fn, [])` into `useLatestCallback(fn)` under `--fix`. That rewrite changes only which memoization hook wraps the callback: the component is still constructed inline inside render scope, so it still gets a new identity on re-render and this rule still reports. Swapping memoization hooks is not the remedy — hoisting the component to module scope is.
- **Optional-chained spellings** read the same as their plain twins. ESTree wraps a whole optional chain in a `ChainExpression`, so `memo?.(Row)`, `React?.memo(Row)` and `(React?.memo)(Row)` are the same already-memoized hand-back as `memo(Row)`, and `it?.()` / `describe?.()` / `jest?.mock()` keep the test-runner and module-mock exemptions. A non-memo optional call such as `wrap?.(Row)` is still not a memoized hand-back, so the nested component it returns is still flagged.

## Version

- Introduced in v1.12.6
- Updated in v1.12.7 to include render bodies and component-type props.
- Updated to inspect `useLatestCallback`, so `use-latest-callback`'s auto-fix cannot silence this rule on code it had just flagged.
