# Disallow the use of {" "} elements in JSX code (`@blumintinc/blumint/no-jsx-whitespace-literal`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You should avoid whitespace-only JSX expressions like `{"  "}` because React renders them as separate text children that make spacing fragile.

## Rule Details

A whitespace-only JSX expression renders an actual text child whose content is only whitespace. React can move, drop, or duplicate that child when:

- Formatters wrap JSX children differently
- Translators or copy updates move words across boundaries
- Conditionals reorder or dynamically render children at runtime

The result is missing or duplicated spacing in the UI, which is difficult to trace back to the invisible spacer child.

This rule flags a JSX **child** expression whose string literal contains only whitespace (it trims to an empty string), with one carve-out for the formatter's own output described below.

### Attribute values are not children

The rule's subject is a container between an element's tags — the only position that renders a text node. An attribute value such as `alt={''}` or `title={' '}` is a prop: React hands the string to the element untouched, no spacer node exists to shift or duplicate, and `alt={''}` is the accessibility idiom for a decorative image. The remedy this rule offers — move the space into the adjacent text — has no meaning for a prop, so whitespace-only attribute values are never reported, whatever the literal holds.

### The prettier carve-out

JSX discards the whitespace around a line break, so a space that must survive one cannot be written literally. When a JSX line carrying a meaningful space wraps past the print width, prettier's canonical encoding of that space is `{' '}` closing the line — or, for a leading space, `{' '}` alone on its own line.

Both spellings are prettier **fixed points**. This rule ships no autofix, so reporting them would be an unactionable failure: folding the space into the adjacent text is exactly the edit the next format reverts, leaving an inline disable as the only escape. The rule therefore exempts a child container that

1. holds exactly **one** space, and
2. **closes its line** — nothing but whitespace follows it on that line.

Every other whitespace-only child container stays reported. Prettier folds a mid-line single-space container back into the surrounding text rather than preserving it, so a container with source after it on its own line is one the formatter would have erased: a hand-written spacer, which is what this rule is about. Prettier likewise leaves `{'  '}`, `{'\t'}`, `{'\n'}` and `{''}` exactly where their author put them, at any column, so those are hand-written wherever they appear — including at the end of a line.

### Examples of **incorrect** code for this rule:

A multi-space spacer. Prettier preserves it and may park it at the end of a line, but it is the author's text, not the formatter's encoding:

```tsx
<div>
  Total:{'  '}
  {amount}
</div>
```

A tab or newline used as a separator:

```tsx
<div>
  {label}
  {'\t'}
  {value}
</div>
```

An empty string container, which still renders a text child:

```tsx
<Typography>{''}</Typography>
```

A hand-written single-space spacer that has source after it on the same line:

```tsx
<div>Hello,{" "}world!</div>
```

```tsx
<div>
  <Icon />{" "}<Label />
</div>
```

### Examples of **correct** code for this rule:

Put the spacing inside the surrounding text:

```tsx
<div>Hello, world!</div>
```

```tsx
<div>{showGreeting && "Hello "}{username}</div>
```

Use a non-breaking space when the space itself is content:

```tsx
<div>Hello,&nbsp;world!</div>
```

Use layout spacing instead of text nodes:

```tsx
<div className="flex gap-2">{items.map((item) => <span key={item.id}>{item.name}</span>)}</div>
```

A whitespace-only or empty attribute value is a prop, not a spacer child:

```tsx
const Decorative = () => <img alt={''} src="/x.png" />;
```

Prettier's line-break encoding of a significant space is accepted as written, because no edit both keeps the space and survives the formatter:

```tsx
const App = () => (
  <div>
    <SomeFairlyLongComponentName /> and then some more text here{' '}
    <AnotherComponentName />
  </div>
);
```

The same encoding for a leading space, which prettier parks on its own line:

```tsx
const App = () => (
  <div>
    {' '}
    <CompWord />
  </div>
);
```

## Why this matters

- Invisible spacer nodes depend on child ordering and can disappear when JSX is reformatted.
- Translators moving words across languages often break the spacer placement, causing words to run together.
- Layout spacing belongs in CSS (gap, margin, padding), which keeps presentation concerns out of the render tree and survives reordering.

## How to fix

- Move the space into the adjacent text (e.g., `"Hello "`).
- Prefer CSS-based spacing such as `gap`, `margin`, or `padding`.
- When the space itself is content, use `&nbsp;` so it is a real character rather than a separate whitespace child.
- When spacing must be textual, include it inside a real text node, not a standalone whitespace literal.

## When Not To Use It

Source that is not formatted by prettier gets less from this rule than it looks: prettier erases a hand-written single-space spacer outright, so in a prettier-formatted repository the shapes that survive to be linted are the multi-space, tab, newline and empty-string containers above.
