# Memoize object, array, and function literals created inside React components or hooks so renders do not recreate references and trigger avoidable work (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

React re-runs component and hook bodies on every render. Inline object, array, and function literals create fresh references each time, which breaks referential equality checks inside hooks, cache layers, and child components. This rule guards against those accidental allocations by requiring literals in React components and hooks to be either memoized (via `useMemo`/`useCallback`) or hoisted to module-level constants. Direct top-level hook arguments remain allowed, but nested literals inside those arguments are flagged because they still change on every render.

## Rule Details

- Reports object, array, and inline function literals created inside React components or custom hooks.
- Flags nested literals inside hook argument objects/arrays (e.g., `useQuery({ options: { cache: {...} } })`) while allowing the top-level argument itself.
- Detects custom hooks that return object/array/function literals directly, since callers receive a fresh reference each render.
- Skips literals already inside `useMemo`/`useCallback` (or other stable hook callbacks) and module-level constants.
- Offers suggestions to wrap component-level literals in `useMemo`/`useCallback` for a stable reference and injects a `__TODO_ADD_DEPENDENCIES__` placeholder so callers must supply real dependencies instead of accidentally shipping an empty array.

### Examples of incorrect code

```jsx
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

```jsx
function useUserSettings() {
  return {
    theme: 'dark',
    onChange: () => updateTheme(),
  };
}
```

### Examples of correct code

```jsx
const EMPTY_RESULTS: string[] = [];

function UserProfile({ userId }) {
  const queryFn = useCallback(() => fetchUser(userId), [userId]);
  const queryKey = useMemo(() => ['user', userId], [userId]);
  const options = useMemo(
    () => ({
      staleTime: 5000,
      cacheOptions: { ttl: 60000 },
    }),
    [],
  );

  const userData = useQuery({ queryKey, queryFn, options });
  const [searchResults] = useState(EMPTY_RESULTS);
  return <ProfileDisplay data={userData} results={searchResults} />;
}
```

```jsx
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

## Options

This rule does not have any options.

## When Not To Use It

- Components that intentionally regenerate literals on every render (e.g., to force recalculation) and where the cost is acceptable.
- Codepaths outside React components or hooks where referential stability is irrelevant.

