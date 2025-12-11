# Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially (`@blumintinc/blumint/parallelize-async-operations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of `Promise.all()` when multiple independent asynchronous operations are awaited sequentially.

## Rule Details

This rule identifies sequences of `await` expressions that could be executed concurrently using `Promise.all()` to improve performance. By parallelizing independent async operations, we can reduce execution time, which is particularly important in cloud functions where execution time directly impacts cost and user experience.

### ❌ Incorrect

```typescript
async function cleanUpReferences(params, ref) {
  // Sequential async operations that could run in parallel
  await realtimeDb.ref(buildPath(params)).remove();
  await realtimeDb.ref(ref).remove();

  return true;
}
```

### ✅ Correct

```typescript
async function cleanUpReferences(params, ref) {
  // Parallel async operations using Promise.all
  await Promise.all([
    realtimeDb.ref(buildPath(params)).remove(),
    realtimeDb.ref(ref).remove()
  ]);

  return true;
}
```

## When Not To Use It

This rule should not be used in the following scenarios:

1. **Operations with Dependencies**: When later operations depend on the results of earlier ones.

   ```typescript
   // These operations CANNOT be parallelized
   const user = await db.collection('users').doc(userId).get();
   const profile = await db.collection('profiles').doc(user.data().profileId).get();
   ```

2. **Individual Error Handling**: When operations need specific error handling.

   ```typescript
   // Individual error handling
   try {
     await operation1();
   } catch (error) {
     // Handle error for operation1 specifically
   }

   try {
     await operation2();
   } catch (error) {
     // Handle error for operation2 specifically
   }
   ```

   When you still want concurrency but independent error paths, prefer:

   ```typescript
   const results = await Promise.allSettled([operation1(), operation2()]);
   for (const r of results) {
     if (r.status === 'rejected') handle(r.reason);
   }
   ```

3. **Operations with Side Effects**: When operations have side effects that affect other operations.

   ```typescript
   // The second operation might depend on side effects from the first
   await updateCounter();
   await checkThreshold(); // Might check the value updated by updateCounter
   ```

4. **Operations in Loops**: Sequential awaits inside loops present a special case.

   ```typescript
   for (const item of items) {
     await processItem(item);
   }
   ```

   ### ✅ Recommended in loops

   ```typescript
   // Run all in parallel (be mindful of rate limits)
   await Promise.all(items.map((item) => processItem(item)));

   // Or, use bounded concurrency if needed
   import pLimit from 'p-limit';
   const limit = pLimit(5);
   await Promise.all(items.map((item) => limit(() => processItem(item))));
   ```

## Implementation

- [Rule source](../../src/rules/parallelize-async-operations.ts)
- [Test source](../../src/tests/parallelize-async-operations.test.ts)
