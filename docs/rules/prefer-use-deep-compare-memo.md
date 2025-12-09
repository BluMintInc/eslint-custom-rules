# Prefer useDeepCompareMemo when dependencies are non-primitive (`@blumintinc/blumint/prefer-use-deep-compare-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`useMemo` compares dependencies by reference. Objects, arrays, and functions created inside a render receive a new identity every time, so `useMemo` treats them as "changed" and reruns the memoized computation, triggering downstream renders. `useDeepCompareMemo` (or memoizing the dependencies first) compares by value and keeps equivalent dependencies stable.

## Rule Details

- **Why**: Non-primitive dependencies change identity each render. Reference equality in `useMemo` sees them as different, so the memo recomputes and can force avoidable renders.
- **How**: The rule flags `useMemo` calls when the dependency array contains an object, array, or function that is not already memoized. Identifiers are considered safe when they come from `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo`.
- **Fix**: Auto-fix replaces `useMemo` with `useDeepCompareMemo` and inserts `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';`. You can also silence the warning by memoizing the dependencies first.

Auto-fix adds the import if needed:

```ts
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
```

### Examples

Bad – non-primitive dependency recreates each render:

```tsx
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

Good – compare dependency by value with `useDeepCompareMemo`:

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

Good – memoize the dependency first (no rule warning):

```tsx
const useUserConfig = (config: UserConfig) =>
  useMemo(() => ({ ...config, status: getStatusLabel(config.status) }), [config]);

const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
  const stableConfig = useUserConfig(userConfig);
  const formattedData = useMemo(() => stableConfig.status, [stableConfig]);
  return <ProfileCard status={formattedData} />;
};
```

### Edge Cases

- Primitives: dependency arrays with only primitives are ignored.
- Already memoized: identifiers produced by `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo` are treated as stable.
- Empty dependency arrays: ignored.
- JSX in memo body: ignored, to avoid false positives with JSX-returning memos.
- Performance hotspots: prefer memoizing dependencies instead of deep comparison when deep equality cost is a concern.

### Options

- None

### When Not To Use It

- Performance hotspots where deep comparison overhead is undesirable. You can disable the rule for a specific line:

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-use-deep-compare-memo
const x = useMemo(() => compute(data), [data]);
```

## Version

- Introduced in v1.10.0