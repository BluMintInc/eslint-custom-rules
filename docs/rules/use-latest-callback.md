# Enforce using useLatestCallback from use-latest-callback instead of React useCallback (`@blumintinc/blumint/use-latest-callback`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces using `useLatestCallback` from the `use-latest-callback` package instead of React's `useCallback` for callbacks that do not return JSX.

## Rule Details

`useCallback` re-creates the function whenever its dependency array changes. That either forces you to maintain a long dependency list (and risk stale closures if you miss one) or accept that the function identity churns and triggers extra renders in parents, children, or effects. `useLatestCallback` keeps the reference stable while still executing with the latest props and state, so callers see a consistent function identity without needing dependency arrays.

This rule:
- Flags `useCallback` imports from `react` when the wrapped function does **not** return JSX.
- Auto-fixes by importing from `use-latest-callback`, replacing the call site, and removing the dependency array.
- Leaves JSX-returning callbacks and render-prop patterns alone because `useCallback` is the right tool for memoizing rendered output.
- Removes the `useCallback` specifier from the `react` import only when every reference to it is converted. If a JSX-returning call — or any other use of the binding, such as `const cb = useCallback` — survives, the `react` import is kept untouched and the `use-latest-callback` import is added alongside it.
- Splices only the `useCallback` specifier and its separating comma out of the `react` import, so the rest of the declaration — its layout, its quote style, and every comment in it — is preserved. A comment that belongs to the removed specifier is left behind rather than deleted, because a trailing comment can be an eslint directive that governs the **next** line and dropping it would change which rules report on the file. The whole declaration is replaced only when `useCallback` is its sole specifier, in which case no comment inside it can govern anything that remains.
- Emits the import rewrite and every call-site conversion as **one atomic fix** on a single report. When another rule's fix conflicts with any part of it in the same `--fix` pass, ESLint defers the whole conversion to the next pass instead of applying half of it, so the `useCallback` import can never be removed while a `useCallback(...)` call remains.
- Withholds the fix when dropping the dependency array would leave a declaration with no reader left, and retires an **import** left that way in the same fix — see [Dependencies nothing else reads](#dependencies-nothing-else-reads).
- Retires the `react` import a converted `React.useCallback` call was the last reader of, decided by scope analysis rather than by any JSX or `.tsx` test — see [Retiring the `react` import a `React.useCallback` call was the last reader of](#retiring-the-react-import-a-reactusecallback-call-was-the-last-reader-of).
- Leaves a callback whose identity another hook keys on, or a `ref` re-registers on, alone entirely — see [When the callback identity is load-bearing](#when-the-callback-identity-is-load-bearing).
- Keeps the rewritten call on one line only while that line fits the print width, and breaks the argument list open past it — see [Print width](#print-width).
- Skips files in `node_modules` for performance so third-party code is untouched.

### Print width

Dropping the dependency array lets the call collapse onto one line, so the fix
decides a line break a formatter owns. Prettier hugs a lone function argument
onto the call's line while it fits and breaks the argument list open past the
print width, and it converts either shape into the other — so wrapping
everything is no safer than wrapping nothing. The fix therefore **measures** the
line the collapsed call actually lands on, against the source with every
conversion in the file already applied, and only breaks open when that line
overruns the [`printWidth` option](#options):

```ts
// Before — 106 columns once collapsed
const updateIntersectionState = useCallback(
  (index: number, entry: IntersectionObserverEntry) => {
    onChange(index);
  },
  [onChange],
);

// After --fix
const updateIntersectionState = useLatestCallback(
  (index: number, entry: IntersectionObserverEntry) => {
    onChange(index);
  },
);
```

The broken-open form puts the callee on its own line, the callback one nesting
step in, and the closing paren back at the statement's indentation. The step is
the file's own — read as the most common indentation increase between
consecutive lines, ignoring block-comment interiors — so a tab-indented file
sheds and gains tabs. A callback the author already broke onto its own line
keeps the exact indentation it was written at, so that layout survives byte for
byte. The trailing comma follows the formatter's `trailingComma` setting, read
off the call being rewritten whenever it was already broken open.

Width is not the only trigger. An **arrow whose parameter list is itself broken
across lines** is never hugged onto the call's line — that would leave the
call's open paren and the arrow's dangling at the end of one line — so such a
call is broken open however short the collapsed line measures.

Two cases deliberately stay collapsed even past the width:

- A **function expression with parameters**. Prettier answers an over-long call
  there by hugging the function and breaking its *parameter list* instead, a
  shape this fix cannot author; collapsed at least keeps the first line Prettier
  keeps. A parameter-less function expression has no such list and does break
  open.
- **Ambiguous indentation** — a callback indented with characters that are
  neither a prefix of the call's indentation nor extended by it (tabs against
  spaces). No delta can be applied without corrupting the layout, so the
  callback is reproduced exactly as the author wrote it.

Whitespace inside a multi-line template literal or string is the value the
program produces, not formatting, so those lines are never shifted in either
direction.

### Mixed files

When only some calls are converted, the `react` import stays because the remaining calls still need it. The new import gets its own name, so an aliased `react` import is never repurposed to point at a different hook.

```jsx
// Before
import { useCallback as uc, useMemo } from 'react';

function MyComponent({ items }) {
  const renderItem = uc((item) => <li>{item.name}</li>, []);
  const handleClick = uc(() => submit(items), [items]);
  const count = useMemo(() => items.length, [items]);
  return <ul onClick={handleClick}>{items.map(renderItem)}{count}</ul>;
}

// After --fix
import useLatestCallback from 'use-latest-callback';
import { useCallback as uc, useMemo } from 'react';

function MyComponent({ items }) {
  const renderItem = uc((item) => <li>{item.name}</li>, []);
  const handleClick = useLatestCallback(() => submit(items));
  const count = useMemo(() => items.length, [items]);
  return <ul onClick={handleClick}>{items.map(renderItem)}{count}</ul>;
}
```

### Existing `useLatestCallback` bindings

The fix emits a bare reference to the hook and, when the import is missing, a
**value default import** — `import useLatestCallback from 'use-latest-callback';`
— because the package's only export is the hook itself. So the fix is
**withheld** whenever another `useLatestCallback` is visible at the call being
rewritten. The violation is still reported; only the automated edit is skipped:

```jsx
import { useCallback } from 'react';
const useLatestCallback = 1;

// Reported, not fixed: the inserted import would be a second declaration of
// `useLatestCallback` (TS2440, or TS2300 when the existing binding is itself
// an import).
export function ProfileCard({ user }) {
  const onSave = useCallback(() => save(user), [user]);
  return <SaveButton onClick={onSave} />;
}
```

```jsx
import { useCallback } from 'react';

// Reported, not fixed: the parameter would capture the rewritten call with no
// compile error at all.
export function ProfileCard(useLatestCallback) {
  const onSave = useCallback(() => save(), []);
  return <SaveButton onClick={onSave} />;
}
```

An existing binding is reused instead of duplicated only when every declaration
of it is a value default specifier of `use-latest-callback`, or a value named
specifier of `useLatestCallback` from it. A namespace import
(`import * as useLatestCallback`) binds a module object rather than a callable,
a type-only import erases at compile time, and a reverse alias
(`import { getLatestCallback as useLatestCallback }`) binds a different export —
each of those withholds the fix. A hook import aliased the other way
(`import { useLatestCallback as stable }`) is reused under its own name, and a
merely similar name such as `useLatestCallbackRef` never trips the guard. The
name freed by the `react` specifiers the fix deletes stays claimable, so
`useCallback as uc` still hands `uc` to the new import.

### Dependencies nothing else reads

The fix deletes the dependency array. When that array holds the **last read** of
a binding declared inside the component or hook, deleting it strands that
declaration — and whatever imports feed it — with nothing using it, so `--fix`
turns a file that lints clean into one `no-unused-vars` rejects, with a
violation this plugin cannot itself fix. The conversion is still **reported**;
only the automated edit is withheld, so the dead declaration is dropped together
with the array.

The shape is routine rather than hypothetical, because a sibling fixer writes
it: `no-array-length-in-deps` answers a `[list.length]` dependency by hoisting a
hash and depending on that instead, and the dependency array is the hash's only
reader.

```ts
// After no-array-length-in-deps has fixed the same file
const listHash = useMemo(() => stableHash(list), [list]);

// Reported, not fixed: dropping [listHash] would leave the useMemo above — and
// the stableHash import feeding it — with no reader at all.
const handle = useCallback(async () => {
  await setThing({ only: list.length === 1 });
}, [listHash, setThing]);
```

The batch is atomic, so one orphaned binding withholds every conversion in the
file. Bindings are compared by **resolution, not by name**, so a dependency that
reaches a shadowed declaration is judged against that declaration rather than
against an unrelated binding spelled the same way, and only **reads** keep a
binding alive — one left merely written to is as dead as one left unreferenced.

The same holds at **module scope**, with one binding kind the fix can retire
itself: an **import**. An import read only by the deleted array is unbound in the
same fix that deletes it, because ESLint applies a fix whole or not at all and a
removal split across reports could land without the deletion it was claimed on.
Any other module-scope declaration — a `const`, a function — is withheld like a
local one, since this rule does not delete declarations.

Both halves of the array are judged separately, so one dependency can survive
while another is retired:

```ts
import { useCallback } from 'react';
import { CONFIG } from './config'; // retired with the array below

export const useThing = (id: string) => {
  const handle = useCallback(() => {
    go(id);
  }, [id, CONFIG]);

  return handle;
};
```

`id` is read by the callback body, so deleting the array leaves it bound as
before. `CONFIG` is read only by the array, so the import goes with it.

Two things never withhold the fix:

- A dependency that anything outside the deleted array still reads, the
  rewritten callback's own body included. It survives the deletion untouched.
- An **exported** binding. Its consumers are out of this file's reach, so no edit
  here can leave it unread.

### Retiring the `react` import a `React.useCallback` call was the last reader of

`React.useCallback(fn, [])` becomes `useLatestCallback(fn)`, which reads nothing
from the `react` import at all. When that call held the **last read** of the
`React` binding, the fix carries the import's removal with it — otherwise `--fix`
would answer one report by producing an unreferenced import, failing the
consumer's `no-unused-vars` and `noUnusedLocals` with nothing left to re-raise
the debt.

Whether the binding still has a reader is decided by **scope analysis**, never by
looking for JSX or for a `.tsx` extension. Under the classic runtime the scope
manager records the implicit `React` reference the JSX pragma creates, so a file
whose JSX still needs the import keeps it; told there is no pragma
(`jsxPragma: null`, the automatic runtime), the same file records no such
reference and the import goes. That is the same oracle `no-unused-vars` consults,
so the two can never disagree.

```ts
// Reported and fixed to `import useLatestCallback from 'use-latest-callback';`
import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};
```

```ts
// The react import survives: `React.createElement` still reads it.
import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return React.createElement('div', null, inner);
};
```

A **comment inside the declaration** withholds the whole fix rather than risking
the comment: which line a comment governs is not this rule's to guess, and an
eslint directive moved or dropped silently changes which rules report on the
file. The one exception is the `useCallback` specifier splice described above,
which touches only the specifier's own tokens and therefore never has to guess.

### When the callback identity is load-bearing

`useLatestCallback` returns a **permanently stable** reference. That is the point
of it, and it is also why a callback whose identity something **compares** is
exempt from this rule entirely. A consumer that watches the callback across
renders stops seeing it change, so whatever that comparison triggers happens
**once, ever** — with the first render's values, forever.

Two consumers compare a callback's identity: a hook that lists it in a
dependency array, and a **ref**, which React re-invokes precisely when the
identity it is handed changes.

```ts
// Exempt: useFirestore lists `handler` in its own effect's dependencies, so the
// fetch re-runs exactly when `ids` changes. A frozen `handler` fetches once and
// the UI keeps that first result.
const handler = useCallback(
  (snap) => snap.filter((hit) => ids.includes(hit.id)),
  [ids],
);
const state = useFirestore(handler, INITIAL);
```

```tsx
// Exempt: a ref callback re-runs when its identity changes, and that is its
// only re-registration trigger — no dependency array exists in the source to
// read. A frozen `attach` registers the first render's `density` and keeps
// publishing it after the column resizes.
export const Slot = ({ slotId, density }) => {
  const attach = useCallback(
    (element) => attachSlot(slotId, element, density),
    [slotId, density],
  );

  return <div ref={attach} />;
};
```

Such a site is not reported at all, rather than reported without a fix, because
no compliant remedy exists: rewriting it as `useMemo(() => fn, deps)` is
converted straight back to `useCallback` by
`prefer-usecallback-over-usememo-for-functions`, and that fixpoint is the same
frozen identity with nothing left reporting it.

Two conditions must both hold for the exemption:

1. The call's identity **changes between renders** — its dependency array is
   non-empty, absent, or spelled as a value this file cannot read. An **empty**
   array already pins the identity for the component's lifetime, so converting
   the call cannot change what any consumer observes; such a call converts even
   when it is handed straight to a hook.
2. A consumer **in this file** compares the identity, in one of two positions:
   - It reaches a hook: the result is an element of an array argument of a call
     named `useSomething`, or a direct argument of one. The naming convention is
     the signal, because a custom hook's body may live in any module and no list
     of hook names can be complete. A member callee counts through its property
     name, so `hooks.useThing(handler)` reads as a hook.
   - It is the value of a `ref` attribute (`<div ref={handler} />`). React
     registers a ref callback by identity, so a stable reference registers once
     and never re-runs. The attribute React itself reads is the signal: an
     ordinary prop that merely spells `ref` in its name, such as `innerRef`, or
     a `ref` property on an object handed to a plain function, is decided by
     code this file cannot read and keeps reporting.

Every other use keeps reporting, because nothing there compares the reference —
a stable wrapper invokes the latest closure, so the callback's behaviour is
unchanged:

| Use of the result | Reported |
| :-- | :-- |
| `<Button onClick={handler} />` | yes — React calls what the wrapper holds |
| `handler()` | yes |
| `setTimeout(handler, 0)` | yes — a plain function keys nothing on identity |
| `useOptions({ onDone: handler })` | yes — the object is rebuilt every render |
| `<Panel innerRef={handler} />` | yes — an ordinary prop, read by code elsewhere |
| `register({ ref: handler })` | yes — no ref is registered here |
| `return handler` | yes — see below |
| `useEffect(effect, [handler])` | no |
| `useFirestore(handler, initial)` | no |
| `<div ref={handler} />` | no — a ref re-registers on identity change |

Returning the callback keeps reporting deliberately. A custom hook that returns
one hands the identity to consumers this file cannot read, so nothing here shows
that anything compares it — and an exemption for every returned callback would
cover most custom hooks, which is the rule's own subject.

### ❌ Incorrect

```jsx
import { useCallback, useState } from 'react';

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  const handleClick = useCallback(() => {
    console.log(`Clicked ${count} times`);
    onAction(count);
  }, [count, onAction]);

  return <button onClick={handleClick}>Click Me</button>;
}
```

### ✅ Correct

```jsx
import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';

function MyComponent({ onAction }) {
  const [count, setCount] = useState(0);

  const handleClick = useLatestCallback(() => {
    console.log(`Clicked ${count} times`);
    onAction(count);
  });

  return <button onClick={handleClick}>Click Me</button>;
}
```

## Options

| Option | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `printWidth` | `number` | `80` | The column the rewritten call must fit within before its argument list is broken open. Set it to your formatter's own `printWidth`. See [Print width](#print-width). |

```json
{
  "@blumintinc/blumint/use-latest-callback": ["error", { "printWidth": 100 }]
}
```

## When Not To Use It

You should not use this rule when:

1. Your codebase doesn't have access to the `use-latest-callback` package.
1. You're working with callbacks that return JSX (render props or components-as-children patterns). In these scenarios, `useCallback` is the correct hook to memoize the component/JSX structure itself.
1. You need a dependency-aware memoized function identity for advanced React optimization cases where a stable reference is not desired.

## Further Reading

- [use-latest-callback package](https://www.npmjs.com/package/use-latest-callback)
- [React useCallback documentation](https://reactjs.org/docs/hooks-reference.html#usecallback)
