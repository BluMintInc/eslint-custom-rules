# Enforce using fast-deep-equal for equality checks instead of microdiff (`@blumintinc/blumint/fast-deep-equal-over-microdiff`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using fast-deep-equal for equality checks instead of microdiff.

## Rule Details

This rule enforces that boolean equality checks use `fast-deep-equal` instead of counting results from `microdiff`. `microdiff` builds and returns a change list for diff inspection, so using it for equality forces unnecessary allocations and obscures the intent of a simple true/false comparison. `fast-deep-equal` performs a direct equality check and keeps equality intent obvious.

### Why this matters

- `microdiff` creates diff entries (paths, types, values) before you ever count `.length`, which is wasted work when you only need a boolean.
- Equality intent is explicit with `isEqual(a, b)`, reducing the chance that future edits treat the value as a diff they can iterate.
- `fast-deep-equal` is optimized for equality and avoids the extra allocations that slow hot code paths.

### What this rule checks

- Comparisons such as `microdiff(a, b).length === 0`, `0 === diff(a, b).length`, or `!diff(a, b).length`.
- Comparisons that use a variable assigned to `diff(...)` when that variable is only used for `.length` checks.
- Aliased imports of both `microdiff` and `fast-deep-equal`.

### Autofix

- Adds `fast-deep-equal` import if missing, keeping any existing local alias or adding a default import named `isEqual`.
- Replaces `microdiff` length comparisons with the imported equality function call (for example, `isEqual(left, right)` or a local alias like `deepEqual(left, right)`), or its negation for inequality checks.

### Examples of **incorrect** code for this rule:

```ts
import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

function areObjectsLooseEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}

function areObjectsEqual(obj1, obj2) {
  return !diff(obj1, obj2).length;
}

function updateIfNeeded(obj1, obj2) {
  if (diff(obj1, obj2).length === 0) {
    return false;
  }
  return true;
}
```

### Examples of **correct** code for this rule:

```ts
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}
```

```ts
import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}
```

```ts
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}
```

### Valid usage of microdiff:

This rule does not flag the use of `microdiff` when it's being used for its intended purpose - analyzing specific differences between objects:

```ts
import { diff } from 'microdiff';

// Using microdiff to get detailed changes
function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}

function applyPartialUpdates(oldSettings, newSettings) {
  const changes = diff(oldSettings, newSettings);
  const needsRefresh = changes.some(change =>
    change.path.includes('critical_setting')
  );
  return needsRefresh;
}

function detectItemChanges(oldItems, newItems) {
  const changes = diff(oldItems, newItems);
  const addedItems = changes.filter(change => change.type === 'CREATE');
  const removedItems = changes.filter(change => change.type === 'REMOVE');
  const updatedItems = changes.filter(change => change.type === 'UPDATE');
  return { addedItems, removedItems, updatedItems };
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}
```

## When Not To Use It

You should not use this rule if:

1. You deliberately want to rely on `microdiff` for both diffing and equality checks and accept the extra allocations.
1. Your code path is not performance-sensitive and you prefer to avoid importing `fast-deep-equal`.
1. You maintain compatibility with code that depends on `microdiff`’s change objects even when equality is all that is needed.

## Further Reading

- [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) - A fast deep equality check library
- [microdiff](https://github.com/AsyncBanana/microdiff) - A tiny, fast, zero-dependency object and array comparison library
- [Performance Comparison](https://github.com/epoberezkin/fast-deep-equal#benchmark) - Benchmark comparisons of deep equality libraries
