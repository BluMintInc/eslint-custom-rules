# Enforce that only the outermost element in list rendering has a key prop (`@blumintinc/blumint/key-only-outermost-element`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Ensure each list item is keyed on the outermost element returned from `.map()` and that fragments used as list wrappers can hold a key.

## Rule Details

React uses the `key` on the element returned from `.map()` to track list items during reconciliation. When a nested child also receives a `key`, React can prioritize that child as the identity boundary, creating redundant identity slots that hide reorder/insert bugs and make component state jump between siblings. Likewise, shorthand fragments (`<>...</>`) cannot accept keys, so using them as the list wrapper leaves each item untracked.

This rule keeps the identity at the outermost element and forbids shorthand fragments as list wrappers so every list item has a stable, traceable key.

- Keep the `key` on the element you return directly from `.map()`.
- Remove `key` props from nested children unless they start their own independent list.
- Replace shorthand fragments with `<React.Fragment key={...}>` (or another keyed wrapper) when the outer wrapper needs to be a fragment.

### Examples

#### ❌ Incorrect

```jsx
{items.map((item) => (
  <div key={item.id}>
    <span key={`inner-${item.id}`}>{item.name}</span>
  </div>
))}

{items.map((item) => (
  <div key={item.id}>
    <h3 key={`title-${item.id}`}>{item.title}</h3>
  </div>
))}

{items.map((item) => (
  <>
    <div>{item.title}</div>
    <div>{item.description}</div>
  </>
))}
```

#### ✅ Correct

```jsx
{items.map((item) => (
  <div key={item.id}>
    <span>{item.name}</span>
  </div>
))}

{items.map((item) => (
  <React.Fragment key={item.id}>
    <div>{item.title}</div>
    <div>{item.description}</div>
  </React.Fragment>
))}

{items.map((item) => (
  <div key={item.id}>
    <h3>{item.title}</h3>
  </div>
))}
```

## What the fix removes

The fix deletes the `key` attribute together with the whitespace that separated
it from what precedes it, so no position in an attribute list leaves a stray
space behind: `<div key={k}>` becomes `<div>`, and `<div id="x" key={k} className="y">`
becomes `<div id="x" className="y">`.

Deleting a `key` also deletes the expression that computed it, which may have
been the last thing referencing an import. That import leaves in the SAME fix —
applying half of the pair would trade this rule's report for a
`no-unused-vars` error, and nothing would re-report the debt once the `key` is
gone.

```jsx
// before
import { uuidv4Base62 } from 'utils';

{items.map((item) => (
  <div key={item.id}>
    <span key={uuidv4Base62()}>{item.name}</span>
  </div>
))}

// after
{items.map((item) => (
  <div key={item.id}>
    <span>{item.name}</span>
  </div>
))}
```

Two nested keys that jointly hold one binding alive are removed by a single fix
for the same reason: neither may unbind it alone, and a fix may only count on the
other removal happening if it performs that removal itself.

The report always stands; only the fix is withheld when the removal would strand
a binding this rule must not rewrite — a `map` callback parameter read by nothing
else, a local helper, or an import whose declaration carries a comment among its
specifiers. Delete the `key` by hand in those cases and clean up whatever it
leaves behind.

## When Not To Use It

Disable this rule only if a nested child truly owns its own identity boundary independent of the list item (for example, when rendering another keyed list or portal inside). In most cases, keeping the key on the outermost element is safer and clearer for React’s reconciliation.

## Further Reading

- [React Lists and Keys](https://reactjs.org/docs/lists-and-keys.html)
- [React Reconciliation](https://reactjs.org/docs/reconciliation.html#keys)
