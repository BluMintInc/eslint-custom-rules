# Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially (`@blumintinc/blumint/parallelize-async-operations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Parallelizing independent awaits keeps total latency bounded by the slowest call instead of the sum of every call. This rule flags back-to-back awaits with no detected dependency, loop, or per-call error boundary and enforces `Promise.all` so network and I/O overlap.

## Rule Details

Serializing independent async work stretches response time and wastes compute billed per millisecond. Running the calls together lets the runtime issue network or I/O requests concurrently while you preserve clarity by destructuring the results.

The rule reports when all of these are true:
- Two or more awaits or await-based variable declarations appear consecutively.
- Later awaits do not reference identifiers created by earlier awaits (direct identifier reference-based dependency check).
- Later awaits do not share "coordinator" identifiers (like `batchManager`, `transaction`, or `collector`) with earlier awaits.
- The awaited calls do not invoke methods on the **same receiver identifier** (e.g. `ref.set(...)` then `ref.get()`), which can carry a read-after-write / write-after-write ordering dependency on that shared object.
- No later discarded-result await reads as a **state refetch/refresh** (`refresh*`, `reload*`, `refetch*`, `revalidate*`, `resync*`, `sync*`), which re-observes state a preceding await may have mutated.
- The awaits are not inside try blocks or loops, which signal intentional ordering or per-call error handling.
- The calls do not match a small list of side-effect-heavy patterns (e.g., `updatecounter`, `commit`, `flush`, `saveall`) that should stay ordered.

These conditions are evaluated independently—if any single condition indicates ordering is required (e.g., matching a **side-effect-heavy pattern** or sharing **coordinator identifiers**), the rule will not suggest parallelization.

### ❌ Incorrect

```typescript
async function cleanUpReferences(params, ref) {
  await realtimeDb.ref(buildPath(params)).remove();
  await realtimeDb.ref(ref).remove();
}
```

### ✅ Correct

```typescript
async function cleanUpReferences(params, ref) {
  await Promise.all([
    realtimeDb.ref(buildPath(params)).remove(),
    realtimeDb.ref(ref).remove(),
  ]);
}
```

### ✅ Correct (shared coordinator dependency)

These must remain sequential because they share a "coordinator" object (`batchManager`). The rule uses a **COORDINATOR_PATTERN** to detect identifiers (e.g., `batchManager`, `manager`, `transaction`) that imply shared mutable state, which requires sequential execution.

#### Coordinator Pattern Detection

The rule recognizes common coordinator identifier patterns that indicate shared mutable state. These are matched case-insensitively using the `COORDINATOR_PATTERN`:
- `batch`, `manager`, `collector`, `transaction`, `tx`, `coordinator`, `unitofwork`, `accumulator`, `aggregator`.

If sequential awaits interact with the same identifier matching this pattern (even as a nested property like `ctx.batchManager`), they are not flagged for parallelization.

Because matching is substring-based, identifiers like `CacheManager`, `taskCollector`, or `ctx.batch` will also match. This is intentional and errs on the side of safety by preserving sequential execution when shared state might be involved.

```typescript
async function processBatch(batchManager: BatchManager, item1: Item, item2: Item) {
  await batchManager.add(item1);
  await batchManager.add(item2);
  await batchManager.commit(); // depends on previous adds
}
```

### ✅ Correct (shared receiver ordering)

These must remain sequential because both awaits call methods on the **same receiver identifier** (`versionRef`). The `.get()` must observe the value written by the preceding `.set()`; rewriting to `Promise.all([...])` would race the read against the write and can return the stale value.

```typescript
async function bumpVersion(versionRef: VersionRef) {
  await versionRef.set(ServerValue.increment(1));
  const snapshot = await versionRef.get(); // read-after-write on the same ref
  return snapshot.val();
}
```

The receiver must be a bare identifier. A distinct nested member (`api.users.get()` vs `api.posts.get()`), a fresh chain per call (`db.collection(a).get()` vs `db.collection(b).get()`), or a numeric/dynamic index (`operations[0]()` vs `operations[1]()`) selects a different target each time and is still flagged. Two pure reads on one receiver are conservatively kept sequential as well, since a shared receiver can hold hidden state (for example a paginated cursor)—the worst case is a missed parallelization, which is safer than reordering a real dependency.

### ✅ Correct (refetch/refresh ordering)

A discarded-result await whose callee reads as a **state refetch/refresh** must stay sequential when it follows another await. Such a call exists to re-observe state that a preceding await may have mutated—for example a `refreshUser()` that re-reads the server state left behind by `unlinkProvider(...)`. `Promise.all([...])` invokes every operand eagerly and concurrently, so it would race the refetch ahead of the mutation; a refresh that resolves first repopulates the just-mutated state, a genuine correctness bug.

```typescript
async function unlink(providerId: string, providerUid: string) {
  await unlinkProvider({ providerId, providerUid }); // mutates server-side state
  await refreshUser(); // must observe the post-mutation state
}
```

The refetch verb is matched case-insensitively at the **start** of the callee's own method name (bare identifier or member), using the pattern `refresh|reload|refetch|revalidate|resync|sync`. A name that merely contains one of these words (`getRefreshToken()`) does not match, and only awaits in a **non-first** position qualify—a refetch with nothing before it has no preceding await to depend on and is still flagged.

### ✅ Correct (with assignments)

```typescript
async function loadProfiles(userIds) {
  const [primary, secondary] = await Promise.all([
    db.getProfile(userIds.primary),
    db.getProfile(userIds.secondary),
  ]);
  return { primary, secondary };
}
```

### ✅ Correct (with independent error handling)

When you still want concurrency but independent error paths, prefer `Promise.allSettled`:

```typescript
const results = await Promise.allSettled([operation1(), operation2()]);
for (const r of results) {
  if (r.status === 'rejected') handle(r.reason);
}
```

## How to fix a violation

- Wrap the independent await targets in a single `Promise.all([...])`.
- Destructure the array result when you need distinct variables.
- Keep operations that require per-call error handling or deliberate ordering outside the combined array.

## Options

### `sideEffectPatterns`

An array of string, glob, or regex patterns (type: `string[]`) that customizes which method or function call patterns are considered side effects. The rule will skip any calls that match these patterns to avoid parallelizing operations that might rely on a specific order.

**Default values:**
- `updatecounter`
- `setcounter`
- `incrementcounter`
- `decrementcounter`
- `updatethreshold`
- `setthreshold`
- `checkthreshold`
- `commit`
- `flush`
- `saveall`

**Example configuration:**
```json
{
  "rules": {
    "@blumintinc/blumint/parallelize-async-operations": [
      "error",
      {
        "sideEffectPatterns": ["save.*", "commit.*"]
      }
    ]
  }
}
```

## When Not To Use It

Skip or disable the rule if any of the following apply:
1. Later operations truly depend on values produced by earlier awaits.
1. Each await needs its own try/catch or error boundary.
1. The operations rely on ordered side effects that must not overlap.
1. The awaits sit inside a loop where batching or chunked parallelism would be safer.

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
