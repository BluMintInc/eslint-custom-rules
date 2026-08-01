# Detects and suggests optimizations for boolean conditions formed over objects in React hook dependencies. Suggests extracting boolean conditions into separate variables to reduce unnecessary re-computations when objects change frequently but the boolean condition changes less frequently (`@blumintinc/blumint/optimize-object-boolean-conditions`)

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

A negated identifier only qualifies when it can actually hold an object. Negating a primitive produces a stable boolean already, so `!isCollapsed` and `!count` carry none of the cost this rule removes — see [Dependencies the rule leaves alone](#dependencies-the-rule-leaves-alone).

### Examples

#### ❌ Incorrect

Boolean conditions remain inline in dependency arrays, so any object reference change forces a rerun even when the boolean outcome is identical:

```jsx
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

```jsx
const result = useMemo(() => {
  return !data ? [] : processData();
}, [!data]); // Boolean condition in dependency array → triggers the rule
```

```jsx
const callback = useCallback(() => {
  return Object.keys(items).length === 0 ? 'empty' : 'not empty';
}, [Object.keys(items).length === 0]); // Object key count check in dependency array
```

#### ✅ Correct

Extract boolean conditions into named variables and depend on them:

```jsx
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

```jsx
const hasData = data && Object.keys(data).length > 0;
const result = useMemo(() => {
  return hasData ? processData() : [];
}, [hasData]);
```

```jsx
const hasItems = items && Object.keys(items).length > 0;
const callback = useCallback(() => {
  return hasItems ? 'not empty' : 'empty';
}, [hasItems]);
```

Negating a primitive is already stable, so booleans, numbers and strings stay inline:

```tsx
type PanelProps = { isCollapsed: boolean; itemCount: number };

const PanelUnmemoized = ({ isCollapsed, itemCount }: PanelProps) => {
  useEffect(() => {
    syncPanel();
  }, [!isCollapsed, !itemCount]);
  return null;
};
```

```tsx
const [query, setQuery] = useState('');
const results = useMemo(() => {
  return query ? search(query) : [];
}, [!query]);
```

### Dependencies the rule leaves alone

A dependency is skipped when its identifier cannot be an object:

- **Approved boolean prefixes.** Names carrying a prefix from [`enforce-boolean-naming-prefixes`](./enforce-boolean-naming-prefixes.md) (`is`, `has`, `can`, `should`, `will`, `was`, `does`, `did`, `must`, and the rest of that list) are booleans by convention. That rule *requires* those prefixes, so flagging `!isCollapsed` here would leave no name that satisfies both rules.
- **Same-file primitive evidence.** A `boolean` / `number` / `string` / `bigint` annotation on the binding — including one inherited from a destructured prop's object type, a local `type` alias, or a local `interface` — plus primitive literal initializers (`= true`, `= 0`, `` = `x` ``) and `useState` calls seeded with a primitive (`useState('')`, `useState<boolean>()`).

### Known limitation

Detection is syntactic. An identifier whose type lives in another module (an import, or a value returned by an imported hook) cannot be resolved without type information, so a negated primitive from such a binding still reports. Extract the condition into a prefixed boolean — which the codebase wants anyway — or suppress that line with `eslint-disable-next-line`.

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
