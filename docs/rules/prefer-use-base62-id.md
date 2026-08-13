# Prefer `useBase62Id()` over `uuidv4Base62()` inside useState/useRef/useMemo for stable component IDs to avoid SSR hydration mismatches (`@blumintinc/blumint/prefer-use-base62-id`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Detects `uuidv4Base62()` combined with `useState`, `useRef`, or `useMemo` for stable component IDs and suggests the purpose-built `useBase62Id()` hook, which avoids SSR hydration mismatches.

## Rule Details

`uuidv4Base62()` calls `crypto.getRandomValues()` which produces different values on the server and the client. When this is used as the initial value for `useState` or `useRef`, or as the return value of a `useMemo` with an empty dependency array, React's hydration check sees a mismatch between the server-rendered HTML and the client's first render, producing hydration warnings and potential UI flicker.

`useBase62Id()` uses React 18's `useId()` as a deterministic seed, producing identical 22-char base62 strings on both server and client.

### What the rule flags

- `useState(uuidv4Base62())` or `useState(() => uuidv4Base62())` — only when the state setter is never referenced in the component scope (i.e. the ID is never intentionally regenerated)
- `useRef(uuidv4Base62())` — when `ref.current` is never reassigned in the component scope
- `useMemo(() => uuidv4Base62(), [])` — when the dependency array is empty (functionally equivalent to `useState(() => uuidv4Base62())`)
- A bare `uuidv4Base62()` call assigned to a `const` at the top level of a React component or hook body (not inside a callback, effect, or event handler)

### What the rule allows

- `useState(() => uuidv4Base62())` where the setter IS used elsewhere (regeneration pattern)
- `useRef(uuidv4Base62())` where `ref.current` IS reassigned in the component scope (the ref is a mutable slot, not a stable ID). Type-only wrappers around the call — `as T`, `satisfies T`, `<T>expr`, a trailing `!`, or any nesting of them — leave this exemption intact, since they change nothing at runtime
- `uuidv4Base62()` inside `useCallback`, event handlers, async functions, or `useEffect` (per-operation uniqueness)
- `useMemo(() => uuidv4Base62(), [dep])` with a non-empty dependency array
- Files outside the configured `targetPaths` (e.g. `src/util/`, backend code)
- Other ID generators (`nanoid()`, `uuid()`, etc.)

The rule only tracks `uuidv4Base62` when it is imported by name from a module path ending in `uuidv4Base62`, and only inside a component or hook body — a locally defined function of the same name, or a call at module top level, is not flagged. Each example below therefore carries its own import and component wrapper.

### Memoized components

`memo`, `React.memo` and `forwardRef` stand between a component's function and
the binding that names it, so the name deciding component-hood is the one the
declarator binds — `const ExamplePanel = memo(() => ...)` is the same component
as `const ExamplePanel = () => ...` and is flagged identically. Nested wrappers
(`memo(forwardRef(...))`), the optional spellings (`memo?.(...)`,
`React?.memo(...)`) and a type assertion on either side of the call are all read
through. Since `require-memo` rewrites components into `memo(...)`, most
components reach this rule wrapped.

Only the first argument is followed. A comparator passed as `memo`'s second
argument (`memo(ExamplePanel, compareDeeply('id'))`) runs per comparison, so an
ID minted there is per-operation and stays exempt — as does any other call that
is not one of these wrappers, whose argument is as likely a callback.

### Examples

#### Incorrect

```tsx
// File: src/components/example/ExamplePanel.tsx
import { useState, useRef, useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';

const ExamplePanel = () => {
  // Stable ID that never changes — should use useBase62Id()
  const [placementId] = useState(() => uuidv4Base62());

  // Setter destructured but never called
  const [id, setId] = useState(() => uuidv4Base62());

  // useRef with stable ID
  const idRef = useRef(uuidv4Base62());

  // useMemo with empty deps is equivalent to useState initializer
  const stableId = useMemo(() => uuidv4Base62(), []);

  return <div id={placementId} data-x={id} ref={idRef} key={stableId} />;
};
```

```tsx
// File: src/components/example/ExamplePanel.tsx
import { memo, useState } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';

// The memo wrapper `require-memo` emits changes nothing: the ID is still minted
// once per mount and still mismatches between server and client
const ExamplePanel = memo(({ existingId }) => {
  const [placementId] = useState(() => existingId ?? uuidv4Base62());
  return <div id={placementId}>Hello</div>;
});
```

#### Correct

```tsx
// File: src/components/example/ExamplePanel.tsx
import { useState, useMemo } from 'react';
import { uuidv4Base62 } from 'functions/src/util/uuidv4Base62';
import { useBase62Id } from 'src/hooks/useBase62Id';

const ExamplePanel = ({ prefix, file, submit, upload }) => {
  // Purpose-built hook: deterministic across SSR and CSR
  const placementId = useBase62Id();

  // Setter IS used — regeneration pattern (e.g. after a completed operation)
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4Base62());
  const submitForm = async () => {
    await submit({ idempotencyKey });
    setIdempotencyKey(uuidv4Base62()); // intentional regeneration
  };

  // Per-operation uniqueness inside a callback — valid
  const uploadFile = () => {
    const operationId = uuidv4Base62();
    upload(file, operationId);
  };

  // Non-empty deps — value recomputed when deps change, not at mount
  const key = useMemo(() => `${prefix}-${uuidv4Base62()}`, [prefix]);

  return (
    <form id={placementId} key={key} onSubmit={submitForm}>
      <button onClick={uploadFile}>Upload</button>
    </form>
  );
};
```

```tsx
// File: src/components/example/ExamplePanel.tsx
import { memo } from 'react';
import { useBase62Id } from 'src/hooks/useBase62Id';

const ExamplePanel = memo(() => {
  const placementId = useBase62Id();
  return <div id={placementId}>Hello</div>;
});
```

## Options

```javascript
{
  '@blumintinc/blumint/prefer-use-base62-id': [
    'error',
    {
      targetPaths: [
        'src/hooks/**',
        'src/contexts/**',
        'src/pages/**',
        'src/components/**',
      ],
    },
  ],
}
```

### `targetPaths`

- **Type:** `string[]`
- **Default:** `['src/hooks/**', 'src/contexts/**', 'src/pages/**', 'src/components/**']`

Glob patterns for files where the rule is active. Files not matching any pattern are ignored. This intentionally excludes `src/util/` where `uuidv4Base62()` is legitimately used outside React component context.

## When to disable

Disable on individual lines when you have verified that the ID truly is mount-scoped but the migration to `useBase62Id()` must be deferred, e.g.:

```typescript
// eslint-disable-next-line @blumintinc/blumint/prefer-use-base62-id
const [legacyId] = useState(() => uuidv4Base62());
```
