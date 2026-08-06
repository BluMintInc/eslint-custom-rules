# React components must be memoized (`@blumintinc/blumint/require-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces memoizing React components that render JSX using our custom `memo` helper. The rule supports both absolute imports (`src/util/memo`) and relative imports (for example, `../util/memo`) based on the file location. Components suffixed with `Unmemoized` are treated as intentional opt-outs.

**Only PascalCase-named functions are treated as React components.** A function whose name starts with a lowercase letter (e.g. `renderCell`, `renderItem`) is considered a render-prop callback or plain helper, not a React component, and is exempt from this rule. React's universal convention and the JSX transform both rely on PascalCase to distinguish components from non-component functions, and libraries such as MUI X DataGrid invoke render callbacks as plain functions (`renderCell(params)`) — wrapping them in `memo()` would produce a non-callable exotic object and break the caller.

## Rule Details

Functions that render JSX and receive props must be wrapped with `memo` from `util/memo` **when their name begins with an uppercase letter** (i.e. they are React components). Without memoization the component function is recreated on every parent render, which breaks referential equality, forces avoidable child re-renders, and invalidates memoized callbacks or selectors. If a component must stay unmemoized, suffix its name with `Unmemoized` to opt out explicitly.

camelCase / lowercase functions that return JSX (render-prop callbacks, render helpers) are intentionally ignored — they are not React components and must not be wrapped in `memo()`.

### Why this rule exists

- Preserves stable component identities so downstream memoized children do not rerender unnecessarily.
- Keeps prop-derived callbacks and selectors referentially consistent across renders.
- Forces intentional opt-out (`Unmemoized`) to document when a component should remain un-memoized.
- Avoids false-positives on render-prop callbacks (e.g. MUI's `renderCell`) that must remain plain functions.

### Examples of **incorrect** code

```jsx
// PascalCase → treated as a React component → must be memoized
const Component = ({ foo, bar }) => {
  return <SomeOtherComponent foo={foo} bar={bar} />;
};
```

```jsx
function ProfileCard({ user }) {
  return <UserAvatar {...user} />;
}
```

```jsx
export function RenderCell({ value }) {
  return <span>{value}</span>;
}
```

```jsx
// A default export is a component like any other.
export default function ProfileCard({ user }) {
  return <UserAvatar {...user} />;
}
```

```jsx
// An HOC factory that hands the component back unwrapped: callers receive an
// un-memoized component, so memoizing it where it is declared is the fix.
export function makeRow() {
  function Row({ label }) {
    return <li>{label}</li>;
  }
  return Row;
}
```

### Examples of **correct** code

```jsx
import { memo } from 'src/util/memo';

const Component = memo(function ComponentUnmemoized({ foo, bar }) {
  return <SomeOtherComponent foo={foo} bar={bar} />;
});
```

```jsx
const ProfileCardUnmemoized = ({ user }) => {
  return <UserAvatar {...user} />;
};
```

```jsx
// camelCase → render-prop callback, not a React component → exempt
const renderCell = ({ row }) => <span>{row.value}</span>;
export const col = { field: 'value', renderCell };
```

```jsx
// camelCase function declaration → exempt
function renderItem({ label }) {
  return <li>{label}</li>;
}
```

### Which components this rule claims

The rule asks whether wrapping the component in `memo()` **where it stands** is
the right fix, which is a question about the binding's lifetime — not about the
syntax that declares it or the node that happens to be its parent. A component is
reported when its identity survives a render:

- anywhere outside a function body — module scope, a bare or conditional block, a
  `namespace` body, and `export default`;
- inside a function that hands it straight back to callers unwrapped
  (`function makeRow() { function Row(...) {...} return Row; }`), because the
  caller receives exactly that un-memoized function.

Two shapes are deliberately **not** this rule's:

- **A component created inside a render body** belongs to
  [`memo-nested-react-components`](./memo-nested-react-components.md). It gets a
  fresh identity on every render, so React unmounts and remounts it — damage that
  `memo()` does not repair. That rule reports it and explains the real fix
  (hoist to module scope). Reporting it here as well would attach a second,
  contradictory remedy to one defect.
- **A component already handed to `memo()`/`forwardRef()` where it escapes**
  (`return memo(Row);`) is memoized; a second wrapper would be redundant.

`export default` is rewritten as a separate statement, because
`export default const X = ...` is not valid syntax. This declaration:

```jsx
export default function ProfileCard({ user }) {
  return <UserAvatar {...user} />;
}
```

becomes:

```jsx
import { memo } from '../util/memo';

const ProfileCard = memo(function ProfileCardUnmemoized({ user }) {
  return <UserAvatar {...user} />;
});
export default ProfileCard;
```

A component that matches the criterion but has nothing to gain from memoization —
a framework root such as Next.js's `_app` — opts out through the same
`Unmemoized` suffix as any other deliberate exception.

### What the fix emits

A **declaration** becomes a memoized `const`, and the function it wraps is
renamed so the component keeps a display name — see the `export default` example
above for the shape.

An **arrow or function expression assigned to a `const`** is wrapped where it
stands. The binding, its name and the function's own text are untouched, so
every reference keeps resolving to the same name and an anonymous initializer is
not forced into a spelling it did not have. This declaration:

```jsx
const ProfileCard = ({ user }) => {
  return <UserAvatar {...user} />;
};
```

becomes:

```jsx
import { memo } from '../util/memo';

const ProfileCard = memo(({ user }) => {
  return <UserAvatar {...user} />;
});
```

The wrapper is withheld — the violation is still reported, only the automated
edit is skipped — for shapes where wrapping in place is not equivalent:

- **an annotated binding** (`const ProfileCard: FC<Props> = ...`), because the
  wrapper's return type is the memo helper's and need not be assignable to the
  declared one, so the edit would trade a lint report for a type error;
- **`let` and `var`**, which can be reassigned afterwards, leaving the name bound
  to an unmemoized value the edit only appears to have fixed, and a declaration
  holding more than one declarator, whose other declarators may carry reports of
  their own;
- **`async` and generator functions**, which React renders as neither a promise
  nor an iterator, so no wrapper rescues them.

### Existing `memo` bindings

The fix emits a **value named specifier** — `import { memo } from '../util/memo';`,
or `, memo` appended to an existing value import of the helper (`, { memo }`
beside a default import, and its own declaration beside a namespace or
side-effect import, since `import * as memoUtils, memo from '...'` is a syntax
error). A type-only declaration is never extended, because a specifier added to
one erases at compile time and leaves the emitted `memo(...)` call unbound at
runtime.

Because the rewritten component spells `memo` bare, the fix is **withheld**
whenever another `memo` is visible at the component — the violation is still
reported, only the automated edit is skipped:

```jsx
const memo = 1;
// Reported, not fixed: the inserted import would be a second declaration of
// `memo` (TS2440, or TS2300 when the existing binding is itself an import).
export function ProfileCard({ user }) {
  return <UserAvatar {...user} />;
}
```

```jsx
// Reported, not fixed: the parameter would capture the emitted memo(...) call
// with no compile error at all.
export function ProfileCard(memo) {
  return <UserAvatar memo={memo} />;
}
```

A binding is reused instead of duplicated only when every declaration of it is a
non-type-only `memo` specifier imported from `util/memo` under that exact name.
An alias in either direction (`import { memo as m }`, `import { createMemo as memo }`)
binds something else, so the first leaves the name free for the fix to claim and
the second withholds the fix. `React.memo` is a member access on the default
import rather than a `memo` binding, so it never trips the guard.
