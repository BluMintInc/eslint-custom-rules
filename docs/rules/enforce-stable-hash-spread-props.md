# Require stableHash wrapping when spread props rest objects are used in React hook dependency arrays to avoid re-renders triggered by new object references on every render (`@blumintinc/blumint/enforce-stable-hash-spread-props`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

**Wrap spread props rest objects in React hook dependency arrays with `stableHash()` (or another stable hash) so hooks do not re-run on every render due to new object identities.**

- Why: Rest props such as `...typographyProps` are new objects each render. When they appear in dependency arrays, React sees a new reference on every render and re-runs effects or memo callbacks even when the values did not change.
- Fix: Depend on a stable hash (for example, `stableHash(typographyProps)`) or a memoized value instead of the raw rest object.

## Rule Details

This rule looks for rest props extracted in function components and used directly inside dependency arrays of the React hooks named by `hookNames`, which defaults to `useEffect`, `useLayoutEffect`, `useInsertionEffect` and `useCallback`. It reports when the raw rest object is used as a dependency and auto-fixes by:

- Wrapping the dependency with `stableHash(...)`.
- Adding `import { stableHash } from 'functions/src/util/hash/stableHash';` if it is missing.
- Inserting `// eslint-disable-next-line react-hooks/exhaustive-deps` on the line above the dependency array when needed to avoid secondary violations from `react-hooks/exhaustive-deps`.

That comment needs a line of its own, which forces Prettier to print the hook call with one argument per line, so the fix re-emits the whole argument list in that shape. A call whose argument list cannot be reproduced faithfully is reported without a fix rather than rewritten: a comment written between the arguments would be deleted by the re-emission, a call nested inside another expression does not indent against the line it starts on, and an argument broken across lines because it did not fit the room it had may not stay broken once the expansion changes that room.

Rest objects that are already hashed (e.g., `stableHash(restProps)`) or memoized with a stable dependency helper (e.g., `useDeepCompareMemo`) are ignored.

`useMemo` and `useDeepCompareMemo` are themselves the memoization the rule steers toward, so a rest object in one of their dependency arrays is not the mistake that the same object in an effect's dependencies is. Neither hook is checked by default; name it in `hookNames` to opt in.

## Options

- `hashImport.source` (default `functions/src/util/hash/stableHash`): Module path used by the fixer when adding the `stableHash` import.
- `hashImport.importName` (default `stableHash`): Imported identifier used in the wrapper.
- `allowedHashFunctions` (default `[stableHash]`): Additional function names that count as stable wrappers (e.g., `['createStableHash']`).
- `hookNames` (default `['useEffect','useLayoutEffect','useInsertionEffect','useCallback']`): Hook names whose dependency arrays are checked.

## Examples

### Examples of incorrect code

```tsx
const MyComponent = ({ someProp, ...typographyProps }: Props) => {
  useEffect(() => {
    console.log('typographyProps changed!');
  }, [typographyProps]); // runs every render

  return <Typography {...typographyProps}>Hello</Typography>;
};
```

### Examples of correct code

```tsx
import { stableHash } from 'functions/src/util/hash/stableHash';

const MyComponent = ({ someProp, ...typographyProps }: Props) => {
  useEffect(
    () => {
      console.log('typographyProps changed!');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableHash(typographyProps)],
  );

  return <Typography {...typographyProps}>Hello</Typography>;
};
```

#### Already memoized (no report)

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

### Interaction with inline disable comments

The `import { stableHash } from 'functions/src/util/hash/stableHash';` statement
is added once per file, attached to the fix of the first violation that is
**not** suppressed by an inline `eslint-disable` directive. Suppressing an
individual dependency array therefore never strands the remaining
`stableHash(...)` calls without their import:

```tsx
const First = ({ ...alphaProps }: Props) => {
  // eslint-disable-next-line @blumintinc/blumint/enforce-stable-hash-spread-props
  useCallback(() => {}, [alphaProps]); // left alone
  return <div {...alphaProps} />;
};

const Second = ({ ...betaProps }: Props) => {
  // fixed, and carries the import
  useCallback(() => {}, [betaProps]);
  return <div {...betaProps} />;
};
```

The violation is reported on the dependency array, so a disable comment must sit
on the line above that array. When a hook call spans several lines, a disable
placed above the call covers the call line rather than the dependency array and
suppresses nothing.

The `react-hooks/exhaustive-deps` comments this rule inserts name a different
rule and never suppress it.

## When Not To Use It

- If your project uses a different stability helper, configure `hashImport` and/or `allowedHashFunctions` instead of disabling the rule.
- If you intentionally want the hook to run every render, add an inline disable comment for the specific dependency array.
