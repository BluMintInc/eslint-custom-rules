# Hoist object destructuring out of React hooks so dependency arrays track the fields in use instead of the entire object (`@blumintinc/blumint/enforce-early-destructuring`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Destructuring inside `useEffect`, `useLayoutEffect`, `useCallback`, or `useMemo` forces the dependency array to include the whole object. That dependency re-triggers when any field changes, even if the hook only reads a few properties. Hoisting destructuring to the nearest outer scope allows the dependency array to reference the specific fields actually used, avoiding extra renders and keeping dependency tracking precise.

The fixer:
- Hoists object destructuring out of the hook callback.
- Adds `?? {}` on the hoisted initializer so the destructuring tolerates a missing/undefined object once it runs during render, plus an `= []` default for nested array patterns.
- Re-emits nested object patterns exactly as authored (see below).
- Replaces the object dependency with the destructured bindings when the callback no longer references the base object; otherwise, keeps the original dependency and adds the bindings.
- Merges multiple destructures of the same object into a single hoisted pattern.
- Skips destructuring inside async callbacks or nested async helpers.
- Skips destructuring that depends on type-narrowing checks, including truthiness guards on the object (e.g., `if (!response) return;`).
- Skips a **nested** destructure whose execution a conditional decides, whatever that conditional tests — an enclosing `if`, `try`, `switch` or loop, or an earlier `if` that returns/throws first (see below).
- Reports without fixing when any destructuring statement it would hoist carries a type annotation (see below).

### Nested object patterns keep no synthesized default

A nested object pattern is hoisted verbatim — the fixer does not add `= {}` to it:

```typescript
// Input
useEffect(() => {
  const {
    profile: { name, age },
  } = user;
  renderProfile(name, age);
}, [user]);

// Fixed
const {
  profile: { name, age },
} = user ?? {};

useEffect(() => {
  renderProfile(name, age);
}, [name, age]);
```

