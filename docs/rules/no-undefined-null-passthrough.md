# Avoid functions that return undefined or null when their single argument is undefined or null (`@blumintinc/blumint/no-undefined-null-passthrough`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

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

## Options

This rule has no options.
