# Enforce the use of Promise.all() when multiple independent asynchronous operations are awaited sequentially (`@blumintinc/blumint/parallelize-async-operations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Parallelizing independent awaits keeps total latency bounded by the slowest call instead of the sum of every call. This rule flags back-to-back awaits with no detected dependency, loop, or per-call error boundary and enforces `Promise.all` so network and I/O overlap.

## Rule Details

Serializing independent async work stretches response time and wastes compute billed per millisecond. Running the calls together lets the runtime issue network or I/O requests concurrently while you preserve clarity by destructuring the results.

The rule reports when all of these are true:
- The file is not a **test file** (`.test.*`, `.spec.*`, or under `__tests__/` / `__mocks__/`), whose awaits encode ordering rather than latency.
- Two or more awaits or await-based variable declarations appear consecutively.
- Later awaits do not reference identifiers **declared** by earlier awaits (direct identifier reference-based dependency check).
- Later awaits do not read an identifier — or an **instance slot** (`this.mutator`) — that an earlier await **writes from inside a callback** (`mutator = new Mutator(tx)` in a transaction body), a data dependency that flows through the closure rather than through the await's value. Where this file declares the awaited callee, the writes in **its own body** count the same way: `await hydrate()` publishes whatever `hydrate` assigns, even though nothing flows out of the await — and so do the slots that body **reads**, so `await this.writeAll()` is ordered against a write to the slot `writeAll` reads. A deferred mutation reaching a slot through its own API (`this.accumulated.set(...)` inside the callback) is a write to that slot as much as an assignment is.
- No later awaited operand **dereferences a slot** an earlier discarded-result await could have installed. Depth is what makes this a hazard: evaluating `store.data.id` requires `store.data` to already hold an object and throws when it does not, while `store.data` alone merely yields `undefined`.
- Later awaits do not share "coordinator" identifiers (like `batchManager`, `transaction`, or `collector`) with earlier awaits.
- The awaited calls do not invoke methods on the **same receiver** (e.g. `ref.set(...)` then `ref.get()`, or `this.load()` then `this.read()`), which can carry a read-after-write / write-after-write ordering dependency on that shared object.
- No later discarded-result await reads as a **state refetch/refresh** (`refresh*`, `reload*`, `refetch*`, `revalidate*`, `resync*`, `sync*`), which re-observes state a preceding await may have mutated.
- None of the awaits performs a **route transition** (`push*`, `replace*`, `navigate*`, `redirect*`, `reroute*`, `goto*`, or any method on a `router`/`history`/`navigation`/`nav` receiver), which sequences the surrounding awaits by UI lifetime.
- No later await names a promise that an earlier **awaited aggregate** (`Promise.all`, `allSettled`, `any`, `race`) is still producing — neither the aggregated array's own `const` binding nor any element written as a bare identifier.
- None of the awaited expressions contains an **`await` of its own** outside a nested function, because the rewrite would splice that expression into a `Promise.all([...])` array literal and suspend it mid-literal.
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

### ✅ Correct (closure write dependency)

An awaited call whose callback **assigns an outer binding** hands its result back through that binding instead of through the await's value, so a later await that reads the binding depends on the earlier one. Wrapping the pair in `Promise.all([...])` is silently wrong rather than merely eager: array elements evaluate left to right at construction time, so the second element runs while the binding still holds `undefined`. The optional chain then short-circuits and the operation never happens, with nothing thrown to reveal it; without the `?.` the same rewrite throws a `TypeError` instead.

```typescript
async function exitTeam(db: Firestore, teamId: string) {
  let teamMutator: TeamMutator | undefined;
  await db.runTransaction(async (transaction) => {
    // The transaction publishes its result through the closure, not the await.
    teamMutator = new TeamMutator(transaction, teamId);
  });
  await teamMutator?.deleteIfEmptied();
}
```

The write scan deliberately crosses function boundaries, because the interesting write lives inside the callback. It covers assignments (`x = v`, `x += v`), update expressions (`x++`), every leaf of a destructuring assignment target (`({ x } = v)`, `[x] = v`), and a `for...of` head that is not a declaration. A member write records its **root object** — `state.nested.value = v` counts as a write to `state` — since that is the binding through which a later await observes the change.

