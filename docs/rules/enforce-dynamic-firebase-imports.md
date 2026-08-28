# Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed (`@blumintinc/blumint/enforce-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces dynamic importing for modules under `firebaseCloud` so Firebase code loads only when needed. Dynamic imports keep cold-start and bundle size lower by deferring Firebase client/server code until it is actually executed.

The rule matches an import whose module specifier contains a `firebaseCloud/` path segment (e.g. `../../firebaseCloud/messaging/setGroupChannel`, `src/firebaseCloud/messaging/api`). A specifier that merely starts with the word — `firebaseClouds/utils/helper` — is not matched.

## Exempt files

The rationale is bundle weight, so files that never reach the client bundle are exempt entirely:

- **Test and spec files** — any path ending in `.test.` or `.spec.` followed by `js`, `jsx`, `ts`, `tsx`, `mjs`, `mts`, `cjs` or `cts`. A suite is never bundled, and its static binding is what `jest.mock()` hoisting intercepts.
- **Jest convention directories** — any file under a `__tests__/` or `__mocks__/` directory, whatever its name.
- **Declaration files** — any path ending in `.d.ts`, which emits no runtime code.
- **Third-party sources** — anything under `node_modules/`.

The test suffix is anchored to the end of the path, so production modules that merely contain the word (`latest.tsx`, `contest.ts`, `testHelpers.ts`, `src/testing/setup.ts`) keep their enforcement.

## Usage

Enable the rule via the recommended config or explicitly:

```json
{
  "plugins": ["@blumintinc/blumint"],
  "rules": {
    "@blumintinc/blumint/enforce-dynamic-firebase-imports": "error"
  }
}
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `printWidth` | `number` | `80` | The column the autofix keeps its emitted statement within. Set it to the `printWidth` your formatter uses. |

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-dynamic-firebase-imports": [
      "error",
      { "printWidth": 100 }
    ]
  }
}
```

The fix authors a whole statement whose length grows with the import — one entry
per specifier, plus the module path verbatim — so an unmeasured one-line form has
no width bound. The statement is measured against the column it actually lands
on, indentation included, and broken open only when it overflows: Prettier
collapses a short expanded destructuring pattern, argument list or assignment
straight back onto one line, so wrapping unconditionally would fail
`prettier --check` on every short import instead.

## Autofix

The fix **relocates** the import to its call site: it deletes the static import
and declares the dynamic one inside the `async` function that uses it, ahead of
the first statement that reads it. Type-only specifiers stay behind as an
`import type`, since they are erased at compile time and a dynamic import cannot
supply them.

An `import` declaration only ever sits at module scope, so rewriting it where it
stands could only ever produce a module-scope `await import(...)` — which defers
nothing (the module still awaits it while evaluating) and does not even parse
once the file is compiled to CommonJS, where top-level `await` does not exist.
The rule therefore offers the fix only where the rewrite is expressible at a
call site, and **reports without fixing** everywhere else. The editor suggestion
offers the same edit and is likewise withheld when the fix is.

The fix applies when every value reference to the import lives inside one
`async` function body:

```ts
import { setGroupChannel } from '../../firebaseCloud/messaging/setGroupChannel';

export const handler = async () => {
  return setGroupChannel();
};
```

becomes

```ts
export const handler = async () => {
  const { setGroupChannel } = await import(
    '../../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel();
};
```

The emitted statement takes whichever shape the formatter would print at that
column: one line while it fits, then the call's argument broken open, then a
break after the `=`, then one property per line. A pattern of more than two
properties with any of them renamed expands whatever it measures, matching
Prettier's own treatment of a complex destructuring target.

A reference held by a synchronous callback nested inside that async function
still counts, because the callback cannot run before the statement that creates
it.

### Where the declaration lands

The declaration heads the innermost statement list enclosing **every**
reference, immediately ahead of the first statement of that list holding one —
not the function body. Heading the body puts the module-load `await` in front of
whatever the body ran before the first reference, which turns synchronous
prelude code into post-await code: a re-entrancy guard stops guarding, and a
loading flag that is contractually set in the same task as the user gesture is
set one microtask late.

```ts
import { mint } from '../../firebaseCloud/app/mint';

export const reveal = async (status: string) => {
  if (status === 'minting') {
    return undefined;
  }
  return await mint(status);
};
```

becomes

```ts
export const reveal = async (status: string) => {
  if (status === 'minting') {
    return undefined;
  }
  const { mint } = await import('../../firebaseCloud/app/mint');
  return await mint(status);
};
```

Statements written ahead of that anchor keep their order and stay ahead of the
injected `await`, so the placement only ever moves the suspension point later
than heading the body would. Where the anchor already is the first statement,
the emission is exactly what heading the body produced.

The list has to be the **least common** one: a position inside a deeper branch
would leave every reference outside that branch reading a binding that is not in
scope. References in sibling branches therefore put the declaration ahead of the
branch, while references confined to a `try`, a `catch`, a braced `case` clause
or a loop body that already awaits put it inside that block — where a chunk-load
rejection stays catchable, and where a loop that never iterates loads nothing at
all. Re-evaluating `import(...)` per iteration fetches nothing twice, since the
module map memoizes the load, and a loop that already awaits interleaves with or
without the extra suspension.

A loop body that never suspends is the exception. It runs to completion in one
task, and code after it observes only its finished state; an `await` inside it
would hand control back on every iteration, which is the same silent change as
jumping a guard, one level down. Such a body hands the declaration to the next
container out — one load ahead of the loop rather than one per pass, which is
where a reader would write it anyway:

```ts
import { create } from '../../firebaseCloud/transaction/create';

export const trackAll = async (ids: string[]) => {
  const sorted = [...ids].sort();
  for (const id of sorted) {
    create(id);
  }
};
```

