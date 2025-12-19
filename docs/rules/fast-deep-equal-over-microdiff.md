# Enforce using fast-deep-equal for equality checks instead of microdiff (`@blumintinc/blumint/fast-deep-equal-over-microdiff`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using fast-deep-equal for equality checks instead of microdiff.

## Rule Details

This rule enforces that deep equality checks between objects should use `fast-deep-equal` instead of checking `microdiff(...).length === 0`. The `fast-deep-equal` library is specifically optimized for performant deep equality checks, while `microdiff` is designed for generating detailed object differences.

Using `microdiff` purely for equality checks is inefficient because:

1. `microdiff` computes detailed differences between objects, which is unnecessary overhead when only checking for equality
2. `fast-deep-equal` is significantly more performant for simple equality checks
3. Code using `fast-deep-equal` is more readable when the intent is simply to check equality

This rule will automatically fix violations by:
1. Adding an import for `fast-deep-equal` if it doesn't exist
2. Replacing `microdiff` equality checks with equivalent `fast-deep-equal` calls

### Examples of **incorrect** code for this rule:

```ts
import { diff } from 'microdiff';

// Using microdiff for equality check
function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

// Using microdiff for equality check (loose equality)
function areObjectsLooseEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}

// Using microdiff for inequality check
function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}

// Using microdiff with shorthand negation
function areObjectsEqual(obj1, obj2) {
  return !diff(obj1, obj2).length;
}

// Using microdiff in conditional statements
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

// Using fast-deep-equal directly
function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}

// Using fast-deep-equal for inequality check
function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}

// Using fast-deep-equal in conditional statements
function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}

// Using ES6 version of fast-deep-equal
import isEqual from 'fast-deep-equal/es6';
function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
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

// Using microdiff to analyze specific changes
function applyPartialUpdates(oldSettings, newSettings) {
  const changes = diff(oldSettings, newSettings);
  const needsRefresh = changes.some(change =>
    change.path.includes('critical_setting')
  );
  return needsRefresh;
}

// Using microdiff to detect specific types of changes
function detectItemChanges(oldItems, newItems) {
  const changes = diff(oldItems, newItems);
  const addedItems = changes.filter(change => change.type === 'CREATE');
  const removedItems = changes.filter(change => change.type === 'REMOVE');
  const updatedItems = changes.filter(change => change.type === 'UPDATE');
  return { addedItems, removedItems, updatedItems };
}

// Using microdiff to check if changes exist (not equality)
function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}
```

## When Not To Use It

You should not use this rule if:

1. Your project deliberately avoids adding additional dependencies and you want to use `microdiff` for both diffing and equality checks
2. You're working in a performance-non-critical codebase where the additional overhead of using `microdiff` for equality checks is acceptable
3. You need to maintain backward compatibility with existing code that relies on the specific behavior of `microdiff` for equality checks

## Further Reading

- [fast-deep-equal](https://github.com/epoberezkin/fast-deep-equal) - A fast deep equality check library
- [microdiff](https://github.com/AsyncBanana/microdiff) - A tiny, fast, zero-dependency object and array comparison library
- [Performance Comparison](https://github.com/epoberezkin/fast-deep-equal#benchmark) - Benchmark comparisons of deep equality libraries
