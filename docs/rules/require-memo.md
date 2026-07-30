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
