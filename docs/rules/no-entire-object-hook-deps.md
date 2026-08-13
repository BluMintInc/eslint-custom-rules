# Avoid using entire objects in React hook dependency arrays (`@blumintinc/blumint/no-entire-object-hook-deps`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

💭 This rule requires [type information](https://typescript-eslint.io/linting/typed-linting).

<!-- end auto-generated rule header -->

## Why this rule matters

- Your hooks rerun when any dependency identity changes. Listing an entire object means unrelated property updates (or shallow re-creations) rerun your hook even when you only read a few fields.
- You risk duplicate network calls, animation glitches, or wasted memo computations when your hook fires unnecessarily.
- Listing a dependency you never read in a `useMemo`/`useCallback` reruns the computation for no effect and can hide the real missing dependency you rely on.
- An effect that depends on the value it also writes retriggers itself, producing a render loop.

## What this rule checks

- `useEffect`, `useMemo`, and `useCallback` dependency arrays.
- Flags when you list an entire object even though the hook body only reads specific properties (including optional chaining paths).
- Flags dependencies you put in a `useMemo`/`useCallback` array but never reference in the hook body.
- Requires TypeScript with `parserOptions.project` so the rule can distinguish objects from primitives and arrays, and methods from data properties.

### Methods keep the whole object

A member that resolves to a **method** — one declared on a class or an interface, such as `set.has`, `map.get`, `fn.call`, or your own `formatter.format` — is left alone: the entire object stays the dependency.

Such a member is a reference to the **prototype's** function, which is one shared value across every instance of that type: `new Set().has === new Set().has`, and `f1.call === f2.call` for any two functions. Narrowing `[arrivalIds]` to `[arrivalIds.has]` would therefore pin a constant, so the hook would never invalidate again and would serve stale results forever — the opposite of the extra-render problem this rule exists to solve. The same reasoning already applied to built-in array and string methods (`items.map`, `path.split`), and with type information it covers `Map`, `Set`, `Promise`, `Date`, `Intl.*` and every class you write.

A **function-valued data property** is different and still narrows. `userData.getName`, where the type is `{ getName?: () => string }`, is per-instance state: it genuinely changes when the object carrying it is rebuilt, so depending on it is both narrower and correct.

### Guarded paths stop at the guard

A dependency array is an array literal, so **every element is evaluated eagerly on every render** — outside the `if`, the `&&`, the ternary, the `instanceof` or the `!` assertion that made a deep access safe inside the hook body, and on renders where the memo is reused and the body never runs. A dependency path therefore stops at any link whose dereferenceability only a guard established:

| The body reads | The dependency becomes |
| --- | --- |
| `if (a.b) { return a.b.c; }` | `a.b` |
| `return a.b && a.b.c;` | `a.b` |
| `if (!a.b) return; ... a.b.c` | `a.b` |
| `return a.b!.c;` | `a.b` |
| `return a?.b instanceof Object ? a?.b.c.d : 'x';` | `a?.b` |
| `return a?.items[0];` | `a?.items` |

The last two rows are the same rule read through optional chaining: a link the source reached with `?.` is one you expect to be nullish, so a link spelled **without** `?.` right after it survives only because of something the array cannot carry.

A chain spelled optional all the way through is unaffected — `userData?.date?.toISOString()` short-circuits instead of throwing, and still narrows to `userData?.date?.toISOString`. So do a trailing optional bracket (`a.b?.[0]`, `state?.[0]`) and any path with no guard over it (`a.b.c.d` stays `a.b.c.d`).

The shorter dependency is **coarser, never incorrect**: the hook recomputes whenever the parent object's identity changes rather than only when the leaf does, which can cost a recompute but never yields a stale value — and it still delivers the narrowing away from the whole object.

### Protected and deferred reads stop too

A condition is not the only licence a hook body can hold for a deep dereference. A `catch` **swallows** the very `TypeError` such a dereference raises, and a body the hook does not run — the function `useCallback` hands back, a callback passed to `map`, an inner `async` function — may not run at all on the render whose dependency array is being evaluated. Neither licence reaches the array, so a path resting on one stops at the last link the array can evaluate on its own:

| The body reads | The dependency becomes |
| --- | --- |
| `try { log(user.profile.email); } catch {}` | `user.profile` |
| `useCallback(() => send(data.user.id), [data])` | `data.user` |
| `rows.map(() => user.profile.email)` | `user.profile` |
| `catch (e) { log(user.profile.email); }` | `user.profile` |

The first link is kept whatever the position, because dereferencing the dependency object is what the array already does. Further links are kept only where they are spelled `?.`, which short-circuits instead of throwing: `try { return a.b?.c?.d; } catch {}` keeps `a.b?.c?.d`.

The distinction is whether the hook itself runs the code, not where the code sits. A `useEffect` or `useMemo` body runs, so `useEffect(() => { log(a.b.c.d); }, [a])` still narrows to `a.b.c.d` — an array that throws there is an array whose hook body would have thrown anyway. A `try`/`finally` with no handler re-raises, so its block licenses nothing either.

A **called member never terminates a path** either: `u.date.toISOString()` depends on `u.date`. Beyond dereferencing the guarded receiver, `Date.prototype.toISOString` is one shared value for every date, so pinning it would stop the hook from ever invalidating — the same reasoning as the method carve-out above. A function held directly on the dependency object (`userData?.getName?.()`) still narrows, since falling back to the receiver there would surrender the narrowing entirely.

### Unread dependencies on `useEffect`

An effect runs for its side effects rather than to produce a value, so a dependency the body never reads is normally deliberate: it is a **re-run trigger** for React's reset-on-scope-change pattern ("when the scope identified by these values changes, reset the derived state"). Deleting such a trigger keeps the code compiling while silently stopping the reset, so the rule leaves it alone.

The one shape where an unread effect dependency is genuinely wrong is a **circular dependency**: the effect writes the very value it depends on and therefore retriggers itself. The rule recognises this by the corresponding state setter — a dependency named `channelGroupActive` is only reported when the effect body calls `setChannelGroupActive(...)` (dependency `count` pairs with `setCount`, and so on). The setter call may be nested anywhere in the body, including inside an inner `async` function, a `startTransition` callback, or a `.then()`.

### Manually managed dependency arrays

Suppressing `react-hooks/exhaustive-deps` for a hook declares its dependency array **hand-maintained**: you, not the linter, decide what belongs in it. Entries in such an array are load-bearing by construction, so an entry the body never reads is a deliberate **recompute trigger** — a hydration flag that forces the single post-mount recompute, a hash that detects changes to a mutable value kept out of the array — and deleting it leaves the hook returning a stale value. The rule therefore never reports (and `--fix` never removes) an unread dependency of a hook whose array is manually managed:

- The suppression may sit above the hook call, above the dependency array, or above the closing `}, [...])` line.
- Line (`//`) and block (`/* */`) forms of `eslint-disable-next-line` both count, as does `eslint-disable-line` on the array's own line.
- The rule may appear anywhere in a multi-rule list, with or without a trailing `-- justification`.
- A file-level `/* eslint-disable react-hooks/exhaustive-deps */` exempts every hook in the file.

The suppression must name `react-hooks/exhaustive-deps` explicitly; a directive for another rule, a bare `eslint-disable-next-line`, and prose that merely mentions the rule name all leave the check enabled. This applies to `useEffect`, `useMemo`, and `useCallback` alike, and it composes with the circular-dependency check above rather than replacing it. Narrowing an entire object to the fields you read is unaffected — that transform keeps the dependency instead of dropping it.

## Incorrect

```typescript
function Component({ user }) {
  const greeting = useMemo(() => `Hello ${user.name}`, [user]);
  return <div>{greeting}</div>;
}
```

Message:
`What's wrong: Dependency array includes entire object "user". Why it matters: Any change to its other properties reruns the hook even though the hook reads only user.name, creating extra renders and stale memoized values. How to fix: Depend on those fields instead.`

```typescript
function Component({ unusedObject, usedValue }) {
  // unusedObject is never read, and a memo gains nothing from it
  const result = useMemo(() => usedValue.total * 2, [unusedObject, usedValue]);
  return <div>{result}</div>;
}
```

Message:
`What's wrong: Dependency "unusedObject" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "unusedObject" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.`

```typescript
function Component({ channelGroupIdRouter, channelGroupActive }) {
  useEffect(() => {
    // channelGroupActive is never read, yet the effect writes it: depending on
    // it makes the effect retrigger itself
    setChannelGroupActive(toActiveChannelGroup(channelGroupIdRouter));
  }, [channelGroupIdRouter, channelGroupActive]);
}
```

Message:
`What's wrong: Dependency "channelGroupActive" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "channelGroupActive" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.`

```typescript
function EventEndedText({ endDate, hydrated }) {
  // Nothing marks this array as hand-maintained, so hydrated reads as dead
  // weight and is removed
  const label = useMemo(() => formatRelative(endDate), [endDate, hydrated]);
  return <span>{label}</span>;
}
```

Message:
`What's wrong: Dependency "hydrated" is listed in the array but never read inside the hook body. Why it matters: The hook reruns when "hydrated" changes without affecting the result and can hide the real missing dependency. How to fix: Remove it or add the specific value that actually drives the hook.`

## Correct

```typescript
function Component({ user }) {
  const greeting = useMemo(() => `Hello ${user.name}`, [user.name]);
  return <div>{greeting}</div>;
}
```

```typescript
function Component({ channelGroupIdRouter }) {
  useEffect(() => {
    setChannelGroupActive(toActiveChannelGroup(channelGroupIdRouter));
  }, [channelGroupIdRouter]);
}
```

`status` and `filter` are re-run triggers, not values the effect reads, and the effect never calls `setStatus`/`setFilter`. Keeping them is how the reset happens:

```typescript
function useResettingPagination(status, filter, isPaginated) {
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (!isPaginated) {
      return;
    }
    setPageSize(10);
  }, [isPaginated, status, filter]);
  return { pageSize };
}
```

Suppressing `react-hooks/exhaustive-deps` marks the array as manually managed, so its unread entries are left in place — here the recompute trigger sits above the hook call, and below it above the closing `}, [...])` line:

```typescript
function EventEndedText({ endDate, hydrated }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrated is an intentional recompute trigger (not read in-body): it forces the single post-mount recompute that refreshes the suppressed SSR value
  const label = useMemo(() => formatRelative(endDate), [endDate, hydrated]);
  return <span>{label}</span>;
}
```

```typescript
function useGuards(hooks) {
  const shouldShowHash = useHashOf(hooks);
  return useMemo(() => {
    return buildGuardMap(hooks);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shouldShowHash detects changes to the mutable hooks map kept out of the array
  }, [shouldShowHash]);
}
```

`format` lives on `RelativeTimeFormatter.prototype`, so it is the same reference for every formatter ever constructed. The formatter instance is what actually changes, so it stays the dependency:

```typescript
class RelativeTimeFormatter {
  public format(date: Date): string {
    return date.toISOString();
  }
}

function Bucketed({
  relativeFormatter,
  date,
}: {
  relativeFormatter: RelativeTimeFormatter;
  date: Date;
}) {
  const bucket = useMemo(() => {
    return relativeFormatter.format(date);
  }, [relativeFormatter, date]);
  return <span>{bucket}</span>;
}
```

`toISOString` is reached only inside the `instanceof` narrowing, and the array has no narrowing. The dependency stops at the receiver:

```typescript
function Stamp({ userData }: { userData: { date?: Date } }) {
  const result = useMemo(() => {
    return userData?.date instanceof Date
      ? userData?.date.toISOString()
      : 'No date';
  }, [userData?.date]);
  return <div>{result}</div>;
}
```

## Auto-fix

- Rewrites your dependency arrays to list the specific fields your hook reads.
- Stops a rewritten path at any link whose safety comes from a guard, a non-null assertion, a preceding `?.`, an enclosing `catch`, or a body the hook does not run, so `--fix` never turns code that survives into a `TypeError` on the next render.
- Removes dependencies you keep in a `useMemo`/`useCallback` array but never use.
- Removes an unread `useEffect` dependency only when the effect also calls its corresponding setter, so deliberate re-run triggers survive `--fix`.
- Never removes an entry from an array you manage by hand with a `react-hooks/exhaustive-deps` suppression, on any of the three hooks.

## When not to use it

- You intentionally want your hook to rerun on any change to an object reference (for example, when you treat the object as an immutable snapshot).
- You rely on dynamic computed property access where specifying individual fields is impossible or would reduce correctness.
