# Detect object, array, and function literals created in React components or hooks that create new references every render. Prefer memoized values (useMemo/useCallback) or module-level constants to keep referential stability (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

React re-runs your component and hook bodies on every render. Inline object, array, and function literals create fresh references each time, which breaks referential equality checks inside hooks, cache layers, and child components. This rule keeps those references stable by requiring literals in React components and hooks to be either memoized (via `useMemo`/`useCallback`) or hoisted to module-level constants. Direct top-level hook arguments remain allowed, but nested literals inside those arguments are flagged because they still change on every render.

## Rule Details

- Reports object, array, and inline function literals created inside React components or custom hooks.
- Flags nested literals inside hook argument objects/arrays (e.g., `useQuery({ options: { cache: {...} } })`) while allowing the top-level argument itself.
- Detects custom hooks that return object/array/function literals directly, since callers receive a fresh reference each render.
- Skips literals that are destined to be thrown (e.g., `throw { message: 'error' }` or a variable where every usage is in a `throw` statement), as throwing aborts the render cycle and referential stability is irrelevant.
- Skips literals already inside callbacks passed to stable hooks (`useMemo`, `useCallback`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useImperativeHandle`, `useState`, `useReducer`, `useRef`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`, `useId`, `useLatestCallback`, `useDeepCompareMemo`, `useDeepCompareCallback`, `useDeepCompareEffect`, `useProgressionCallback`) and module-level constants.
- Accounts for `async` function boundaries, skipping literals inside `async` function expressions or declarations. While the synchronous portion before the first `await` runs immediately, async functions are typically used as event handlers or effect callbacks where internal literal references do not affect render stability.
- Exempts object and array literals passed to deep-compared JSX attributes like `sx`, `style`, and any attribute ending in `Sx` or `Style` (e.g., `containerSx`). These attributes are compared using deep-equality (via `blumintAreEqual`) in BluMint components, so fresh references do not trigger unnecessary re-renders. **Note:** Inline functions passed to these attributes are still flagged, as they cannot be reliably deep-compared and still break referential stability.
- Offers suggestions to wrap component-level literals in `useMemo`/`useCallback` for a stable reference and injects a `__TODO_MEMOIZATION_DEPENDENCIES__` placeholder so callers must supply real dependencies instead of accidentally shipping an empty array.

### Examples of incorrect code

```tsx
function UserProfile({ userId }) {
  const userData = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    options: {
      staleTime: 5000,
      cacheOptions: { ttl: 60000 },
    },
  });

  const defaults = { enabled: true };
  return <ProfileDisplay data={userData} defaults={defaults} />;
}
```

```tsx
function useUserSettings() {
  return {
    theme: 'dark',
    onChange: () => updateTheme(),
  };
}
```

#### Deep-compared JSX attributes

Inline functions passed to deep-compared attributes still require memoization because they cannot be reliably compared by value:

```tsx
// ❌ Invalid: inline functions still require memoization
function UserCard({ onUpdate }) {
  return (
    <Box sx={() => console.log('render')}>
      <Button onClick={() => onUpdate()}>Update</Button>
    </Box>
  );
}
```

### Examples of correct code

These examples show how you keep references stable by memoizing values with the right dependencies (or hoisting constants).

```tsx
const EMPTY_RESULTS: string[] = [];

function UserProfile({ userId, locale }) {
  const queryFn = useCallback(() => fetchUser(userId), [userId]);
  const queryKey = useMemo(() => ['user', userId], [userId]);
  const options = useMemo(
    () => ({
      staleTime: 5000,
      cacheOptions: { ttl: 60000 },
      labels: buildLabels(locale),
    }),
    [locale],
  );

  const userData = useQuery({ queryKey, queryFn, options });
  const [searchResults] = useState(EMPTY_RESULTS);
  return <ProfileDisplay data={userData} results={searchResults} />;
}
```

```tsx
function useUserSettings() {
  const onChange = useCallback(() => updateTheme(), []);
  return useMemo(
    () => ({
      theme: 'dark',
      onChange,
    }),
    [onChange],
  );
}
```

#### Deep-compared JSX attributes

Object and array literals passed to deep-compared attributes (sx, style, or any attribute ending in Sx or Style) are exempt from memoization requirements:

```tsx
// ✅ Valid: object literals in deep-compared attributes
function UserCard({ name }) {
  return (
    <Box sx={{ padding: 2, margin: 1 }}>
      <Typography style={{ fontWeight: 'bold' }}>{name}</Typography>
      <Container containerSx={{ display: 'flex' }}>Content</Container>
    </Box>
  );
}
```

#### How the suggestion placeholder looks

When the rule suggests a fix, it injects a dependency placeholder you must replace:

```tsx
const options = useMemo(
  () => ({ debounce: 50 }),
  [/* __TODO_MEMOIZATION_DEPENDENCIES__ */],
);
```

This placeholder must be replaced before committing.

## When Not To Use It

- Components that intentionally regenerate literals on every render (e.g., to force recalculation) and where the cost is acceptable.
- Codepaths outside React components or hooks where referential stability is irrelevant.
