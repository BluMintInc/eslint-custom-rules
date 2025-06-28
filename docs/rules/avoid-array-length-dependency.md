# Avoid using array.length in dependency arrays of React hooks. Use stableHash(array) with useMemo instead (`@blumintinc/blumint/avoid-array-length-dependency`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents using `array.length` in dependency arrays of React hooks. Using only the length of an array in a dependency array is an anti-pattern that fails to detect changes when an array's contents are modified but its length remains the same. Instead, the rule recommends using `stableHash(array)` within a `useMemo` hook, which creates a hash based on the array's contents, ensuring the effect re-runs whenever the array's contents change - not just when its length changes.

## Examples

### ❌ Incorrect

```typescript
import { useEffect } from 'react';

function Component({ items }) {
  useEffect(() => {
    // Some logic that depends on items
    console.log('Items changed!', items);

    // This effect won't re-run if items changes but items.length remains the same
  }, [items.length]); // ❌ Only tracks length changes, not content changes

  return <div>{/* Component JSX */}</div>;
}
```

```typescript
// Multiple array.length expressions
useEffect(() => {
  // Effect implementation
}, [items.length, users.length, messages.length]);
```

```typescript
// With optional chaining
useEffect(() => {
  // Effect implementation
}, [items?.length]);
```

### ✅ Correct

```typescript
import { useEffect, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

function Component({ items }) {
  // Always memoize the hash to prevent unnecessary computations
  const itemsHash = useMemo(() => stableHash(items), [items]);

  useEffect(() => {
    // Some logic that depends on items
    console.log('Items changed!', items);

    // This effect will re-run whenever any item in the array changes
  }, [itemsHash]); // ✅ Properly tracks content changes with optimal performance

  return <div>{/* Component JSX */}</div>;
}
```

```typescript
// Multiple arrays properly handled
const itemsHash = useMemo(() => stableHash(items), [items]);
const usersHash = useMemo(() => stableHash(users), [users]);
const messagesHash = useMemo(() => stableHash(messages), [messages]);

useEffect(() => {
  // Effect implementation
}, [itemsHash, usersHash, messagesHash]);
```

```typescript
// Nullable arrays handled correctly
const itemsHash = useMemo(() => stableHash(items), [items]);

useEffect(() => {
  // Effect implementation
}, [itemsHash]);
```

## Why?

Using `array.length` instead of the full array is a common but flawed attempt to optimize re-renders. This approach has several problems:

1. **Missed Updates**: If array contents change but the length stays the same (e.g., replacing an item), the effect won't re-run
2. **Incorrect Dependencies**: React's exhaustive-deps rule expects all dependencies that are read inside the effect
3. **Subtle Bugs**: Changes to array contents may not trigger necessary side effects

The `stableHash` function provides a more robust solution that:
- Properly detects changes to array contents
- Works with any value type (arrays, objects, primitives)
- Provides consistent hashing for the same data structure
- When used with `useMemo`, prevents unnecessary hash recalculations

## Auto-fix

This rule automatically fixes violations by:

1. Adding the necessary imports (`stableHash` and `useMemo` if not already imported)
2. Creating memoized hash variables above the hook call
3. Replacing `array.length` expressions with the corresponding hash variables

## When Not To Use

You might want to disable this rule if you have legitimate cases where only the array length matters, not the content. In such cases, you can disable the rule for specific lines:

```typescript
// eslint-disable-next-line @blumintinc/blumint/avoid-array-length-dependency
useEffect(() => {
  // Implementation that only cares about array length
}, [items.length]);
```

## Related Rules

- [react-hooks/exhaustive-deps](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks) - Ensures all dependencies are included in hook dependency arrays
- [@blumintinc/blumint/no-entire-object-hook-deps](./no-entire-object-hook-deps.md) - Prevents using entire objects in dependency arrays
