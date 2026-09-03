# Enforce correct narrowing of FirestoreSnapshotState<T> variables. Falsy/truthy checks are semantic bugs because all string states are truthy; raw typeof narrowing to data bypasses the isSnapshotReady abstraction (`@blumintinc/blumint/enforce-snapshot-state-narrowing`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

`FirestoreSnapshotState<T>` is a discriminated union type (`'idle' | 'loading' | T | 'not-found'`) returned by all Firestore subscription hooks. Since `T extends DocumentData` (always an object), and the string literals are all truthy, three common JavaScript patterns produce silent bugs:

1. **Falsy/truthy checks** — `!state`, `if (state)`, `state && ...`, `state || fallback`, `state ? a : b`, `!!state`, `Boolean(state)` — all string states (`'idle'`, `'loading'`, `'not-found'`) are truthy, so these checks never behave as intended. The correct pattern is `isSnapshotReady(state)`.
2. **Nullish fallbacks** — `state ?? fallback` is flagged for its own reason, and reports under `noNullishFallback` rather than `noFalsyCheck`. No member of the union is `null` or `undefined`, so the expression always evaluates to the state itself: the fallback is unreachable and a state string ends up bound where data was expected. `??` is therefore no safer than `||` on a snapshot state, even though it is the right operator on a genuinely nullable value.
3. **Raw `typeof` narrowing to data** — `typeof state === 'object'` or `typeof state !== 'string'` are manual reimplementations of `isSnapshotReady` and bypass the abstraction boundary.

### Examples of **incorrect** code:

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

// BUG: 'loading' is truthy, so the fallback is never taken.
const orData = state || defaultUser;

// BUG: no state is null or undefined, so the fallback is unreachable and
// orData/nullishData can both hold the literal string 'loading'.
const nullishData = state ?? defaultUser;
```

### Examples of **correct** code:

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

// Correct: the guard chooses the fallback, so the fallback is reachable.
const data = isSnapshotReady(state) ? state : defaultUser;

// Correct: ?? on a value that really can be null or undefined.
const maybeUser = findUser(id);
const user = maybeUser ?? defaultUser;
```

## Suggestions

Each report carries one suggestion that rewrites the flagged expression in terms of `isSnapshotReady` and brings the guard into scope.

The rewrite preserves the meaning of the original expression:

| Flagged                                                  | Suggested                                   |
| -------------------------------------------------------- | ------------------------------------------- |
| `!state`                                                 | `!isSnapshotReady(state)`                   |
| `state`, `!!state`, `Boolean(state)`                     | `isSnapshotReady(state)`                    |
| `state && expr`                                          | `isSnapshotReady(state) && expr`            |
| `state \|\| fallback`                                    | `isSnapshotReady(state) ? state : fallback` |
| `state ?? fallback`                                      | `isSnapshotReady(state) ? state : fallback` |
| `typeof state === 'object'`, `typeof state !== 'string'` | `isSnapshotReady(state)`                    |

A falsy check keeps its negation — replacing `!state` with the positive guard would reverse the control flow. `||` becomes a conditional because the operand carries a value: swapping it for the guard alone would yield `true` instead of the data. `??` takes the same rewrite for the same reason.

The rewrite is offered as a suggestion and never as an autofix, because it changes behaviour: the flagged expression and its replacement disagree on exactly the cases the report is about. That also keeps this rule and `prefer-nullish-coalescing-boolean-props` from fighting over the operator under `--fix` — that rule rewrites `||` to `??`, and this one applies nothing on its own.

Only the operand that decides the expression is claimed. `fallback ?? state` and `fallback || state` are left alone: the snapshot state sits on the right, where the rule cannot tell a deliberate default apart from a mistake, and a false positive there costs more than the missed report.

The suggestion also imports `isSnapshotReady`. It extends an existing import of the guard's module (reusing that file's own path), inserts `guardImportSource` when there is none, and does nothing when the guard is already in scope. When the name is taken by something that is not the guard — an unrelated binding or a type-only import — the suggestion is withheld rather than emitting a call to the wrong thing.

A codebase whose guard is named something else sets `guardFunctions`: the first entry is the name the suggestion calls, looks up in scope, and imports, so it pairs with `guardImportSource` to point at an export that exists. With `guardFunctions: ['isReady']` and `guardImportSource: 'src/utils/guards'`, the suggestion writes `import { isReady } from 'src/utils/guards';` and rewrites `!state` as `!isReady(state)`.

## Options

```js
{
  '@blumintinc/blumint/enforce-snapshot-state-narrowing': ['error', {
    // Hook names that return FirestoreSnapshotState<T>.
    // Default: ['useDocSnapshot', 'useCollectionSnapshot', 'useCachedDocSnapshot', 'useFirestore']
    snapshotHooks: ['useDocSnapshot', 'useCollectionSnapshot'],

    // Guard function names. The first usable entry is the canonical one: it is
    // the name every suggestion calls, resolves in scope, and imports. A list
    // that names nothing (empty, or only blanks) leaves the default in place.
    // Detection of violations does not depend on this option — it is purely
    // syntactic, by hook source.
    // Default: ['isSnapshotReady']
    guardFunctions: ['isSnapshotReady'],

    // Files to exclude (e.g. the guard implementation itself).
    // Default: ['src/types/FirestoreSnapshotState.ts']
    excludeFiles: ['src/types/FirestoreSnapshotState.ts'],

    // Module the suggestion imports the guard from when the file has no
    // import of the guard's module to extend.
    // Default: 'src/types/FirestoreSnapshotState'
    guardImportSource: '@/types/FirestoreSnapshotState',
  }]
}
```

## When Not To Use It

Disable this rule only in files that intentionally implement the `isSnapshotReady` guard itself (the implementation file already appears in the default `excludeFiles` list).
