# Disallow sequential await expressions inside loops when iterations could be parallelized with Promise.all(items.map(...)) (`@blumintinc/blumint/parallelize-loop-awaits`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Sequential `await` expressions inside loops cause each iteration to wait for the previous one to complete before starting, even when the operations are independent. This creates O(n) execution time instead of O(1) when the iterations could be parallelized with `Promise.all(items.map(...))`.

This rule flags `await` expressions directly inside `for...of`, `for...in`, traditional `for`, `while`, and `do...while` loops where the iterations appear to be independent. It complements the `parallelize-async-operations` rule, which handles consecutive `await` statements outside of loops.

When loops nest, the **innermost** loop owns the report: an `await` inside a nested loop is analyzed against that loop's body and reported once, not once per enclosing loop.

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

// Zero arguments, but the receiver comes from the iteration, so each pass
// addresses its own document
for (const doc of snapshot.docs) {
  await doc.ref.delete(); // flagged
}

// do...while repeats one body per iteration exactly as the other forms do
do {
  await processItem(items[cursor]); // flagged
  cursor++;
} while (cursor < items.length);

// Nested loops: the innermost loop owns the report, so this reports once — at
// the inner await — rather than once per enclosing loop
for (const group of groups) {
  for (const item of group.items) {
    await processItem(item); // flagged
  }
}

