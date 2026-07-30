# Require the Fragment named import instead of shorthand fragments or React.Fragment to keep fragments explicit and prop-friendly (`@blumintinc/blumint/prefer-fragment-component`)

🚫 This rule is _disabled_ in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Using a single fragment style keeps React dependencies explicit and avoids shorthand limitations. This rule replaces `<>` and `<React.Fragment>` with `<Fragment>` imported from `'react'`.

## Why?

- Shorthand fragments cannot receive props such as `key`, so adding keys later forces a rewrite; `<Fragment>` keeps that option available.
- Mixing shorthand fragments and `React.Fragment` scatters two patterns across the codebase, making refactors and searches harder.
- An explicit `Fragment` import keeps the dependency visible to bundlers and ensures auto-fixes do not leave `<Fragment>` undefined.

## Rule Details

- Prefer `<Fragment>...</Fragment>` from `import { Fragment } from 'react';`.
- Do not use shorthand fragments `<>...</>` or `React.Fragment`.
- The fixer will add the missing `Fragment` import when needed and replace fragment wrappers.

Examples of **incorrect** code for this rule:

```jsx
const Component = () => <>Hello World</>;

const Component = () => (
  <React.Fragment>
    <ChildComponent />
  </React.Fragment>
);
```

Examples of **correct** code for this rule:

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

## When Not To Use It

Skip this rule if your project intentionally mixes fragment styles for brevity and you accept losing fragment props like `key` on shorthand fragments.

## Version

This rule was introduced in v1.0.0

## Further Reading

- [React Fragments Documentation](https://reactjs.org/docs/fragments.html)
