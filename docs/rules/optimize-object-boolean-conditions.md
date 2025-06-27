# Detects and suggests optimizations for boolean conditions formed over objects in React hook dependencies. Suggests extracting boolean conditions into separate variables to reduce unnecessary re-computations when objects change frequently but the boolean condition changes less frequently (`@blumintinc/blumint/optimize-object-boolean-conditions`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule detects boolean conditions formed over objects in React hook dependency arrays and suggests extracting them into separate variables. This optimization helps reduce unnecessary re-computations when objects change frequently but the boolean condition result changes less frequently.

The rule addresses a common React performance anti-pattern where `useMemo`, `useCallback`, and `useEffect` hooks re-run unnecessarily because they depend on entire objects when they only care about specific boolean conditions derived from those objects.

### Patterns Detected

The rule detects the following patterns in hook dependency arrays:

- **Object existence checks**: `!obj`
- **Object key count checks**: `Object.keys(obj).length === 0`, `Object.keys(obj).length > 0`, etc.
- **Complex boolean expressions**: `!obj || Object.keys(obj).length === 0`

### Examples

❌ **Incorrect** - Boolean conditions directly in dependency arrays:

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
}, [!data]); // Boolean condition in dependency array
```

```javascript
const callback = useCallback(() => {
  return Object.keys(items).length === 0 ? 'empty' : 'not empty';
}, [Object.keys(items).length === 0]); // Object key count check in dependency array
```

✅ **Correct** - Extract boolean conditions into separate variables:

```javascript
// Extract boolean conditions to optimize useMemo re-runs
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

### Performance Benefits

By extracting boolean conditions:

1. **Reduced re-computations**: The hook only re-runs when the boolean result changes, not when unrelated object properties change
2. **Better memoization**: More precise dependency tracking leads to better memoization effectiveness
3. **Improved readability**: Boolean variables with descriptive names make the code more self-documenting

### Suggested Variable Names

The rule suggests boolean variable names following common conventions:

- `hasData` for existence checks
- `hasItems` for key count checks
- `hasUser` for complex conditions

### When Not To Use It

You might want to disable this rule if:

- You're not using React hooks
- You intentionally want hooks to re-run on any object change
- You're working with objects that change infrequently
- The performance impact is negligible for your use case

This rule has no configuration options and works out of the box.