// `lock` here is a property KEY: it names a field of the payload and binds
// nothing, so it is not the shared coordinator its spelling suggests
for (const item of items) {
  await send({ lock: true, id: item.id }); // flagged
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

// The same dependency written from inside a callback the awaited call invokes:
// the write has landed by the time the await settles, so the iterations share
// `pageCursor` exactly as they would if it were assigned directly
let pageCursor = null;
for (const item of items) {
  await runner.execute(item, async (page) => {
    pageCursor = page.nextCursor;
  });
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

// Condition coupling: the loop runs until an observation comes back a certain
// way, so the iteration count is a function of what the iterations do
while (!hasSettled()) {
  await Promise.resolve();
}
for (let tick = 0; tick < 100 && !findBackoffTimer(); tick += 1) {
  await Promise.resolve();
}

// `for await...of` pulls one value at a time by definition
for await (const chunk of stream) {
  await handleChunk(chunk);
}

// Because the innermost loop owns the report, an inner loop's exemption is not
// circumvented by the loop enclosing it
for (const source of sources) {
  for await (const row of source) {
    await handleRow(row);
  }
}

// A `do...while` test is re-evaluated after every iteration, so a call there is
// condition coupling exactly as it is in a `while`
do {
  await drainNext(queue);
} while (queue.hasPending());

// Pagination written as a do...while: the cursor from one page fetches the next
do {
  const page = await listUsers(nextPageToken);
  nextPageToken = page.pageToken;
} while (nextPageToken);

// Shorthand carries the coordinator as the property's VALUE, and a computed key
// is an expression, so both really do reference `lock`
for (const item of items) {
  await send({ lock, id: item.id });
}
for (const item of items) {
  await send({ [lock]: true, id: item.id });
}

// A lone discarded await of a call that names nothing from the loop head: the
// loop passes nothing in and keeps nothing back, so it exists only for an
// ordered side effect owned by the callee
for (let occurrence = 0; occurrence < 21; occurrence += 1) {
  await postAutomationSuggestion();
}

// Sequential execution intentional — suppressed with reason.
// The report is anchored to the `await`, so the comment goes directly above it;
// placing it above the `for` suppresses nothing.
for (const user of sortedUsers) {
  // eslint-disable-next-line @blumintinc/blumint/parallelize-loop-awaits -- VIPs must be processed before regular users
  await processUserSubscription(user);
}
```

## Automatic Exclusions

The rule does **not** flag the following patterns:

| Pattern | Detection method |
|---------|-----------------|
| Coordinator objects (`batch`, `batchManager`, `transaction`, `collector`, `accumulator`, `aggregator`, `mutex`, `lock`) | Any identifier the loop body REFERENCES that starts with, ends with, or equals a coordinator pattern name (case-insensitive). A non-computed property key is a label rather than a reference and is skipped; shorthand (`{ lock }`) and computed keys (`{ [lock]: true }`) are references and count |
| Rate-limiting calls (`sleep`, `delay`, `throttle`, `rateLimit`) | Any identifier the loop body references exactly matching a rate-limited pattern (case-insensitive), under the same property-key boundary |
| Per-iteration `try/catch` wrapping the `await` | Detected via AST parent chain |
| `break`, `continue`, or `return` inside the loop body | Detected syntactically (does not cross nested function boundaries) |
| Accumulator / pagination patterns: a variable declared outside the loop is assigned inside the loop body, including from inside a callback the body hands to the awaited call | Detected via assignment target analysis, which resolves a member write to the ROOT of its chain (`box.value = 1` writes `box`) |
| Cross-iteration await dependency: result of one `await` is passed to a later `await` in the same loop body | Detected via data-flow analysis on identifier names |
| `await` inside a nested async function within the loop body | Not flagged; the `await` belongs to the inner function's async scope |
| Test files (`*.test.*`, `*.spec.*`, and anything under `__tests__/` or `__mocks__/`) | Filename check, controlled by the [`ignoreTestFiles`](#options) option |
| Condition coupling: a `while` or `do...while` test, or a `for` test or update clause, that invokes a function | Detected syntactically on the loop's own clauses (not its body) |
| `for await (const x of stream)` | Detected via `ForOfStatement.await` |
| A loop body that is a lone discarded `await` of a zero-argument call naming nothing from the loop head | Detected syntactically on the body's single statement |
| An `await` that a nested loop already owns | The enclosing loop's search for its own `await` stops at a nested loop, so each `await` is judged once, by the innermost loop containing it |

### Why the loop's own clauses matter

Every barrier in the upper half of the table reads syntax inside the loop body, which inverts the rule's confidence: the smaller the body, the less evidence there is, and the more certainly the rule would report. The lower half reads the loop's structure instead.

A loop whose continuation condition calls a function runs until an observation comes back a certain way — `while (!hasSettled())` re-reads state that the awaited work advances. `Promise.all(items.map(...))` has to know the iteration count up front, so no parallel form of such a loop exists. Only clauses re-evaluated on every iteration count: a `for` loop's `init` and a `for...of` loop's right-hand side run once, so `for (const [key, value] of map.entries())` keeps its enforcement.

A body that is a bare `await f();` — zero arguments, discarded result — passes nothing from the iteration into the call and keeps nothing the call returns. Its ordering constraint lives inside the callee, where no syntactic analysis of the loop can see it, so the rule declines to adjudicate rather than report on no evidence. A call that names something from the loop head is excluded from this exemption, because that name is the evidence: `for (const doc of snapshot.docs) { await doc.ref.delete(); }` takes no arguments either, yet each iteration addresses its own document, and the rule keeps flagging it.

### Which loop owns an `await`

Each loop is analyzed against its own body, so the loop that reports an `await` must be the one whose iterations would run together. For nested loops that is the innermost one: the enclosing loop's iterations parallelize the inner LOOP, not the inner await, and the enclosing body's barriers say nothing about whether the inner iterations are independent. An enclosing loop therefore stops looking for its own `await` at a nested loop — one `await`, one verdict, from the loop that owns it. The enclosing loop still reports an `await` written directly in its own body, before or after the nested loop.

This also keeps an inner loop's exemption from being circumvented: a `for await...of` nested inside an ordinary `for...of` is exempt, and no enclosing loop reaches past it to report the same `await`.

### What counts as a reference

The coordinator and rate-limit barriers ask what names the loop body REFERENCES, so a name that binds nothing must not answer. In `await send({ lock: true, id: item.id })` the word `lock` is a field label in a payload, not the mutex the pattern list is looking for, and letting it match would exempt the loop on the strength of a string. Non-computed property keys are therefore skipped. Shorthand keeps its say because `{ lock }` carries the identifier as the property's VALUE — a real read of the surrounding scope — and so does a computed key, because `{ [lock]: true }` is an expression. Member access is untouched: `await this.batch.commit()` still names `batch`.

### Where a write counts

The barriers do not all draw the nested-function boundary in the same place, because they ask different questions. An `await` inside a callback belongs to that callback's async scope, and a `break` there governs that callback's control flow, so those searches stop at the boundary. A WRITE does not: the callback a loop body hands to the awaited call runs before that `await` settles, so `await run(item, async (page) => { cursor = page.nextCursor; })` publishes `cursor` within the iteration, exactly as `cursor = await run(item, cursor)` does. The write scan therefore crosses into callbacks.

Whether the write couples two iterations depends on where its target is DECLARED, which is a question about scope rather than about spelling. A write is a cross-iteration dependency when the binding it reaches is declared outside the loop body; a binding declared inside the body — including one a callback declares, or one bound by a callback's parameter — is created afresh and publishes nothing that outlives the iteration. Resolving each write through the scope chain keeps the two apart even when they share an identifier, so a genuine write to an outer `cursor` still counts while an unrelated callback names a parameter `cursor`. A target the analysis cannot resolve to a binding at all — `this.count += 1`, or an implicit global — counts as external, which leaves the barrier standing where the analysis cannot see.

Bindings introduced by the loop's own HEAD read as external, which is the conservative reading and the correct one for a C-style counter: `for (let i = 0; i < n; i += 1)` carries `i` forward between iterations, so a body write to it really does couple them.

An increment counts as a write only inside a callback. At the loop-body level it is the loop's own step counter: `while (i < n) { await f(items[i]); i++; }` walks the iteration space, and the `Promise.all(items.map(...))` rewrite subsumes it. A callback steps no iteration, so `count++` there folds what the awaited work produced into a binding the whole loop shares.

Test files get the same treatment for the reason accepted in [#1395](https://github.com/BluMintInc/eslint-custom-rules/issues/1395) for `parallelize-async-operations`: a suite serves no requests and is not latency-critical, so the latency rationale does not apply, while its loops routinely replay one entrypoint so each call observes the state the previous call stored — usually in a mock closure the loop body never names. Set `ignoreTestFiles: false` to enforce the rule inside test files anyway.

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

  // Skip files whose name ends in `.test.*`/`.spec.*` or that live under a
  // `__tests__/` or `__mocks__/` directory. Set to false to enforce the rule
  // inside test files as well.
  ignoreTestFiles: boolean; // default: true
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
      ignoreTestFiles: true,
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
      ignoreTestFiles: false, // custom: enforce inside test files too
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
