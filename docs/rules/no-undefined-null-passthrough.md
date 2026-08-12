# Avoid functions that return undefined or null when their single argument is undefined or null (`@blumintinc/blumint/no-undefined-null-passthrough`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule flags functions that respond to a null or undefined argument by immediately returning null, undefined, or nothing. Passing the absence straight through hides where validation should happen, makes the function partial, and pushes callers to chase nullish values at runtime. The rule exempts React hooks (functions starting with `use`) and functions that actually transform the argument instead of just handing the emptiness back.

## Why this matters

- Nullish passthrough hides the real source of missing data and delays failures.
- Functions that sometimes return nullish values force every caller to add defensive code, increasing branching and bugs.
- Guarding arguments up front or returning a concrete fallback keeps functions total and predictable.

## Examples

### ❌ Incorrect

```typescript
function extractAudioTrack(audioTrackPublications) {
  if (!audioTrackPublications) {
    return;
  }
  const publication = audioTrackPublications.values().next().value;
  return publication?.audioTrack;
}
```

### ❌ Incorrect (guarding with `&&` or a ternary)

A function that answers a nullish argument with `&&` or with a ternary whose alternate is `null`/`undefined` passes the absence through just as plainly. The body spelling makes no difference: an implicit return and a block whose sole statement returns the same expression state the same thing.

```typescript
const getValue = (data) => data && data.value;

const getName = (user) => {
  return user ? user.name : null;
};
```

### ✅ Correct (validate before calling)

```typescript
function extractAudioTrack(audioTrackPublications) {
  if (!audioTrackPublications) {
    throw new Error('audioTrackPublications is required');
  }
  const publication = audioTrackPublications.values().next().value;
  return publication?.audioTrack ?? null;
}
```

### ✅ Correct (return a meaningful fallback)

```typescript
function deriveRounds(rounds) {
  if (!rounds) {
    return [];
  }
  return Object.values(rounds)
    .filter(Boolean)
    .sort((a, b) => a.roundIndex - b.roundIndex);
}
```

### ✅ Correct (the identity function)

Returning the argument unchanged is not a passthrough of an absence. What the rule looks for is a function that *answers* a nullish argument by handing it back — a guard, an `&&`, a ternary whose alternate is nullish. An identity function has no nullish-specific behaviour, so validating up front or returning a fallback is not a remedy for it.

```typescript
const kept = items.filter((x) => x); // the standard truthiness filter
const same = items.map((x) => x);
const identity = <T,>(value: T): T => value;
```

This holds for every spelling of that function — an implicit return, a block-bodied arrow, a declaration, a function expression — so the verdict never turns on how the body is written.
