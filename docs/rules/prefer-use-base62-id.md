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
- `uuidv4Base62()` inside `useCallback`, event handlers, async functions, or `useEffect` (per-operation uniqueness)
- `useMemo(() => uuidv4Base62(), [dep])` with a non-empty dependency array
- Files outside the configured `targetPaths` (e.g. `src/util/`, backend code)
- Other ID generators (`nanoid()`, `uuid()`, etc.)

### Examples

#### Incorrect

```tsx
// Stable ID that never changes — should use useBase62Id()
const [placementId] = useState(() => uuidv4Base62());

// Setter destructured but never called
const [id, setId] = useState(() => uuidv4Base62());
// ... setId never referenced

// useRef with stable ID
const idRef = useRef(uuidv4Base62());

// useMemo with empty deps is equivalent to useState initializer
const stableId = useMemo(() => uuidv4Base62(), []);
```

#### Correct

```tsx
// Purpose-built hook: deterministic across SSR and CSR
const placementId = useBase62Id();

// Setter IS used — regeneration pattern (e.g. after a completed operation)
const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv4Base62());
const handleSubmit = async () => {
  await submit({ idempotencyKey });
  setIdempotencyKey(uuidv4Base62()); // intentional regeneration
};

// Per-operation uniqueness inside a callback — valid
const handleUpload = () => {
  const operationId = uuidv4Base62();
  upload(file, operationId);
};

// Non-empty deps — value recomputed when deps change, not at mount
const key = useMemo(() => `${prefix}-${uuidv4Base62()}`, [prefix]);
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
