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

An un-memoized component is reported **wherever it sits** — module scope, a bare
or conditional block, a `namespace` body, `export default`, and inside another
function's body. Nesting is not a carve-out, and neither is the syntax that
declares the component: a `function` declaration and a `const` arrow at the same
depth are the same component, so they receive the same verdict.

```jsx
// Reported: a nested declaration is the same component its arrow twin is.
export const Page = memo(function PageUnmemoized({ items }) {
  function Row({ label }) {
    return <li>{label}</li>;
  }
  return <ul>{items.map((item) => <Row label={item} />)}</ul>;
});
```

A component's body is read for JSX the same way whichever way that body is
spelled. A concise arrow body and the `return` of a block body are the same
value, so `(props) => view` and `(props) => { return view; }` are the same
component when `view` is a single-assignment binding holding JSX. Resolution
follows a binding only while its value is unambiguous: a reassigned binding, or
one whose initializer is itself a function, is left alone — a function value is
not a JSX value, which is why a render helper handed back from a component-named
arrow stays unreported.

A component nested in a render body is also claimed by
[`memo-nested-react-components`](./memo-nested-react-components.md), whose
remedy — hoist the component out of the render body — is the one that repairs
the remount-per-render damage. Following that hoist, this rule's `memo()`
wrapper is what keeps the hoisted component's consumers from re-rendering; the
two reports are complementary steps of one repair.

One shape is deliberately **not** this rule's, in either spelling:

- **A component already handed to `memo()` where it escapes** —
  `return memo(Row);`, `return memo(forwardRef(Inner));`, `React.memo` included —
  is memoized where callers receive it; a second wrapper would be redundant. A
  bare hand-back on **any** return path (`if (compact) return Row;`) defeats the
  carve-out, because callers can still receive the un-memoized function.

  A **container** carries the component to callers just as a bare return does,
  so an object property value or an array element counts at any depth. The
  ES-module interop shape every `jest.mock()` factory returns for a default
  export is the common case:

  ```jsx
  // Not reported: Row is memoized before any caller can reach it.
  export function makeRow() {
    function Row({ label }) {
      return <li>{label}</li>;
    }
    return { __esModule: true, default: memo(Row) };
  }
  ```

  The bare rule reaches through containers in step: `return { default: Row };`
  and `return [Row];` hand the un-memoized function to callers and are reported,
  and a memoized sibling property buys the bare one nothing.

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
  nor an iterator, so no wrapper rescues them;
- **a component declared inside a `jest.mock()` factory**, which jest hoists
  above the module's imports, leaving the helper unbound when the factory runs;
  jest rejects the reference outright with `The module factory of jest.mock() is
  not allowed to reference any out-of-scope variables. Invalid variable access:
  memo`. This holds whether the import is injected by the fix or already present,
  so it is decided before the already-imported case. `jest.doMock` and
  `jest.setMock` run their factory in place and keep the edit.

To memoize such a component, spell the helper so jest allows it — `import { memo
as mockMemo }`, whose name matches the `/^mock/i` allowlist, or a
`jest.requireActual` call inside the factory.

### Existing `memo` bindings

The fix emits a **value named specifier** — `import { memo } from '../util/memo';`,
or `, memo` appended to an existing value import of the helper (`, { memo }`
beside a default import, and its own declaration beside a namespace or
side-effect import, since neither `import * as memoUtils, memo from '...'` nor
`import memoDefault, { memo }, * as memoUtils from '...'` is grammatical). The
extended declaration is measured against `printWidth` and laid out the way a
formatter prints it — see [Which layout the fix gives an extended
import](#which-layout-the-fix-gives-an-extended-import). A type-only declaration
is never extended, because a specifier added to one erases at compile time and
leaves the emitted `memo(...)` call unbound at runtime.

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

## Options

```js
'@blumintinc/blumint/require-memo': ['error', {
  // Column the autofix measures the emitted declaration header against
  printWidth: 80,
}]
```

### `printWidth`

Type: `number`

Default: `80`

The column the autofix measures against, matching Prettier's option of the same
name. Set it to your formatter's `printWidth` so the fixed source is already in
the shape the formatter would produce; a lint run carrying `--fix` otherwise
leaves the tree failing `prettier --check`.

### Which shape the fix emits for a declaration

Wrapping a declaration in place spells the component's name twice on one line —
`export const X = memo(function XUnmemoized(` is 42 + 2 × `len(name)` columns
before a single character of parameter text — so the header overflows for any
sufficiently long name no matter how the source was formatted. The fix measures
that header and picks between two shapes.

While it fits, the wrapper goes in place:

```jsx
export const Panel = memo(function PanelUnmemoized({ foo }) {
  return <div>{foo}</div>;
});
```

Past `printWidth`, the declaration stays where it stands — renamed — and the
memo binding is appended as its own statement, which is one identifier per line
and so fits at any name length:

```jsx
function TournamentRegistrationPanelUnmemoized({
  tournamentId,
  userId,
  onRegistered,
  variant,
}) {
  return <div>{tournamentId}</div>;
}
export const TournamentRegistrationPanel = memo(
  TournamentRegistrationPanelUnmemoized,
);
```

Only the in-place header is measured. The split shape is the better answer even
where its own first line overflows, because a formatter resolves an over-wide
`function XUnmemoized(<params>)` by breaking the parameter list alone, leaving
the body at the depth the author wrote it — whereas an over-wide in-place header
forces the `memo(` call open and re-indents every line of the body.

The appended binding follows the same measurement: it stays on one line while it
fits, and breaks its sole argument out past the width.

### Which layout the fix gives an extended import

Appending `, memo` to an existing `util/memo` import lengthens a line the author
never chose the width of. A blanket append hands the formatter a line it
re-wraps on the next pass, so the extended declaration is measured against
`printWidth` too, and takes one of three layouts:

- While the extended declaration still fits on one line, the specifier is
  appended in place (an always-expanded import would be its own churn):

  ```jsx
  import { memoWithDisplayName, memo } from '../util/memo';
  ```

- A declaration the formatter already broke takes `memo` on its own line at the
  specifiers' indent, so the trailing comma stays where the formatter puts it:

  ```jsx
  import {
    aMemoHelperWithAFortyThreeCharacterName1234,
    anotherMemoHelper,
    memo,
  } from '../util/memo';
  ```

- A single-line declaration that stops fitting is re-laid one specifier per
  line — `import { aMemoHelperWithAFortyThreeCharacterName1234 } from
  '../util/memo';` becomes:

  ```jsx
  import {
    aMemoHelperWithAFortyThreeCharacterName1234,
    memo,
  } from '../util/memo';
  ```

  A default import that stops fitting opens its braces the same way:
  `import aVeryLongDefaultMemoFactoryExportBindingName1234, {\n  memo,\n} from
  '../util/memo';`.

The re-layout rewrites only the separator gaps between the braces and the
specifiers; each specifier's own text is carried verbatim. A comment sitting in
one of those gaps (`import { helper /* pinned */ } from '../util/memo';`) would
be deleted by the rewrite, so its presence withholds the re-layout and the
helper gets its own `import { memo } from '../util/memo';` declaration instead,
leaving the existing bytes untouched.
