# Consolidate consecutive Array.push calls (`@blumintinc/blumint/flatten-push-calls`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Combine consecutive `push` calls on the same array into a single call so the batched intent is obvious and we avoid repeated function-call overhead.

## Rule Details

Array `push` accepts multiple arguments. Spreading consecutive calls into one call keeps evaluation order intact, preserves spreads, and makes it clear which items are added together.

### ❌ Incorrect

```typescript
const handlers = [];
handlers.push(fnA);
handlers.push(fnB);
handlers.push(fnC);
```

```typescript
const items = [];
items.push(first);
// ensure the next item is captured
items.push(second);
items.push(...more);
```

### ✅ Correct

```typescript
const handlers = [];
handlers.push(fnA, fnB, fnC);
```

```typescript
const items = [];
items.push(
  first,
  // ensure the next item is captured
  second,
  ...more
);
```

## When Not To Use It

Skip this rule if your style guide prefers one-argument pushes for logging or tracing purposes, even when they are consecutive.

## Implementation

- [Rule source](../../src/rules/flatten-push-calls.ts)
- [Test source](../../src/tests/flatten-push-calls.test.ts)