A declaration inside the callback is not a write: `const x = ...` binds a fresh local that no later await can read, even when an outer binding shares the name. Callbacks that write only names they declare themselves, or write a binding no later await reads, stay parallelizable.

#### Writes to instance state

A callback that writes **instance state** carries the same dependency, and it is the more common spelling of it in class-based code:

```typescript
class TeamExit {
  private mutator?: TeamMutator;

  async run(db: Firestore, teamId: string) {
    await db.runTransaction(async (transaction) => {
      this.mutator = new TeamMutator(transaction, teamId);
    });
    await this.mutator?.deleteIfEmptied();
  }
}
```

`this.mutator` has no root binding for a name comparison to catch, so such a write is tracked by its **full path** instead. `this` and `super` name the same instance and therefore mint the same path, so the spelling of the write does not decide the barrier.

The path is matched slot by slot, which is what keeps genuinely independent instance work parallelizable: a callback that writes `this.alpha` does **not** block a later await reading `this.beta`, and it does not block a later await reading a same-spelled *local* `alpha` either. A write and a read that overlap on the path do block each other in both directions — writing `this.state` blocks a later `this.state.mutator` (the container was replaced), and writing `this.state.mutator` blocks a later `this.state.persist()` (the method can read the slot). Two sibling slots under a shared container (`this.state.alpha` and `this.state.beta`) consequently fuse: reaching either one evaluates `this.state`, and the rule answers that ambiguity with a barrier, since a missed parallelization is a safe no-op while a silent reorder is not. A dynamic segment (`this.mutators[i] = m`) is tracked by its longest fixed prefix, `this.mutators`, for the same reason.

Writes rooted at a plain binding keep their **root object** treatment described above: `ctx.mutator = m` is a write to `ctx`, so any later await mentioning `ctx` is blocked regardless of which slot it reads.

Both halves of that comparison read through one more frame than the operand spells, because a sweep-then-write pair usually spells neither half directly:

```typescript
class Backfiller {
  private readonly accumulated = new Map<string, number>();

  async run() {
    await forEachPage(async (docs) => {
      for (const doc of docs) {
        this.accumulated.set(doc, 1);
      }
    });
    await this.writeAll();
  }

  private async writeAll() {
    return this.accumulated.size;
  }
}
```

On the **write** side, a mutation reaching the slot through its own API (`this.accumulated.set(...)`) is a call rather than an assignment, so it counts as a write to the receiver slot. Any method on the slot counts, not a list of known mutator names — a domain `append` or `record` mutates its receiver exactly as `set` does. On the **read** side, `await this.writeAll()` spells only the slot `this.writeAll`; where this file declares that method, the slots its **body** reads are counted too, mirroring the callee-body resolution the write side already performs. Either half alone leaves the pair looking independent, and the rewrite then starts the write phase against a still-empty accumulator — silently, since the sweep resolves normally and reports success.

Only mutations in **deferred** position count this way — those inside a callback, or inside a resolved callee body. A call spelled in the operand's own text is already ordered by the shared-receiver and deferred-dereference barriers below, whose carve-outs for a call-produced receiver (`this.db.ref(pathA).remove()`) or a varying subscript (`this.handlers[0].read()`) are what keep two argument-disambiguated operations on one handle parallelizable. Such a call is also not the hazard: array elements evaluate left to right, so a synchronous mutation there completes before the next element is even constructed. Behind a callback the mutation is scheduled rather than performed, which is precisely what the later operand would race.

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

These must remain sequential because both awaits call methods on the **same receiver** (`versionRef`). The `.get()` must observe the value written by the preceding `.set()`; rewriting to `Promise.all([...])` would race the read against the write and can return the stale value.

```typescript
async function bumpVersion(versionRef: VersionRef) {
  await versionRef.set(ServerValue.increment(1));
  const snapshot = await versionRef.get(); // read-after-write on the same ref
  return snapshot.val();
}
```

A receiver counts when it denotes one statically known object: a bare binding (`versionRef`), the enclosing instance (`this` or `super`), or a fixed chain over any of those (`this.inner`, `app.services.store`). Optional chaining and non-null assertions spell the same path, so `this.inner?.write()` and `this.inner.read()` share a receiver too.

