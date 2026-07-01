# Enforce correct narrowing of FirestoreSnapshotState<T> variables. Falsy/truthy checks are semantic bugs because all string states are truthy; raw typeof narrowing to data bypasses the isSnapshotReady abstraction (`@blumintinc/blumint/enforce-snapshot-state-narrowing`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

`FirestoreSnapshotState<T>` is a discriminated union type (`'idle' | 'loading' | T | 'not-found'`) returned by all Firestore subscription hooks. Since `T extends DocumentData` (always an object), and the string literals are all truthy, two common JavaScript patterns produce silent bugs:

1. **Falsy/truthy checks** — `!state`, `if (state)`, `state && ...`, `state ? a : b`, `!!state`, `Boolean(state)` — all string states (`'idle'`, `'loading'`, `'not-found'`) are truthy, so these checks never behave as intended. The correct pattern is `isSnapshotReady(state)`.
2. **Raw `typeof` narrowing to data** — `typeof state === 'object'` or `typeof state !== 'string'` are manual reimplementations of `isSnapshotReady` and bypass the abstraction boundary.

Examples of **incorrect** code:

```ts
const state = useDocSnapshot<User>({ docPath });

// BUG: 'loading', 'idle', and 'not-found' are all truthy strings.
if (!state) return null;

// BUG: state is always truthy, so this always renders even when state === 'loading'.
if (state) return <UserCard user={state} />;

// BUG: bypasses the isSnapshotReady abstraction.
if (typeof state === 'object' && state !== null) {
  return <UserCard user={state} />;
}

// BUG: equivalent to isSnapshotReady(state) but bypasses the guard.
if (typeof state !== 'string') {
  return <UserCard user={state} />;
}
```

Examples of **correct** code:

```ts
const state = useDocSnapshot<User>({ docPath });

// Correct: isSnapshotReady is the canonical guard.
if (!isSnapshotReady(state)) return null;

// Correct: isSnapshotReady narrows to User.
if (isSnapshotReady(state)) return <UserCard user={state} />;

// Correct: explicit string comparison is valid.
if (state === 'loading') return <Spinner />;
if (state === 'not-found') return <NotFound />;
if (state === 'idle') return null;

// Correct: typeof === 'string' checks for non-data states (allowed direction).
if (typeof state === 'string') return <Spinner />;
```

## Options

```js
{
  '@blumintinc/blumint/enforce-snapshot-state-narrowing': ['error', {
    // Hook names that return FirestoreSnapshotState<T>.
    // Default: ['useDocSnapshot', 'useCollectionSnapshot', 'useCachedDocSnapshot', 'useFirestore']
    snapshotHooks: ['useDocSnapshot', 'useCollectionSnapshot'],

    // Canonical guard function names.
    // Default: ['isSnapshotReady']
    guardFunctions: ['isSnapshotReady'],

    // Files to exclude (e.g. the isSnapshotReady implementation itself).
    // Default: ['src/types/FirestoreSnapshotState.ts']
    excludeFiles: ['src/types/FirestoreSnapshotState.ts'],
  }]
}
```

## When Not To Use It

Disable this rule only in files that intentionally implement the `isSnapshotReady` guard itself (the implementation file already appears in the default `excludeFiles` list).
