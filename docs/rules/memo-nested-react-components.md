# Disallow React components defined in render bodies, hooks, or passed as props (`@blumintinc/blumint/memo-nested-react-components`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

React components should never be created dynamically inside render bodies, hooks, or any context where they receive a new identity on re-render. This includes inline components in `useCallback` / `useMemo`, components created in render bodies, and components passed to component-type props (e.g., `CatalogWrapper`, `*Wrapper`, `*Component`).

When a component function reference changes, React treats it as a **different component type**, causing a full unmount/remount of the component and all its children. This leads to loss of state and effects, replaying of animations, and visible UI flashes.

## Rule Details

- **Why**: Component identity stability is critical for React. Inline components get new identities when their containing scope re-renders, causing React to unmount and remount them. Wrapping with `memo()` does NOT fix this—`memo()` only prevents re-renders when props change, not when the component identity itself changes.
- **What it checks**:
  - Flags components created inside `useCallback`, `useMemo`, `useDeepCompareCallback`, or `useDeepCompareMemo`.
  - Flags components (Uppercase identifiers) defined inside render bodies.
  - Flags inline function components passed to component-type props (`*Wrapper`, `*Component`, `*Template`, `*Header`, `*Footer`).
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
```

### Component-Type Prop (Bad)

```tsx
// BAD: CatalogWrapper changes identity when header or gridProps change
const ContentVerticalCarouselGrid = ({ header, ...gridProps }) => {
  const CatalogWrapper = useCallback((props) => {
    return <ContentCarouselWrapper {...props} {...gridProps} header={header} />;
  }, [gridProps, header]);

  return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
};
```

### Correct Solution

1. Define the component at **module scope** in its own file, wrapped with `memo()`.
2. Use **React Context** and/or directly provide props to supply any dynamic data the component needs.
3. Pass the stable, imported component reference to props like `CatalogWrapper`.

```tsx
// Step 1: Create a context for the dynamic header
export const ContentGridHeaderContext = createContext<ReactNode | null>(null);

// Step 2: Wrapper consumes header from context
const ContentCarouselWrapperUnmemoized = ({ ...props }) => {
  const headerFromContext = useContentGridHeader();
  return <VerticalCarouselGrid header={headerFromContext} {...props} />;
};
export const ContentCarouselWrapper = memo(ContentCarouselWrapperUnmemoized);

// Step 3: Wrap with provider and pass stable reference
<ContentGridHeaderProvider header={<ContentSearch />}>
  <AlgoliaLayout CatalogWrapper={ContentCarouselWrapper} />
</ContentGridHeaderProvider>
```

## Edge Cases

- **Render-prop callbacks** (e.g., `render={...}`) are fine; this rule targets component-type props only.
- **JSX elements** passed directly to props are fine (e.g., `header={<TitleSelect />}`).

## Version

- Introduced in v1.12.6
- Updated in v1.12.7 to include render bodies and component-type props.