`this` and `super` are **one receiver**. They name the same object—`super.m()` and `this.m()` invoke against the same instance and differ only in where method lookup starts—so a run that mixes the spellings carries exactly the hazard a single-spelling run does, and stays sequential:

```typescript
class Child extends Base {
  private summaries: string[] = [];

  public async run() {
    await super.initializeTeamData(); // populates this.summaries
    const stamp = await this.resolveHostStamp(); // reads this.summaries
    return stamp;
  }
}
```

The merge applies at the chain root, so it composes with nested paths (`super.inner.write()` and `this.inner.read()` share a receiver) while leaving distinct slots on that instance distinct (`super.users.read()` and `this.posts.read()` are still parallelized).

`this` is the strongest case, because a method call on `this` is the canonical way to mutate instance state and the rule models instance state nowhere—the dependency below flows through `this.summaries` and has no syntactic representation at the call site.

```typescript
class MatchWinnerAnnouncer {
  private summaries: string[] = [];

  public async forHosts() {
    await this.initializeTeamData(); // populates this.summaries
    const stamp = await this.resolveHostStamp(); // reads this.summaries
    return stamp;
  }

  private async initializeTeamData() {
    this.summaries = await this.fetchSummaries();
  }

  private async resolveHostStamp() {
    return this.summaries[0];
  }

  private async fetchSummaries() {
    return ['a'];
  }
}
```

**Privacy spelling does not change any of this.** A member declared with the TypeScript `private` modifier and one declared as an ECMA private field (`#name`) express the same privacy, and they are mutually exclusive—`private #foo` is a TypeScript error (TS18010), so an author who writes the `#` spelling cannot opt back into a barrier by adding `private`. Every barrier therefore reads the two spellings identically: `this.#versionRef.set(...)` then `this.#versionRef.get()` shares a receiver exactly as `this.versionRef` would, `await this.#assertOwner()` gates what follows it exactly as `assertOwner()` would, and a coordinator held in `this.#batchManager` sequences the awaits that thread it.

```typescript
class VersionStore {
  #versionRef: VersionRef;

  public async bump(next: number) {
    await this.#versionRef.set({ value: next });
    const snapshot = await this.#versionRef.get(); // read-after-write on the same ref
    return snapshot.val();
  }
}
```

The `#` is part of the member's identity, so `#svc` and `svc`—two members a class can declare at once—remain distinct receivers and are still parallelized, and a write to `this.#alpha` still leaves a later read of `this.#beta` parallelizable.

Receivers that differ, or whose identity varies per evaluation, are still flagged: a distinct member (`api.users.get()` vs `api.posts.get()`, `super.users.read()` vs `this.posts.read()`), a bare binding paired with the instance (`svc.read()` vs `super.read()`), a fresh chain per call (`db.collection(a).get()` vs `db.collection(b).get()`), or a numeric/dynamic index (`operations[0]()` vs `operations[1]()`) selects a different target each time. Two pure reads on one receiver are conservatively kept sequential as well, since a shared receiver can hold hidden state (for example a paginated cursor)—the worst case is a missed parallelization, which is safer than reordering a real dependency.

### ✅ Correct (a slot the earlier operation installs)

A statement after an `await` occupies a **deferred** position: it is evaluated only once the preceding promise settles. `Promise.all([...])` destroys that, because an array literal evaluates every element eagerly, left to right, at construction. So a slot the later operand has to dereference is read before the earlier operation has run, and code that returned a value throws a `TypeError` instead.

```typescript
const store: { state?: { id: number } } = {};

async function hydrate() {
  await sleep(1);
  store.state = { id: 7 };
}

async function run() {
  await hydrate(); // installs store.state
  await report(store.state.id); // reading it eagerly would throw
}
```

The write is invisible to every barrier keyed on the run's own text: it happens inside `hydrate`'s body, so no value leaves the await, no variable is declared, and no assignment appears next to either call. Where this file declares the callee, its body is read directly. Where it does not — an import, a parameter — what the run still shows is **reach**, and only two shapes of it count, so that sibling slots under a shared namespace (`api.users.getAll()` then `api.posts.getRecent()`) stay parallelizable:

