# Discourage useCallback([]) or useLatestCallback around static functions. Static callbacks do not need hook machinery—extract them to module-level utilities for clarity and to avoid unnecessary hook overhead (`@blumintinc/blumint/no-empty-dependency-use-callbacks`)

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
// eslint-options: {"ignoreUseLatestCallback": true}
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

### The hook import goes with the call

Unwrapping the last `useCallback`/`useLatestCallback` call in a file leaves its
import bound to nothing, so the fix removes that specifier in the same edit —
otherwise `--fix` would trade this rule's report for a `no-unused-vars` one that
nothing re-reports:

```tsx
// Before
import { useCallback, useState } from 'react';

export const Button = () => {
  const [label] = useState('hi');
  const onClick = useCallback(() => console.log('hi'), []);
  return <button onClick={onClick}>{label}</button>;
};

// After --fix
import { useState } from 'react';

const onClick = () => console.log('hi');
export const Button = () => {
  const [label] = useState('hi');
  return <button onClick={onClick}>{label}</button>;
};
```

Only the emptied specifier goes: the rest of the import declaration is
untouched, and the declaration itself is removed only when no specifier
survives, never leaving `import {} from 'react';` behind. The specifier stays
whenever anything else in the file still names it — another call the rule does
not report, a `typeof useCallback` type query, or a call nested inside the
callback body, which the hoist reproduces verbatim rather than deleting.

A member callee is handled the same way, because it reads its object:

```tsx
// Before
import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};

// After --fix
const inner = () => doThing();
export const Widget = () => {
  return inner;
};
```

Under the classic JSX runtime the same file keeps `import React from 'react';`,
and nothing in the rule looks for JSX or reads the file's extension to decide
that. The scope manager records the reference the JSX pragma creates, so
`React` simply has a surviving use — the identical question, answered by the
identical oracle `no-unused-vars` consults.

Every hoist in a file is judged and applied together, as one edit. Judged one
call at a time, a file with two hoistable callbacks never sees either as the
import's last use, and the pass that hoists both resolves every report — so
nothing would ever revisit the stranded import. A report suppressed by an
`eslint-disable` comment is left out of that batch: its hoist never happens, so
its call goes on reading the import forever.

When a binding would be orphaned but cannot be unbound safely — an import
behind an `@ts-expect-error`, a comment written inside the declaration — the
whole fix is declined and the report stands unfixed. Hoisting anyway would
trade this rule's report for a `no-unused-vars` one that nothing re-reports,
because the hoist has already resolved the violation that would have found it.

Callbacks that reference component scope or return JSX are not reported to avoid false positives. The JSX exemption is for a callback that RENDERS, and it reads the callback's value the same way whichever way its body is spelled: a callback that returns a FUNCTION returns a function, not JSX, so `useCallback(() => () => <div />, [])` is reported exactly as its block-bodied twin is. Callbacks declared in multi-variable statements may be reported without an auto-fix to avoid unsafe refactors. If a callback must stay for memoization or HMR reasons, add an `eslint-disable-next-line @blumintinc/blumint/no-empty-dependency-use-callbacks` comment with a short justification.
Callbacks declared with `let`/`var` are reported without a fix to avoid mutating declaration kinds; use `const` before applying `--fix` if hoisting is safe.
Callbacks that rely on type aliases, interfaces, enums, or namespaces defined in any enclosing block scope are treated as component-bound and will not be hoisted.
If the module already defines a value with the same name, the fixer is skipped to avoid introducing duplicate declarations.

## Warnings & Considerations

- Security/Privacy: If a hoisted callback touches sensitive values, review the `--fix` diff to ensure it does not become callable from unintended places.
- Performance: Hoisting removes hook overhead; make sure this does not conflict with deliberate memoization patterns in hot render paths.
- Scalability: When multiple components reuse a hoisted helper, prefer moving it to a shared module instead of growing a single file.
- Platform/Tooling: Validate `--fix` output on Windows/macOS/Linux when path separators or newlines could affect how fixes apply.
- React semantics: If `useLatestCallback` is intentionally kept for HMR or stale-closure handling, disable the rule locally with a short note.
