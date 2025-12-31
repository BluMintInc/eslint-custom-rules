# Hoist object destructuring out of React hooks so dependency arrays track the fields in use instead of the entire object (`@blumintinc/blumint/enforce-early-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Destructuring inside `useEffect`, `useLayoutEffect`, `useCallback`, or `useMemo` forces the dependency array to include the whole object. That dependency re-triggers when any field changes, even if the hook only reads a few properties. Hoisting destructuring to the nearest outer scope allows the dependency array to reference the specific fields actually used, avoiding extra renders and keeping dependency tracking precise.

The fixer:
- Hoists object destructuring out of the hook callback.
- Adds `?? {}` plus `= {}` / `= []` defaults for nested object or array patterns so hoisted destructuring tolerates missing/undefined inputs (nested properties that are explicitly `null` still throw).
- Replaces the object dependency with the destructured bindings when the callback no longer references the base object; otherwise, keeps the original dependency and adds the bindings.
- Merges multiple destructures of the same object into a single hoisted pattern.
- Skips destructuring inside async callbacks or nested async helpers.
- Skips destructuring that depends on type-narrowing checks, including truthiness guards on the object (e.g., `if (!response) return;`).

### ❌ Incorrect

```typescript
const MyComponent = () => {
  const audioPlayback = useAudioPlayback();

  useEffect(() => {
    const { canPlayAudio, startAudio } = audioPlayback;
    if (!canPlayAudio) return;
    startAudio();
  }, [audioPlayback]); // Entire object in deps
};
```

```typescript
useEffect(() => {
  const { items: [first, second] } = response;
  consume(first, second);
}, [response]);
```

```typescript
useCallback(() => {
  const { name } = user;
  const { age } = user;
  log(name, age);
}, [user]);
```

### ✅ Correct

```typescript
const MyComponent = () => {
  const audioPlayback = useAudioPlayback();
  const { canPlayAudio, startAudio } = audioPlayback ?? {};

  useEffect(() => {
    if (!canPlayAudio) return;
    startAudio();
  }, [canPlayAudio, startAudio]);
};
```

```typescript
const { data } = response ?? {};

useEffect(() => {
  if (!data) return;
  processData(data);
}, [data]);
```

```typescript
const { name, age } = user ?? {};

useCallback(() => {
  log(name, age);
}, [name, age]);
```

```typescript
const { items: [first, second] = [] } = response ?? {};

useEffect(() => {
  consume(first, second);
}, [first, second]);
```

### When to disable

- Destructuring relies on a type-narrowed branch and cannot be safely hoisted.
- The hook callback is intentionally async and depends on values resolved inside it.
- Hoisting would introduce scope/name collisions or change runtime behavior; in these cases the rule reports but withholds the autofix to avoid unsafe rewrites.
