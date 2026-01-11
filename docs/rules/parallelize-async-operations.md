# Suggest using Promise.all() for independent sequential awaits when it might reduce latency (`@blumintinc/blumint/parallelize-async-operations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Parallelizing independent awaits keeps total latency bounded by the slowest call instead of the sum of every call. This rule flags back-to-back awaits with no detected dependency, loop, or per-call error boundary and suggests `Promise.all` so network and I/O overlap.

**Note: This rule is intended to be a suggestion and is only correct some of the time. It is likely that operations cannot be parallelized if they have hidden side effects or specific ordering requirements.**

## Rule Details

Serializing independent async work stretches response time and wastes compute billed per millisecond. Running the calls together lets the runtime issue network or I/O requests concurrently while you preserve clarity by destructuring the results.

However, because static analysis cannot always detect subtle dependencies or side effects, this rule may report false positives. When operations must stay ordered, please use an `// eslint-disable-next-line` comment.

The rule reports when all of these are true:
- Two or more awaits or await-based variable declarations appear consecutively.
- Later awaits do not reference identifiers created by earlier awaits (simple dependency check).
- The awaits are not inside try blocks or loops, which signal intentional ordering or per-call error handling.
- The calls do not match a small list of side-effect-heavy patterns (e.g., update/check counters) that should stay ordered.

### ❌ Incorrect (Sequential Awaits)

```typescript
async function cleanUpReferences(params, ref) {
  await realtimeDb.ref(buildPath(params)).remove();
  await realtimeDb.ref(ref).remove();
}
```

### ✅ Correct (Parallelized)

```typescript
async function cleanUpReferences(params, ref) {
  await Promise.all([
    realtimeDb.ref(buildPath(params)).remove(),
    realtimeDb.ref(ref).remove(),
  ]);
}
```

### ✅ Correct (With disable comment if parallelization is unsafe)

```typescript
async function cleanUpReferences(params, ref) {
  // eslint-disable-next-line @blumintinc/blumint/parallelize-async-operations
  await realtimeDb.ref(buildPath(params)).remove();
  await realtimeDb.ref(ref).remove();
}
```

### ✅ Correct (With assignments)

```typescript
async function loadProfiles(userIds) {
  const [primary, secondary] = await Promise.all([
    db.getProfile(userIds.primary),
    db.getProfile(userIds.secondary),
  ]);
  return { primary, secondary };
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

- Wrap the independent await targets in a single `Promise.all([...])`.
- Destructure the array result when you need distinct variables.
- Keep operations that require per-call error handling or deliberate ordering outside the combined array.

## Options

This rule accepts an options object:

- `sideEffectPatterns`: (Default: `[]`) An array of strings or regular expressions matching method names that should be treated as having side effects, preventing parallelization.

```json
{
  "@blumintinc/blumint/parallelize-async-operations": [
    "error",
    {
      "sideEffectPatterns": ["updateCounter", "increment.*"]
    }
  ]
}
```

## When Not To Use It

Skip or disable the rule if any of the following apply:
1. Later operations truly depend on values produced by earlier awaits.
2. Each await needs its own try/catch or error boundary.
3. The operations rely on ordered side effects that must not overlap.
4. The awaits sit inside a loop where batching or chunked parallelism would be safer.

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
