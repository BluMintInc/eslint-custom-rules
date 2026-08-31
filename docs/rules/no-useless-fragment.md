# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React fragments are only used when necessary. A fragment is deemed unnecessary if it wraps only a single *meaningful* child. All three spellings denote the same node and are treated identically: the shorthand `<>...</>`, the long form `<Fragment>...</Fragment>`, and `<React.Fragment>...</React.Fragment>`.

Fragments exist to group multiple siblings without inserting an extra DOM element. When a fragment wraps a single child, it no longer provides grouping value—developers have to read past extra syntax and React DevTools shows an extra node that does not change the rendered output. Removing the fragment makes the returned tree easier to scan while keeping the UI identical.

## Rule Details

The rule counts a fragment's *meaningful* children, ignoring whitespace-only text that spans a newline — the indentation a formatter inserts around a single-line child in the standard multi-line form (`<>\n  <Foo />\n</>`). Whitespace without a newline (e.g. a single space) still renders and counts as a real child. A fragment is reported when exactly one meaningful child remains.

Two carve-outs keep the rule from flagging code where removing the fragment would be wrong or impossible:

* **A single expression-container child is exempt** (issue #1195), e.g. `<>{portal}</>` or `<>{"text"}</>`. Unwrapping it to a bare `{portal}` is invalid in return/statement position, and wrapping a single `ReactNode` expression in a fragment is the idiomatic way to render it.
* **A text or spread child is report-only (no autofix).** Unwrapping `<>hello</>` would turn the JSX text into a bare identifier reference, and `{...items}` is not a valid standalone expression — both require the developer to restructure the surrounding code by hand. A JSX element or fragment child auto-fixes by replacing the fragment with that child's source text.

Two further conditions decide whether a long-form element *is* a fragment at all:

* **A fragment carrying any attribute is never reported.** `<Fragment key={k}><Child /></Fragment>` is meaningful: the `key` positions the fragment among its siblings, the shorthand cannot express it, and unwrapping would have to drop the attribute or move it onto the promoted child. (The shorthand admits no attributes, so this applies only to the long forms.)
* **A bare `<Fragment>` counts only when the name binds react's `Fragment` import.** The binding is resolved from the element's own scope, so a locally declared `Fragment` component, an import from another module, a default/namespace/type-only import, an alias (`import { Fragment as F }`), and an unresolved name all render something else and are left alone. `<React.Fragment>` is recognized by its member-access spelling, matching `prefer-fragment-shorthand` and `prefer-fragment-component`.

The autofix takes the import the unwrap leaves behind with it. Removing a `<Fragment>` deletes the only thing naming react's `Fragment`, and an import bound to nothing fails `no-unused-vars` — so the fix that strips the last use strips the specifier too, keeping the rest of the declaration (`import React, { Fragment }` becomes `import React`). Fragments that jointly hold the import alive are unwrapped by a single fix rather than by one fix each, because a fix may only count on another unwrap happening if it performs that unwrap itself; ESLint can discard any sibling report. When the import cannot be dropped safely — it sits behind a directive comment, or the name still occurs somewhere the fix does not delete — the fix is withheld and the report stands on its own.

When the fragment and its child span multiple lines, the autofix re-indents the promoted subtree by the removed indentation step so the output sits at its new depth (matching what prettier would produce) instead of keeping the columns it had inside the fragment. Lines that begin inside a multi-line template literal, a backslash-continued string, or a block comment are content rather than layout, so the fix leaves them byte-identical.

```jsx
// before
<>
  <NestedComponent>
    <ChildComponent />
  </NestedComponent>
</>;

// after --fix
<NestedComponent>
  <ChildComponent />
</NestedComponent>;
```

### Examples of **incorrect** code for this rule:

```jsx
import { Fragment } from 'react';

<><ChildComponent /></>;
<><NestedComponent><ChildComponent /></NestedComponent></>;
<>
  <ChildComponent />
</>;
<>hello</>;
<>{...items}</>;
<Fragment><ChildComponent /></Fragment>;
<React.Fragment><ChildComponent /></React.Fragment>;
<Fragment>
  <ChildComponent />
</Fragment>;
```

### Examples of **correct** code for this rule:

```jsx
import { Fragment } from 'react';

<><ChildComponent /><AnotherChild /></>;
<><ChildComponent />Some Text<AnotherChild /></>;
<>{"text"}</>;
<>{portal}</>;
<ChildComponent />;
<Fragment><ChildComponent /><AnotherChild /></Fragment>;
<React.Fragment>{portal}</React.Fragment>;
<Fragment key={k}><ChildComponent /></Fragment>;
```
