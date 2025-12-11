# Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays, functions) that are not already memoized. This prevents unnecessary re-renders due to reference changes (`@blumintinc/blumint/prefer-use-deep-compare-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using `useDeepCompareMemo` instead of React's `useMemo` when the dependency array contains pass-by-reference values (objects, arrays, functions) that aren't already memoized. This prevents unnecessary re-renders caused by reference-equality checks failing for structurally identical but newly created references.

## Rule Details

- **Why**: `useMemo` uses reference equality on dependencies. Inline objects/arrays/functions or non-stable identifiers will create new references on each render, retriggering the memoized computation. `useDeepCompareMemo` uses deep equality, reducing unnecessary recalculations/renders.
- **What it checks**:
  - Targets `useMemo` calls whose dependency array contains at least one non-primitive value (object, array, function)
  - Ignores cases where those non-primitives are already memoized above (e.g., via `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo`)
  - Ignores empty dependency arrays
  - Ignores cases where the `useMemo` returns JSX (see `@blumintinc/blumint/react-usememo-should-be-component`)

This rule is auto-fixable: it replaces `useMemo` with `useDeepCompareMemo` and adds an import:

```ts
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
```

### Examples

Bad: useMemo with unmemoized object dependency:

```tsx
// Component re-renders whenever `userConfig` reference changes
const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
  const formattedData = useMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin),
    };
  }, [userConfig]);

  return <ProfileCard data={formattedData} />;
};
```

Good: useDeepCompareMemo with structurally identical objects:

```tsx
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
  const formattedData = useDeepCompareMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin),
    };
  }, [userConfig]);

  return <ProfileCard data={formattedData} />;
};
```

### Edge Cases

- Primitives only: dependency arrays with only primitives are ignored
- Already memoized: identifiers produced by `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo` are considered stable and won’t trigger
- Empty dependency arrays: ignored
- JSX in memo body: rule does not trigger when the memo body contains JSX (handled by `@blumintinc/blumint/react-usememo-should-be-component`)

### When Not To Use It

- Performance hotspots where deep comparison overhead is undesirable. You can disable the rule for a specific line:

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-use-deep-compare-memo
const x = useMemo(() => compute(data), [data]);
```

## Version

- Introduced in v1.10.0
