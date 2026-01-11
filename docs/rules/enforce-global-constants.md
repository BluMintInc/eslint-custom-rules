# Enforce using global static constants instead of useMemo with empty dependency arrays (`@blumintinc/blumint/enforce-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Creating stable references for object literals using `useMemo` with an empty dependency array adds unnecessary hook overhead. This rule suggests hoisting such literals to module-level constants.

## Why this rule?

- Global constants are evaluated once and provide a stable reference across all renders without hook overhead.
- Hoisting data out of components clarifies which values are static and which depend on component state.
- Stable references are critical for preventing unnecessary re-renders in child components or re-running effects.

## Examples

### ❌ Incorrect

```tsx
const MyComponent = () => {
  // Hook overhead for a static literal
  const options = useMemo(() => ({ enabled: true }), []);
  
  return <Child options={options} />;
};
```

Example message:

```text
Object literal in useMemo with empty dependencies might be better as a global static constant. This rule is a suggestion; small or frequently changed literals might not justify a global constant. If this inline literal is preferred, please use an // eslint-disable-next-line @blumintinc/blumint/enforce-global-constants comment. Otherwise, consider hoisting it to a module-level constant.
```

### ✅ Correct

```tsx
const OPTIONS = { enabled: true };

const MyComponent = () => {
  return <Child options={OPTIONS} />;
};
```

### ✅ Correct (With disable comment if inline is preferred)

```tsx
const MyComponent = () => {
  // eslint-disable-next-line @blumintinc/blumint/enforce-global-constants
  const options = useMemo(() => ({ enabled: true }), []);
  return <Child options={options} />;
};
```

## Options

This rule does not have any options.

## When Not To Use It

Disable this rule for very small components where hook overhead is negligible, or when you prefer keeping simple configuration data local to the component body. Use an `// eslint-disable-next-line @blumintinc/blumint/enforce-global-constants` comment for local exceptions.
