# Disallow the use of {" "} elements in JSX code (`@blumintinc/blumint/no-jsx-whitespace-literal`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Disallow whitespace-only JSX expressions like `{" "}` because they create invisible text nodes that make spacing fragile.

## Rule Details

A whitespace-only JSX expression renders an actual text node whose content is just spaces. These nodes seem harmless but often collapse or shift when:
- Formatters wrap JSX children differently
- Translators or copy updates move words across boundaries
- Conditionals reorder children at runtime

The result is missing or duplicated spacing in the UI, which is hard to trace back to the invisible spacer node.

The rule flags any `JSXExpressionContainer` whose expression is a string literal that trims to empty characters.

### Examples of **incorrect** code for this rule:

```tsx
<div>Hello,{" "}world!</div>
<Button>Click{" "}Me</Button>
<div>{showGreeting && "Hello"}{" "}{username}</div>
<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}{" "}</div>
```

### Examples of **correct** code for this rule:

```tsx
// Put spacing inside the surrounding text
<div>Hello, world!</div>
<Button>Click Me</Button>
<div>{showGreeting && "Hello "}{username}</div>

// Use layout spacing instead of text nodes
<div className="flex gap-2">{items.map((item) => <span key={item.id}>{item.name}</span>)}</div>
```

## Why this matters

- Invisible spacer nodes depend on child ordering and can disappear when JSX is reformatted.
- Translators moving words across languages often break the spacer placement, causing words to run together.
- Layout spacing belongs in CSS (gap, margin, padding), which keeps presentation concerns out of the render tree and survives reordering.

## How to fix

- Move the space into the adjacent text (e.g., `"Hello "`).
- Prefer CSS-based spacing such as `gap`, `margin`, or `padding`.
- When spacing must be textual, include it inside a real text node, not a standalone whitespace literal.