TypeScript checks a destructuring default against every binding element beneath it, so `{ profile: { name, age } = {} }` reports [TS2525](https://typescript.tv/errors/#ts2525) once per name: `{}` supplies no value for `name` or `age` and neither carries a default of its own. Emitting that default turned compiling input into non-compiling output. The guard it provided was partial anyway — a `profile` that is explicitly `null` still throws — so the plain hoist is used instead, which reproduces the original statement's runtime behavior exactly. Nested array patterns still get `= []`, which TypeScript does not push down onto the element bindings.

If the hoisted object can be nullish at render time, guard it at the source (`useMemo`, a default prop, or an early return) rather than relying on the destructuring pattern.

### Nested patterns are written expanded

Prettier breaks an object pattern onto one property per line as soon as any
property's value is itself an object pattern, whatever the width. The hoisted
declaration is emitted in that shape directly, so `eslint --fix` output is text
the formatter leaves alone:

```typescript
// Fixed
const {
  id,
  profile: { name },
} = user ?? {};
```

Two shapes deliberately stay on one line, because prettier keeps them there:

```typescript
// A flat pattern that fits.
const { id, name } = user ?? {};

// A nested pattern under a default — including the `= []` this rule
// synthesizes for an array pattern.
const { profile: { name } = {} } = user ?? {};
const { items: [first, second] = [] } = response ?? {};
```

### Nested patterns behind a guard stay put

`?? {}` rescues the **root** of the pattern and nothing beneath it. A nested
pattern hoisted out of a branch that only runs sometimes therefore dereferences
an intermediate on every render, from the component body, before the effect is
even queued:

```typescript
// Left alone: `ready` decides whether the destructure runs at all, and
// `user.profile` is undefined until it does.
const MyComponent = ({ user, ready }) => {
  useEffect(() => {
    if (ready) {
      const { profile: { name, age } } = user;
      renderProfile(name, age);
    }
  }, [user, ready]);
};
```

The guard does not have to mention the destructured object: `if (ready)`,
`if (!isLoaded) return;`, a feature flag, or a `try` whose `catch` is the
fallback all license the dereference the same way. Any of them, anywhere between
the declaration and the callback body, holds the hoist back for a nested pattern.

A **flat** pattern in the same position still hoists — `?? {}` covers the whole
of it, so there is nothing left below the root to dereference:

```typescript
// Hoisted: the fallback covers every binding in a flat pattern.
const { name } = user ?? {};

useEffect(() => {
  if (ready) {
    renderName(name);
  }
}, [ready, name]);
```

To hoist a nested pattern out of a guarded branch by hand, destructure in steps
so each level carries its own fallback (`const { profile } = user ?? {}; const { name, age } = profile ?? {};`).

### Type-annotated declarations report without a fix

The hoisted declaration rewrites the initializer to `(obj) ?? {}`, and the `{}` fallback almost never satisfies the original annotation, so carrying `: Payload` over would manufacture a type error while dropping it would lose the annotation. Deriving a widened annotation needs type information the rule does not have, so the rule reports and withholds the autofix instead:

```typescript
const MyComponent = ({ response }) => {
  useEffect(() => {
    // Reported, but not auto-fixed: `: Payload` cannot survive the hoist.
    const { data }: Payload = response;
    doSomething(data);
  }, [response]);
};
```

Because a single fix rewrites the dependency array for every destructuring it hoists out of one hook, one annotated declarator withholds the fix for that whole hook — a partial hoist would leave the annotated statement behind while still changing when the hook re-runs. Other hooks in the same component are unaffected and still get fixed. Hoist annotated destructuring by hand, choosing an annotation that accounts for the `?? {}` fallback (or drop the annotation and let inference handle it).

### ❌ Incorrect

```typescript
const MyComponent = () => {
  const audioPlayback = useAudioPlayback();

  useEffect(() => {
    const { canPlayAudio, startAudio } = audioPlayback;
    if (!canPlayAudio) return;
    startAudio();
  }, [audioPlayback]); // Entire object in deps
};
```

```typescript
useEffect(() => {
  const { items: [first, second] } = response;
  consume(first, second);
}, [response]);
```

```typescript
useCallback(() => {
  const { name } = user;
  const { age } = user;
  log(name, age);
}, [user]);
```

### ✅ Correct

```typescript
const MyComponent = () => {
  const audioPlayback = useAudioPlayback();
  const { canPlayAudio, startAudio } = audioPlayback ?? {};

  useEffect(() => {
    if (!canPlayAudio) return;
    startAudio();
  }, [canPlayAudio, startAudio]);
};
```

```typescript
const { data } = response ?? {};

useEffect(() => {
  if (!data || Object.keys(data).length === 0) return;
  processData(data);
}, [data]);
```

```typescript
const { name, age } = user ?? {};

useCallback(() => {
  log(name, age);
}, [name, age]);
```

```typescript
const { items: [first, second] = [] } = response ?? {};

useEffect(() => {
  consume(first, second);
}, [first, second]);
```

```typescript
const MyComponent = ({ user, isLoaded }) => {
  useEffect(() => {
    if (isLoaded) {
      const { profile: { address: { city } } } = user;
      renderCity(city);
    }
  }, [user, isLoaded]);
};
```

### Where the hoisted declaration is written

The declaration is placed immediately ahead of the **hook call itself**, not at
the start of the line the call happens to sit on. The two coincide whenever the
call opens its own line, and there it is written on a line of its own at the
call's indentation. When the call shares its line — a component body collapsed
onto one line, or a statement declared ahead of it — the declaration is written
inline beside it, which keeps it inside the function whose parameters it reads:

```typescript
const MyComponent = ({ value }) => {
  const { current } = value ?? {};
  useLayoutEffect(() => {
    doSomething(current);
  }, [current]);
};

const Compact = ({ value }) => { const { current } = value ?? {}; useLayoutEffect(() => { doSomething(current); }, [current]); };
```

Anchoring to the line instead would hoist the declaration past the enclosing
function on the collapsed spelling, leaving it referencing a parameter that is
not in scope there.

### When to disable

- Destructuring relies on a type-narrowed branch and cannot be safely hoisted.
- A nested destructure sits behind a guard the rule leaves alone; hoisting it by hand needs a fallback per level.
- The hook callback is intentionally async and depends on values resolved inside it.
- Hoisting would introduce scope/name collisions or change runtime behavior; in these cases the rule reports but withholds the autofix to avoid unsafe rewrites.