- The earlier call is invoked on a receiver that **contains** the slot (`this.connect()` then `this.client.send(...)`, or `store.load()` then `send(store.data.id)`). A method can fill any slot beneath its own receiver. This widens the shared-receiver rule above from equality to containment.
- The earlier call goes through a **bare identifier** (`hydrate()`, `initAnalytics()`) and the slot hangs off module-scope state. Such a call names no receiver, so the run says nothing about what it touches, while module-scope state is reachable from inside it without ever being passed in. Function-local roots and instance paths are excluded: a free function handed neither cannot rebind them.

Only a **discarded-result** await counts as the writer — a captured result is a value dependency the identifier comparison already catches. Because the two awaits are genuinely ordered, the rule declines to **report** here rather than merely declining the fix.

### ✅ Correct (refetch/refresh ordering)

A discarded-result await whose callee reads as a **state refetch/refresh** must stay sequential when it follows another await. Such a call exists to re-observe state that a preceding await may have mutated—for example a `refreshUser()` that re-reads the server state left behind by `unlinkProvider(...)`. `Promise.all([...])` invokes every operand eagerly and concurrently, so it would race the refetch ahead of the mutation; a refresh that resolves first repopulates the just-mutated state, a genuine correctness bug.

```typescript
async function unlink(providerId: string, providerUid: string) {
  await unlinkProvider({ providerId, providerUid }); // mutates server-side state
  await refreshUser(); // must observe the post-mutation state
}
```

The refetch verb is matched case-insensitively at the **start** of the callee's own method name (bare identifier or member), using the pattern `refresh|reload|refetch|revalidate|resync|sync`. A name that merely contains one of these words (`getRefreshToken()`) does not match, and only awaits in a **non-first** position qualify—a refetch with nothing before it has no preceding await to depend on and is still flagged.

### ✅ Correct (navigation ordering)

An awaited **route transition** sequences the awaits around it by UI lifetime rather than by data, so a navigation anywhere in the run keeps the whole run sequential. Navigating first means the following operation's dialogs mount on the destination page; `Promise.all([...])` starts that flow concurrently with the route change, so its dialogs open on the source page and are destroyed the moment the transition lands.

```typescript
const execute = async () => {
  // Navigate FIRST: the accept flow's guard dialogs must render on the destination page.
  await push(buildTournamentUrl({ tournamentId }));
  await acceptPending({ teamId, subjectUserId: toId });
};
```

The reverse order is load-bearing for the same reason—parallelizing `await saveDraft(draft)` with a following `await push(url)` can navigate away before the save settles—so position does not matter, and a captured result (`const navigated = await push(url)`) qualifies as well.

Navigation is detected two ways, both case-insensitive:

- The callee's own method name **starts with** a navigation verb: `push`, `replace`, `navigate`, `redirect`, `reroute`, `goto`. Suffixed forms like `navigateTo()` or `redirectToLogin()` match; a name that merely contains one (`getPushToken()`, `fetchRedirectRules()`) does not.
- The callee's receiver is exactly `router`, `history`, `navigation`, or `nav`, which makes every method on it navigation (`router.back()`, `history.go(-1)`). Keying on the receiver avoids matching the remaining history verbs bare, since `back`, `forward`, and `go` are too generic. The match is exact, so `navigator.getBattery()` and `historyLog.append(entry)` are still flagged.

### ✅ Correct (aggregated-element dependency)

Awaiting `Promise.all(ops)` does not consume the promises inside `ops` — they stay reachable by name. A later await that reads one of them is therefore waiting on a value the aggregate is still producing, even though the two awaits share no identifier at all (`Promise`/`all`/`ops` on one side, `release`/`dropped` on the other). `Promise.all([...])` around the pair would start the consumer concurrently with the very operation whose result it reads.

```typescript
async function assignToTeam(dropped: Promise<DropResult>) {
  const ops = [dropped, assignSlot()];
  await Promise.all(ops);
  // `dropped` is ops[0]: the release cannot start any earlier.
  await releaseSlots({ results: [await dropped] });
}
```

