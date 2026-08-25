# Prevent unnecessary use of React fragments (`@blumintinc/blumint/no-useless-fragment`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React fragments (`<>...</>`) are only used when necessary. A fragment is deemed unnecessary if it wraps only a single *meaningful* child.

Fragments exist to group multiple siblings without inserting an extra DOM element. When a fragment wraps a single child, it no longer provides grouping value—developers have to read past extra syntax and React DevTools shows an extra node that does not change the rendered output. Removing the fragment makes the returned tree easier to scan while keeping the UI identical.

## Rule Details

The rule counts a fragment's *meaningful* children, ignoring whitespace-only text that spans a newline — the indentation a formatter inserts around a single-line child in the standard multi-line form (`<>\n  <Foo />\n</>`). Whitespace without a newline (e.g. a single space) still renders and counts as a real child. A fragment is reported when exactly one meaningful child remains.

Two carve-outs keep the rule from flagging code where removing the fragment would be wrong or impossible:

* **A single expression-container child is exempt** (issue #1195), e.g. `<>{portal}</>` or `<>{"text"}</>`. Unwrapping it to a bare `{portal}` is invalid in return/statement position, and wrapping a single `ReactNode` expression in a fragment is the idiomatic way to render it.
* **A text or spread child is report-only (no autofix).** Unwrapping `<>hello</>` would turn the JSX text into a bare identifier reference, and `{...items}` is not a valid standalone expression — both require the developer to restructure the surrounding code by hand. A JSX element or fragment child auto-fixes by replacing the fragment with that child's source text.

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
<><ChildComponent /></>;
<><NestedComponent><ChildComponent /></NestedComponent></>;
<>
  <ChildComponent />
</>;
<>hello</>;
<>{...items}</>;
```

### Examples of **correct** code for this rule:

```jsx
<><ChildComponent /><AnotherChild /></>;
<><ChildComponent />Some Text<AnotherChild /></>;
<>{"text"}</>;
<>{portal}</>;
<ChildComponent />;
```
