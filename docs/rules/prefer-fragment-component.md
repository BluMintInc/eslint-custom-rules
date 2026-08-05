# Require the Fragment named import instead of shorthand fragments or React.Fragment to keep fragments explicit and prop-friendly (`@blumintinc/blumint/prefer-fragment-component`)

🚫 This rule is _disabled_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Using a single fragment style keeps React dependencies explicit and avoids shorthand limitations. This rule replaces `<>` and `<React.Fragment>` with `<Fragment>` imported from `'react'`.

## Why this rule ships disabled

The recommended config sets this rule to `'off'`
(`meta.docs.recommended` is `false`, that field's spelling of `'off'` — its type
admits `false | 'error' | 'strict' | 'warn'` and has no `'off'` member).

A census of the consumer codebase — 8,726 parsed files across `src/**` and
`functions/src/**`, inline disable directives honoured — measures **56 reports
across 37 files**. The consumer's rule-sync reverts a plugin release on *any*
report from a rule it enables, so shipping this rule at `'error'` would break
that gate on the release that shipped it, taking every unrelated rule in the
same release down with it.

The stake is style consistency, not correctness: every construct this rule
flags (`<>`, `React.Fragment`) is valid React that behaves identically to the
`<Fragment>` it asks for. That does not justify blocking a release, so the rule
ships off. Its fixer stays available for migrating the remaining sites on
demand: enable the rule for a single `eslint --fix` run via the `--rule` flag,
without changing what the shipped config gates on.

The recommended config also enables
[`prefer-fragment-shorthand`](./prefer-fragment-shorthand.md), which demands the
opposite spelling (`<React.Fragment>` → `<>`). The two rules cannot both gate: on
`<React.Fragment>` both fire, and their fixers rewrite the same element in
opposite directions. Only one fragment style can be the enforced one, and the
config's answer is the shorthand.

**Graduation criterion:** promote the entry in `src/index.ts` and
`meta.docs.recommended` to `'error'` together, in the same commit, once **both**
hold: the consumer reports **zero** violations of this rule, and
`prefer-fragment-shorthand` has been turned off in the same config (the two are
mutually exclusive). Until the report count is zero, raising the severity is a
knowingly red gate. The consistency of the two severities is asserted by
`src/tests/recommended-severity-consistency.test.ts`, which covers rules shipped
`'off'` as well as enabled ones, so the pair cannot drift apart again.

## Why?

- Shorthand fragments cannot receive props such as `key`, so adding keys later forces a rewrite; `<Fragment>` keeps that option available.
- Mixing shorthand fragments and `React.Fragment` scatters two patterns across the codebase, making refactors and searches harder.
- An explicit `Fragment` import keeps the dependency visible to bundlers and ensures auto-fixes do not leave `<Fragment>` undefined.

## Rule Details

- Prefer `<Fragment>...</Fragment>` from `import { Fragment } from 'react';`.
- Do not use shorthand fragments `<>...</>` or `React.Fragment`.
- The fixer will add the missing `Fragment` import when needed and replace fragment wrappers.

### Examples of **incorrect** code for this rule:

```jsx
const Component = () => <>Hello World</>;

const Component = () => (
  <React.Fragment>
    <ChildComponent />
  </React.Fragment>
);
```

### Examples of **correct** code for this rule:

```jsx
import { Fragment } from 'react';

const Component = () => <Fragment>Hello World</Fragment>;

const Component = () => (
  <Fragment>
    <ChildComponent />
  </Fragment>
);
```

### Interaction with inline disable comments

The `import { Fragment } from 'react';` statement is added once per file,
attached to the fix of the first violation that is **not** suppressed by an
inline `eslint-disable` directive. Exempting an individual fragment therefore
never strands the remaining `<Fragment>` elements without their import:

```jsx
// eslint-disable-next-line @blumintinc/blumint/prefer-fragment-component
const Legacy = () => <>Left alone</>;

const Modern = () => <>Fixed, and carries the import</>;
```

When every violation in a file is suppressed, no import is added at all. A new
import is also placed *above* any `eslint-disable-next-line` comment that
precedes the first statement, so the inserted line never becomes the line that
directive governs.

### Existing `Fragment` bindings

The fix emits a **value named specifier** — `import { Fragment } from 'react';`,
or `, Fragment` appended to an existing `react` import (`, { Fragment }` beside
a default import, and its own declaration beside a namespace import, since
`import * as React, { Fragment }` is a syntax error). Type-only declarations are
never extended, because a specifier added to one erases at compile time.

Because the rewritten element spells `Fragment` bare, the fix is **withheld**
whenever another `Fragment` is visible at the element — the violation is still
reported, only the automated edit is skipped:

```jsx
const Fragment = 1;
// Reported, not fixed: the inserted import would be a second declaration of
// `Fragment` (TS2440).
const C = () => <><span>{Fragment}</span></>;

const D = ({ Fragment }) => <>{Fragment}</>; // Reported, not fixed: the
// parameter would capture the rewritten <Fragment> with no compile error.
```

A binding is reused instead of duplicated only when every declaration of it is a
non-type-only `Fragment` specifier imported from `react` under that exact name.
An alias (`import { Fragment as Frag } from 'react'`) leaves the name free, so
the fix adds the specifier it needs. `React.Fragment` is a member access on the
default import rather than a `Fragment` binding, so it never blocks the fix.

### Fragments inside a `jest.mock` factory

The fix is withheld for one more reason: a fragment inside a `jest.mock`,
`jest.doMock` or `jest.setMock` **module factory**. Jest hoists that factory
above every import in the file, and permits it to read only globals and bindings
whose name begins with `mock` — a `Fragment` reference there fails the transform
(`Invalid variable access: Fragment`) and takes the whole suite down with it.
The shorthand `<>` is the spelling that works in that position. The report still
fires, and two remedies the factory can hold are available to the author:

```jsx
jest.mock('./Provider', () => {
  // Legal: react is loaded inside the hoisted factory.
  const { Fragment } = jest.requireActual('react');
  return { Provider: ({ children }) => <Fragment>{children}</Fragment> };
});
```

```jsx
// Legal: the `mock` prefix puts the alias on Jest's allowlist.
import { Fragment as MockFragment } from 'react';

jest.mock('./Provider', () => ({
  Provider: ({ children }) => <MockFragment>{children}</MockFragment>,
}));
```

Only the factory — the registrar's second argument — declines. A fragment in the
module specifier position, inside a `jest.fn` callback, or anywhere else in the
file is fixed as usual, and a declining factory never claims the import: the
injected `import { Fragment } from 'react'` rides on the first violation that
does fix.

## When Not To Use It

Skip this rule if your project intentionally mixes fragment styles for brevity and you accept losing fragment props like `key` on shorthand fragments.

## Version

This rule was introduced in v1.0.0

## Further Reading

- [React Fragments Documentation](https://reactjs.org/docs/fragments.html)
