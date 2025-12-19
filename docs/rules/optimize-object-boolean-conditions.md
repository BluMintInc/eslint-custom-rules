# Detects and suggests optimizations for boolean conditions formed over objects in React hook dependencies. Suggests extracting boolean conditions into separate variables to reduce unnecessary re-computations when objects change frequently but the boolean condition changes less frequently (`@blumintinc/blumint/optimize-object-boolean-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule flags boolean expressions that are derived from objects when they appear directly inside React hook dependency arrays. Object references change any time a property changes, so a dependency like `!data` will retrigger the hook even if the boolean outcome did not change. Depending on the derived boolean instead keeps hooks focused on meaningful changes and reduces wasted renders.

### Why this matters

- Hooks re-run whenever an object reference changes, even when the boolean meaning stays constant, which wastes renders and time.
- Stable boolean dependencies make memoization predictable and protect expensive callbacks from unnecessary invalidation.
- Named booleans (for example, `hasData`) make intent obvious without scanning the dependency list.

### Patterns Detected

The rule inspects dependency arrays of `useEffect`, `useCallback`, and `useMemo` for boolean conditions sourced from objects:

- **Object existence checks**: `!obj`
- **Object key count checks**: `Object.keys(obj).length === 0`, `Object.keys(obj).length > 0`, etc.
- **Combined boolean expressions**: `!obj || Object.keys(obj).length === 0`

### Examples

❌ **Incorrect** – Boolean conditions remain inline in dependency arrays, so any object reference change forces a rerun even when the boolean outcome is identical:

```javascript
const tabPanes = useMemo(() => {
  const tabs = [
    {
      value: 'matches',
      component: (
        <LoadingWrapper
          isLoading={!roundPreviews || Object.keys(roundPreviews).length === 0}
        >
          <MatchesPane />
        </LoadingWrapper>
      ),
    },
  ];
  return tabs;
}, [roundPreviews, cohortPreviews, mode, phase]);
```

```javascript
const result = useMemo(() => {
  return !data ? [] : processData();
}, [!data]); // Boolean condition in dependency array → triggers the rule
```

```javascript
const callback = useCallback(() => {
  return Object.keys(items).length === 0 ? 'empty' : 'not empty';
}, [Object.keys(items).length === 0]); // Object key count check in dependency array
```

✅ **Correct** – Extract boolean conditions into named variables and depend on them:

```javascript
// Extract boolean conditions to optimize hook re-runs
const hasRoundPreviews = roundPreviews && Object.keys(roundPreviews).length > 0;
const hasCohortPreviews = cohortPreviews && Object.keys(cohortPreviews).length > 0;

const tabPanes = useMemo(() => {
  const tabs = [
    {
      value: 'matches',
      component: (
        <LoadingWrapper isLoading={!hasRoundPreviews}>
          <MatchesPane />
        </LoadingWrapper>
      ),
    },
  ];
  return tabs;
}, [hasRoundPreviews, hasCohortPreviews, mode, phase]);
```

```javascript
const hasData = data && Object.keys(data).length > 0;
const result = useMemo(() => {
  return hasData ? processData() : [];
}, [hasData]);
```

```javascript
const hasItems = items && Object.keys(items).length > 0;
const callback = useCallback(() => {
  return hasItems ? 'not empty' : 'empty';
}, [hasItems]);
```

### How to fix when you see the lint message

1. Move the boolean condition out of the dependency array into a clearly named variable.
2. Use that variable inside the hook callback and in the dependency list.
3. Prefer boolean prefixes (`has`, `is`, `should`) so the dependency communicates intent at a glance.

### Suggested Variable Names

The rule proposes boolean names following common conventions (feel free to rename to fit context):

- `hasData` for existence checks
- `hasItems` for key count checks
- `hasUser` for complex conditions
- `isEmptyData` / `isEmptyItems` when explicitly modeling absence
- `hasNonEmptyData` / `hasNonEmptyItems` when a positive form reads cleaner
- `isNotEmpty` / `hasNoItems` to mirror existing naming in the surrounding codebase

Choose `isEmpty*` variants when callers gate logic on the lack of data, and prefer `hasNonEmpty*` when dependencies should emphasize the positive case to keep dependency arrays and render conditions consistent.

### When Not To Use It

You might want to disable this rule if:

- You're not using React hooks
- You intentionally want hooks to re-run on any object change
- You're working with objects that change infrequently
- The performance impact is negligible for your use case
This rule has no configuration options and works out of the box.
