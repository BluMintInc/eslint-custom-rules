# no-empty-dependency-use-callbacks

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💭 This rule does not require type information.

Flag `useCallback` calls with an empty dependency array and `useLatestCallback` wrappers whose callbacks never read component or hook state. Static callbacks do not need hook machinery—extract them to module-level utilities instead of keeping zero-dependency hooks.

## Why

- Avoids running hook machinery for callbacks that never change.
- Keeps component bodies focused on reactive dependencies instead of static helpers.
- Encourages reusability by moving stateless helpers to shared utilities.

## Rule Details

### ❌ Incorrect

```tsx
import { useCallback, useState } from 'react';
import { useLatestCallback } from 'use-latest-callback';

const MyComponent = () => {
  const [count, setCount] = useState(0);

  // Empty deps: behaves like a static helper but still uses hook machinery
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }, []);

  // Static function wrapped in useLatestCallback adds overhead with no gain
  const validateEmail = useLatestCallback((email: string) => {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
  });

  return (
    <div>
      <p>Count: {count}</p>
      <p>Price: {formatCurrency(29.99)}</p>
      <p>Valid email: {validateEmail('test@example.com') ? 'Yes' : 'No'}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
};
```

### ✅ Correct

```tsx
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    amount,
  );

const validateEmail = (email: string) => {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
};

const MyComponent = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <p>Price: {formatCurrency(29.99)}</p>
      <p>Valid email: {validateEmail('test@example.com') ? 'Yes' : 'No'}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
};
```

## Options

```json
{
  "@blumintinc/blumint/no-empty-dependency-use-callbacks": [
    "error",
    {
      "ignoreTestFiles": true,
      "testFilePatterns": ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
      "ignoreUseLatestCallback": false
    }
  ]
}
```

- `ignoreTestFiles` (default `true`): Skip reporting in test files.
- `testFilePatterns` (default `["**/__tests__/**", "**/*.test.*", "**/*.spec.*"]`): Glob patterns used when `ignoreTestFiles` is enabled.
- `ignoreUseLatestCallback` (default `false`): Disable checks for `useLatestCallback` while still checking `useCallback([])`.

## Valid

```tsx
function Component({ id }: { id: string }) {
  const handle = useCallback(() => track(id), [id]); // deps are not empty
  return <button onClick={handle}>Track</button>;
}
```

```tsx
function Component() {
  const renderItem = useCallback((item) => <Item key={item.id} data={item} />, []);
  return <List renderItem={renderItem} />; // JSX return stays inside component
}
```

```tsx
// Allowed when callback needs component scope values
function Component() {
  const componentId = useId();
  const log = useCallback((event) => analytics.track(event, { componentId }), []);
  return <button onClick={() => log('click')}>Click</button>;
}
```

```tsx
// useLatestCallback ignored when explicitly configured
function Component() {
  const latest = useLatestCallback(() => 'value');
  return <div>{latest()}</div>;
}
```

```tsx
// Allowed when callback depends on a component-scoped type alias
function Component() {
  type HandlerEvent = { value: string };
  const handler = useCallback((event: HandlerEvent) => event.value.length, []);
  return <div>{handler({ value: 'a' })}</div>;
}
```

## Invalid

```tsx
// ✖ useCallback([]) around a static helper
const Component = () => {
  const formatCurrency = useCallback((value) => value.toFixed(2), []);
  return <span>{formatCurrency(10)}</span>;
};
```

```tsx
// ✖ Static useLatestCallback
const Component = () => {
  const validateEmail = useLatestCallback((email) => email.includes('@'));
  return <div>{validateEmail('a@b.com') ? 'ok' : 'bad'}</div>;
};
```

## Fixes

The fixer hoists safe callbacks to module scope and replaces the `useCallback`/`useLatestCallback` declaration when it is a single, named variable declaration inside a component or custom hook:

```tsx
// Before
function Component() {
  const validateEmail = useLatestCallback((email) => email.includes('@'));
  return <div>{validateEmail('a@b.com') ? 'ok' : 'bad'}</div>;
}

// After --fix
const validateEmail = (email) => email.includes('@');
function Component() {
  return <div>{validateEmail('a@b.com') ? 'ok' : 'bad'}</div>;
}
```

Callbacks that reference component scope or return JSX are not reported to avoid false positives. Callbacks declared in multi-variable statements may be reported without an auto-fix to avoid unsafe refactors. If a callback must stay for memoization or HMR reasons, add an `eslint-disable-next-line @blumintinc/blumint/no-empty-dependency-use-callbacks` comment with a short justification.
Callbacks declared with `let`/`var` are reported without a fix to avoid mutating declaration kinds; use `const` before applying `--fix` if hoisting is safe.
Callbacks that rely on type aliases, interfaces, enums, or namespaces defined in any enclosing block scope are treated as component-bound and will not be hoisted.
If the module already defines a value with the same name, the fixer is skipped to avoid introducing duplicate declarations.

## Warnings & Considerations

- Security/Privacy: If a hoisted callback touches sensitive values, review the `--fix` diff to ensure it does not become callable from unintended places.
- Performance: Hoisting removes hook overhead; make sure this does not conflict with deliberate memoization patterns in hot render paths.
- Scalability: When multiple components reuse a hoisted helper, prefer moving it to a shared module instead of growing a single file.
- Platform/Tooling: Validate `--fix` output on Windows/macOS/Linux when path separators or newlines could affect how fixes apply.
- React semantics: If `useLatestCallback` is intentionally kept for HMR or stale-closure handling, disable the rule locally with a short note.
