# Disallow async callbacks in Array.filter() because async predicates never filter (`@blumintinc/blumint/no-async-array-filter`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Async predicates in `Array.filter()` always return a `Promise`, and `Array.filter()` never waits for that `Promise`. Every `Promise` is truthy, so nothing gets filtered out. This silently ships unfiltered data and hides failing async checks (e.g., permission checks or existence checks) that developers assume are enforced.

## Rule Details

This rule forbids `async` predicates passed to `Array.filter()`. The intent is to block a common pitfall where an async guard looks correct but has no effect because `filter` treats the unresolved `Promise` as truthy.

### How to fix

- Resolve async checks before filtering:

  ```ts
  const results = await Promise.all(items.map(checkItem));
  const filtered = items.filter((_, i) => results[i]);
  ```

- Or move the logic to a synchronous predicate (e.g., use cached data or a precomputed lookup).

Examples of **incorrect** code for this rule:

```typescript

['a'].filter(async (x) => await isAllowed(x));

['a'].filter(async function (x) {
  return await existsInDb(x);
});
```

Examples of **correct** code for this rule:

```typescript

// Resolve async checks before filtering
const results = await Promise.all(['a'].map(isAllowed));
['a'].filter((_, i) => results[i]);

// Keep the predicate synchronous
['a'].filter((x) => cachedAllowed.has(x));
```
