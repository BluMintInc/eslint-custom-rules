# Disallow sequential await expressions inside loops when iterations could be parallelized with Promise.all(items.map(...)) (`@blumintinc/blumint/parallelize-loop-awaits`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Sequential `await` expressions inside loops cause each iteration to wait for the previous one to complete before starting, even when the operations are independent. This creates O(n) execution time instead of O(1) when the iterations could be parallelized with `Promise.all(items.map(...))`.

This rule flags `await` expressions directly inside `for...of`, `for...in`, traditional `for`, and `while` loops where the iterations appear to be independent. It complements the `parallelize-async-operations` rule, which handles consecutive `await` statements outside of loops.

This rule is conservative by design: it uses several heuristics to avoid false positives on intentionally sequential loops (see [Automatic Exclusions](#automatic-exclusions) below). When sequential execution is truly necessary but not automatically detected, use an `eslint-disable-next-line` comment with a reason.

### Examples of **incorrect** code

```typescript
// Independent notifications — can run in parallel
for (const userId of userIds) {
  await sendNotification(userId); // flagged
}

// Independent document updates
for (const [userId, eventCount] of userEventCounts.entries()) {
  await groupMetricsRef.update({
    eventsHosted: FieldValue.increment(eventCount),
  }); // flagged
}

// for...in loop
for (const key in obj) {
  await processKey(key); // flagged
}

// Traditional for loop
for (let i = 0; i < items.length; i++) {
  await processItem(items[i]); // flagged
}
```

### Examples of **correct** code

```typescript
// Use Promise.all to parallelize
await Promise.all(userIds.map((userId) => sendNotification(userId)));

// Coordinator pattern (batch): sequential execution is intentional
const batch = new BatchManager();
for (const doc of snapshot.docs) {
  await batch.set({ ref: doc.ref, data: { id: doc.id } });
}
await batch.commit();

// Accumulator: result from one iteration feeds the next
let previousResult = null;
for (const item of items) {
  const result = await processItem(item, previousResult);
  previousResult = result;
}

// Pagination: cursor from one page is needed to fetch the next
let cursor = null;
while (true) {
  const { data, nextCursor } = await fetchPage(cursor);
  if (!nextCursor) break;
  cursor = nextCursor;
}

// Per-iteration error handling with try/catch
for (const item of items) {
  try {
    await processItem(item);
  } catch (error) {
    console.error(`Failed for ${item.id}:`, error);
  }
}

// Rate limiting: sleep/delay between iterations
for (const asset of assets) {
  await processAsset(asset);
  await sleep(1000);
}

// Control flow depends on async result (break)
for (const item of items) {
  const result = await process(item);
  if (result.shouldStop) {
    break;
  }
}

// Sequential execution intentional — suppressed with reason
// eslint-disable-next-line @blumintinc/blumint/parallelize-loop-awaits -- VIPs must be processed before regular users
for (const user of sortedUsers) {
  await processUserSubscription(user);
}
```

## Automatic Exclusions

The rule does **not** flag the following patterns:

| Pattern | Detection method |
|---------|-----------------|
| Coordinator objects (`batch`, `batchManager`, `transaction`, `collector`, `accumulator`, `aggregator`, `mutex`, `lock`) | Any identifier in the loop body that starts with, ends with, or equals a coordinator pattern name (case-insensitive) |
| Rate-limiting calls (`sleep`, `delay`, `throttle`, `rateLimit`) | Any identifier in the loop body exactly matching a rate-limited pattern (case-insensitive) |
| Per-iteration `try/catch` wrapping the `await` | Detected via AST parent chain |
| `break`, `continue`, or `return` inside the loop body | Detected syntactically (does not cross nested function boundaries) |
| Accumulator / pagination patterns: a variable declared outside the loop is assigned inside the loop body | Detected via assignment target analysis |
| Cross-iteration await dependency: result of one `await` is passed to a later `await` in the same loop body | Detected via data-flow analysis on identifier names |
| `await` inside a nested async function within the loop body | Not flagged; the `await` belongs to the inner function's async scope |

## Options

```typescript
{
  // Coordinator patterns that indicate shared mutable state.
  // When any identifier in the loop body matches one of these patterns
  // (case-insensitive, camelCase-aware: equals, starts-with, or ends-with),
  // sequential execution is assumed intentional.
  coordinatorPatterns: string[]; // default: see below

  // Function name patterns that indicate rate limiting.
  // When any identifier exactly matches one of these (case-insensitive),
  // sequential execution is assumed intentional.
  rateLimitedPatterns: string[]; // default: see below
}
```

### Defaults

```javascript
{
  '@blumintinc/blumint/parallelize-loop-awaits': [
    'error',
    {
      coordinatorPatterns: [
        'batchManager',
        'batch',
        'transaction',
        'collector',
        'accumulator',
        'aggregator',
        'mutex',
        'lock',
      ],
      rateLimitedPatterns: [
        'sleep',
        'delay',
        'throttle',
        'rateLimit',
      ],
    },
  ],
}
```

### Custom Configuration Example

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/parallelize-loop-awaits': [
    'error',
    {
      coordinatorPatterns: [
        'batchManager',
        'batch',
        'transaction',
        'collector',
        'accumulator',
        'aggregator',
        'mutex',
        'lock',
        'writer',     // custom: treat any variable ending in "writer" as a coordinator
        'queue',      // custom: treat "queue" as a coordinator
      ],
      rateLimitedPatterns: [
        'sleep',
        'delay',
        'throttle',
        'rateLimit',
        'wait',       // custom: treat "wait" as a rate-limiting call
      ],
    },
  ],
}
```

## Why No Auto-fix

This rule does not provide automatic fixes because:

1. **Order may be intentional** — sequential execution might be required for business logic not detectable via static analysis.
2. **Error handling semantics differ** — `Promise.all` fails fast on first rejection, while sequential loops can handle errors per-iteration (use `Promise.allSettled` for equivalent behavior).
3. **Rate limiting concerns** — parallelizing may overwhelm external APIs or databases.
4. **Transaction requirements** — some operations must remain sequential for consistency.

## When to Disable

Use an `eslint-disable-next-line` comment with a reason when sequential execution is intentional but not automatically detected:

```typescript
// eslint-disable-next-line @blumintinc/blumint/parallelize-loop-awaits -- Parent records must exist before child records
for (const entity of hierarchicalEntities) {
  await createEntityWithDependencies(entity);
}
```

## Related Rules

- [`parallelize-async-operations`](./parallelize-async-operations.md) — flags consecutive independent `await` statements outside of loops
