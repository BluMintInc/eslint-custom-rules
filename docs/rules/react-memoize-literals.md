# Memoize object, array, and function literals created inside React components or hooks so renders do not recreate references and trigger avoidable work (`@blumintinc/blumint/react-memoize-literals`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

React re-runs your component and hook bodies on every render. Inline object, array, and function literals create fresh references each time, which breaks referential equality checks inside hooks, cache layers, and child components. This rule keeps those references stable by requiring literals in React components and hooks to be either memoized (via `useMemo`/`useCallback`) or hoisted to module-level constants. Direct top-level hook arguments remain allowed, but nested literals inside those arguments are flagged because they still change on every render.

## Rule Details

- Reports object, array, and inline function literals created inside React components or custom hooks.
- Flags nested literals inside hook argument objects/arrays (e.g., `useQuery({ options: { cache: {...} } })`) while allowing the top-level argument itself.
- Detects custom hooks that return object/array/function literals directly, since callers receive a fresh reference each render.
- Skips literals already inside callbacks passed to stable built-in React hooks (`useMemo`, `useCallback`, `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useImperativeHandle`, `useState`, `useReducer`, `useRef`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`, `useId`) and module-level constants.
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

#### How the suggestion placeholder looks

When the rule suggests a fix, it injects a dependency placeholder you must replace:

```tsx
const options = useMemo(
  () => ({ debounce: 50 }),
  [/* __TODO_MEMOIZATION_DEPENDENCIES__ */],
);
```

This placeholder must be replaced before committing.

## Options

This rule does not have any options.

## When Not To Use It

- Components that intentionally regenerate literals on every render (e.g., to force recalculation) and where the cost is acceptable.
- Codepaths outside React components or hooks where referential stability is irrelevant.