The aggregate is expanded to the array's own binding plus every element written as a bare identifier (or a spread of one), so `await report(ops[0])` and `await drainQueue(extras)` after `await Promise.all([...extras])` are recognized too. Elements that are freshly-constructed promises (`assignSlot()`) bind no name and are omitted, so an aggregate of anonymous calls followed by unrelated work is still flagged. Only a `const` array is followed: a `let`/`var` binding can be reassigned between the declaration and the aggregate, so its literal elements would not describe what the aggregate actually received.

### ✅ Correct (nested await)

The fix splices each awaited expression into a `Promise.all([...])` **array literal**, and array elements evaluate left to right. An element that contains an `await` of its own suspends the enclosing function mid-literal — after the earlier elements' promises have been constructed, but before `Promise.all` has been called to attach handlers to them. If one of those already-running promises rejects during the suspension, the function throws at the inner `await` and the rejected promise is orphaned into an `unhandledRejection`, which the Cloud Functions runtime answers by killing the instance, so the caller receives an opaque crash instead of the real error.

```typescript
async function readBoth(url1: string, url2: string) {
  // Hoisting these would suspend the array literal at `await fetch(url1)`,
  // and buy no parallelism: fetch(url2) still cannot start until it resolves.
  await (await fetch(url1)).json();
  await (await fetch(url2)).json();
}
```

The scan stops at every function boundary, because an `await` inside a callback belongs to that callback and runs only when it is invoked. `await Promise.all(items.map(async (item) => await store(item)))` evaluates straight through to a promise without suspending anything, so it remains parallelizable.

### ✅ Correct (sequential `reduce` accumulator)

`arr.reduce(async (promise, item) => { await promise; ... }, Promise.resolve())` is the canonical idiom for **forcing** sequential execution over a collection. The callback's first parameter *is* the previous iteration's completion, so `await promise` is a serialization barrier rather than an operation of its own — the whole point of writing the fold instead of `Promise.all(arr.map(...))`.

```typescript
async function persistAll(documents: Doc[], collectionRef: CollectionReference) {
  const setter = new DocSetter(collectionRef);
  // Each `setter.set` waits for the previous document to finish.
  await documents.reduce(async (promise, doc) => {
    await promise;
    await setter.set(doc);
  }, Promise.resolve());
}
```

The dependency here is a **sequencing** one: the accumulator and `setter.set(doc)` share no value at all, so the identifier comparison the rule uses would classify them independent and hoist both into a `Promise.all([...])` — starting every iteration's work at once and discarding exactly the guarantee the idiom exists to provide. The run is deliberate rather than a latency mistake, so the rule declines to **report** it, not merely to fix it.

The accumulator is resolved through the **scope chain**, never matched against a name list: it is spelled `promise`, `acc`, `previous`, `prev`, `chain` or anything else the author preferred, and a local that merely borrows one of those spellings (`const promise = load(doc); await promise;`) is correctly *not* the accumulator. The barrier requires all of:

- the awaited expression is a bare identifier (TS-only `!` and `as T` wrappers are looked through);
- it resolves to the **first** parameter of its declaring function, so awaiting the element parameter stays reportable;
- that function is passed **directly** as the first argument of a `.reduce(...)` or `.reduceRight(...)` call — a callback bound to a name first is not chased;
- something in the run **follows** the accumulator await, since it is what follows the barrier that the rewrite would illegally start early.

A `for...of` loop expresses the same sequential intent and is exempt through the loop barrier instead.

#### ❌ Incorrect (an independent run later in the same fold callback)

Only the statement run containing the accumulator await is exempted. A later, separate run of genuinely independent awaits in the same callback is still reported and still fixed, so the exemption cannot switch the rule off for a whole callback:

```typescript
await documents.reduce(async (promise, doc) => {
  await promise;
  await setter.set(doc);
  const derived = compute(doc);
  // Nothing serializes this pair: it is reported and merged as usual.
  await logStart(derived);
  await logFinish(derived);
}, Promise.resolve());
```

### ✅ Correct (test files are exempt)

Test files are skipped entirely. A test suite serves no requests and is not latency-critical, so the rule's rationale — that sequential awaits make network and I/O latency add up — does not apply to it. Its awaits instead encode **ordering**: an awaited assertion observes the DOM or server state produced by a preceding awaited interaction. That dependency is a side effect rather than a value, so it is invisible to every barrier above, and `Promise.all([...])` would race the assertion against the interaction.

