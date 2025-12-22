# Require stableHash wrapping when spread props rest objects are used in React hook dependency arrays to avoid re-renders triggered by new object references on every render (`@blumintinc/blumint/enforce-stable-hash-spread-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

**Wrap spread props rest objects in React hook dependency arrays with `stableHash()` (or another stable hash) so hooks do not re-run on every render due to new object identities.**

- Why: Rest props such as `...typographyProps` are new objects each render. When they appear in dependency arrays, React sees a new reference on every render and re-runs effects or memo callbacks even when the values did not change.
- Fix: Depend on a stable hash (for example, `stableHash(typographyProps)`) or a memoized value instead of the raw rest object.

## Rule Details

This rule looks for rest props extracted in function components and used directly inside dependency arrays of React hooks (`useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`). It reports when the raw rest object is used as a dependency and auto-fixes by:

- Wrapping the dependency with `stableHash(...)`.
- Adding `import { stableHash } from 'functions/src/util/hash/stableHash';` if it is missing.
- Inserting `// eslint-disable-next-line react-hooks/exhaustive-deps` immediately before the dependency array when needed to avoid secondary violations from `react-hooks/exhaustive-deps`.

Rest objects that are already hashed (e.g., `stableHash(restProps)`) or memoized with a stable dependency helper (e.g., `useDeepCompareMemo`) are ignored.

## Options

- `hashImport.source` (default `functions/src/util/hash/stableHash`): Module path used by the fixer when adding the `stableHash` import.
- `hashImport.importName` (default `stableHash`): Imported identifier used in the wrapper.
- `allowedHashFunctions` (default `[stableHash]`): Additional function names that count as stable wrappers (e.g., `['createStableHash']`).
- `hookNames` (default `['useEffect','useLayoutEffect','useInsertionEffect','useCallback']`): Hook names whose dependency arrays are checked.

## Examples

Bad:

```tsx
const MyComponent = ({ someProp, ...typographyProps }: Props) => {
  useEffect(() => {
    console.log('typographyProps changed!');
  }, [typographyProps]); // runs every render

  return <Typography {...typographyProps}>Hello</Typography>;
};
```

Good:

```tsx
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ someProp, ...typographyProps }: Props) => {
  useEffect(() => {
    console.log('typographyProps changed!');
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [stableHash(typographyProps)]);

  return <Typography {...typographyProps}>Hello</Typography>;
};
```

Already memoized (no report):

```tsx
const MyComponent = ({ someProp, ...typographyPropsRaw }: Props) => {
  const typographyProps = useDeepCompareMemo(
    () => typographyPropsRaw,
    [typographyPropsRaw],
  );
  useEffect(() => {}, [typographyProps]);
  return <Typography {...typographyProps} />;
};
```

## When Not To Use It

- If your project uses a different stability helper, configure `hashImport` and/or `allowedHashFunctions` instead of disabling the rule.
- If you intentionally want the hook to run every render, add an inline disable comment for the specific dependency array.