becomes

```ts
export const trackAll = async (ids: string[]) => {
  const sorted = [...ids].sort();
  const { create } = await import('../../firebaseCloud/transaction/create');
  for (const id of sorted) {
    create(id);
  }
};
```

That step outward is a preference, not an override: it stops at a `try` whose
`catch` covers the loop, and it is abandoned altogether where the position
outside would land inside a guard (below), since an `await` per iteration is the
milder of the two changes.

Three containers hold statements but never the declaration:

- a nested function, a class static block and a `namespace` body, where the
  `await` would belong to that body rather than to the async function. A
  reference inside one is served from the nearest position outside it, which is
  where that body is evaluated and therefore ahead of every run of it.
- a `case` clause with no braces, since a lexical declaration written directly
  in one is scoped to the whole `switch` block — in scope, and in the temporal
  dead zone, for every other clause. The declaration heads the list the `switch`
  itself sits in.
- the position of a hoisted `function` declaration holding the reference. A call
  written above it reaches the body first, so the declaration heads the list
  rather than taking the function's own position.

Comments written above the anchor document it, so the declaration goes ahead of
the whole run rather than between a comment and its subject.

### Guards no placement clears

The anchor answers **where** the `await` goes, not whether going there is safe.
A re-entrancy guard whose own branch reads the import is the case no position
survives: the earliest referencing statement _is_ the guard, so the declaration
lands ahead of the test, and two calls in the same tick both suspend on the
module load before either flips the flag.

```ts
import { create } from '../../firebaseCloud/transaction/create';

let busy = false;

export const reveal = async (status: string) => {
  const trimmed = status.trim();
  if (busy) {
    return await create(trimmed);
  }
  busy = true;
  return await create(status);
};
```

No placement both reaches the reference and leaves the guard intact, so the
violation is reported with **no fix at all** and the import is left for a
hand-written one.

The same withholding covers the mirror position, where the `await` lands behind
the test and ahead of the act (`if (!started) { create(id); started = true; }`),
which widens the very window the guard closes. What counts as a guard is narrow,
so that ordinary branching keeps its fix:

- the test has to read state that a statement running behind the `await`
  **writes**. A test of a value nothing here assigns (`if (op === 'mint')`) is a
  branch, not a guard, and a suspension near it changes nothing the test
  observes. The write can be an assignment, an update, or a call to the setter
  named after the value (`setRevealStatus('minting')` writes `revealStatus`).
- the state has to outlive the call. A `let` declared inside the async function
  is created fresh per call, so no second call can observe the one this call
  flips. Any member path (`busyRef.current`, `this.busy`) counts as shared,
  whatever binding roots it.
- nothing may suspend in that window already. A guard reached through an
  existing `await`, or whose act is, runs across tasks whatever this fixer does,
  so the relocation is not what makes it unreliable.

Statements the anchor's own branch returns past are not part of that window:
they never run behind the injected `await`, so a guard written there withholds
nothing. Neither is anything held by a nested body — a `function` declaration,
a function expression or arrow, a class `static` block, a `namespace` — however
that body is written. What such a body holds runs when IT is invoked, which is
not a moment the relocated `await` moves, so a guard and a flip spelled inside
one leave the fix intact. A test that IS a closure (`if (() => busy)`) reads
nothing for the same reason: it evaluates to the function, never to what the
function would read when called.

### Concise bodies

An `async` arrow with a concise body has no statement list to head, so the fix
gives it a block and returns the expression it used to be:

```ts
import { setGroupChannel } from '../../firebaseCloud/messaging/setGroupChannel';

export const handler = async () => setGroupChannel();
```

becomes

```ts
export const handler = async () => {
  const { setGroupChannel } = await import(
    '../../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel();
};
```

An enclosing `async` block is the smaller edit, so a reference inside a concise
arrow nested in one lands there instead.

### When the fix is withheld

The fix is withheld — the violation is still reported — when the import is:

- read at module scope, including a re-export (`export { create }`) or a
  module-level `typeof` annotation;
- read only from a synchronous function, which has nowhere to put an `await`;
- read from a function's signature (a parameter default or a return type),
  which is evaluated before the body runs;
- read from more than one `async` function, which is a per-call-site refactor;
- read by nothing at all, including a side-effect import (`import '…'`), which
  binds no name to relocate;
- read both inside a `try` block and outside it. No position is both inside the
  block and in scope for the reference outside it, and an outside position lets
  the module-load rejection escape the `catch` that was written for the call.
  Leaving a `catch` or a `finally` block is not withheld: what they throw was
  never caught by their own `try` either;
- read where every placement would put the module load inside a check-then-act
  on state that outlives the call, as described under
  [Guards no placement clears](#guards-no-placement-clears). A manual placement
  is cheap; a guard that stops guarding is not.

## Examples

### Incorrect

```ts
// Eager import pulls Firebase into the main bundle
import { setGroupChannel } from '../../firebaseCloud/messaging/setGroupChannel';

const handler = () => {
  return setGroupChannel();
};
```

### Correct

```ts
// Runtime import keeps Firebase out of the initial bundle
const handler = async () => {
  const { setGroupChannel } = await import(
    '../../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel();
};

// Type-only imports remain untouched
import type { Params } from '../../firebaseCloud/messaging/setGroupChannel';
```

```ts
// File: src/hooks/useStartMatch.test.tsx
// A suite is never bundled, so a static import is fine there — and it is what
// `jest.mock()` hoisting needs in order to intercept the module
import { startMatch } from '../../firebaseCloud/tournament/startMatch';

jest.mock('../../firebaseCloud/tournament/startMatch');
```