```typescript
// src/components/__tests__/PasswordResetButton.test.tsx — not reported
await userEvent.click(screen.getByText('Forgot password?'));
await waitFor(() => {
  expect(screen.getByText(/reset email will arrive shortly/i)).toBeInTheDocument();
});
```

A file counts as a test file when its path ends in `.test.` / `.spec.` followed by a JS/TS extension (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, ...), or when it sits under a `__tests__/` or `__mocks__/` path segment. Matching is anchored, so production modules that merely contain the word (`testHelpers.ts`, `latest.ts`, `contest/Thing.ts`, `foo.test.helper.ts`) keep their enforcement. Set the `ignoreTestFiles` option to `false` to enforce inside test files anyway.

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

### Autofix and comments

A comment between the merged awaits is re-hosted on its own line directly above the `Promise.all` element built from the statement it annotated, so an `eslint-disable-next-line` directive keeps suppressing the code that survives inside the array. When no placement can preserve what a comment governs — a trailing comment on a merged statement's own line (e.g. `// eslint-disable-line`), a comment between `await` and its operand, or a directive above a `const x = await ...` whose identifier moves into the destructuring pattern — the fix is declined and only the report is emitted, so no comment is ever silently deleted.

### Autofix layout

The fix authors a whole statement that a formatter owns, so it emits the layout Prettier would print rather than a fixed one.

The operand array is joined onto one line while the statement fits inside [`printWidth`](#printwidth), and broken open one operand per line only past it. Wrapping unconditionally is not the safe direction: unlike an object literal, whose author-chosen expansion Prettier preserves, an array Prettier considers short enough is collapsed straight back onto one line, so a blanket wrap comes back rewritten on the next format run.

```typescript
// before
async function loadPair() {
  await alpha();
  await beta();
}

// after --fix
async function loadPair() {
  await Promise.all([alpha(), beta()]);
}
```

Once the destructuring pattern grows long enough that the call can no longer start on its line, Prettier breaks after the `=` instead of opening the array, and the fix follows:

```typescript
async function loadDashboard() {
  const [leaderboardSnapshotEntries, tournamentSnapshotEntries] =
    await Promise.all([one(), two()]);
}
```

An operand that moves into the array is re-indented to the depth it lands at, so its own continuation lines travel with it. Re-indenting stops at any token that owns its lines — a multi-line template literal, a string written with a backslash continuation, a block comment — because that whitespace is data the program produces rather than layout:

```typescript
// after --fix
async function seedFixtures() {
  await Promise.all([
    runQuery(`
SELECT *
  FROM users
`),
    withConnection(async (connection) => {
      connection.release();
    }),
  ]);
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

Supplying the option **replaces** this list; supplying any other option leaves it intact.

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

### `ignoreTestFiles`

A boolean (default: `true`) that exempts test files from the rule, as described in [Test files are exempt](#-correct-test-files-are-exempt). Set it to `false` to enforce `Promise.all` inside `.test.*` / `.spec.*` files and `__tests__/` / `__mocks__/` directories as well.

**Example configuration:**
```json
{
  "rules": {
    "@blumintinc/blumint/parallelize-async-operations": [
      "error",
      {
        "ignoreTestFiles": false
      }
    ]
  }
}
```

### `printWidth`

A number (default: `80`) giving the column the autofix lays the rewritten statement out against, as described in [Autofix layout](#autofix-layout). It has no effect on which sequences are reported.

The width lives in the consumer's formatter configuration, which no rule context carries, so a project formatting at 100 or 120 states it here. Set too low, a statement that would have fit is emitted broken open and the formatter joins it back; set too high, an overflowing statement is emitted on one line and the formatter breaks it. Either way the fix still applies — only the diff churns on the next `prettier --write`.

**Example configuration:**
```json
{
  "rules": {
    "@blumintinc/blumint/parallelize-async-operations": [
      "error",
      {
        "printWidth": 120
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
1. The awaits sit inside a fold that exists to serialize them — write it as `arr.reduce(async (promise, item) => { await promise; ... }, Promise.resolve())` and the rule leaves the run alone.
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
