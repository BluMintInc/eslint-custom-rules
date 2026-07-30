# Disallow the use of {" "} elements in JSX code (`@blumintinc/blumint/no-jsx-whitespace-literal`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You should avoid whitespace-only JSX expressions like `{" "}` because React renders them as separate text children that make spacing fragile.

## Rule Details

A whitespace-only JSX expression renders an actual text child whose content is only spaces. React can move, drop, or duplicate that child when:
- Formatters wrap JSX children differently
- Translators or copy updates move words across boundaries
- Conditionals reorder or dynamically render children at runtime

The result is missing or duplicated spacing in the UI, which is difficult to trace back to the invisible spacer child.

This rule flags JSX expressions like `{" "}` where the string literal contains only whitespace (it trims to an empty string).

### Examples of **incorrect** code for this rule:

A spacer between two words:

```tsx
<div>Hello,{" "}world!</div>
```

```tsx
<Button>Click{" "}Me</Button>
```

A spacer between expression children:

```tsx
<div>{showGreeting && "Hello"}{" "}{username}</div>
```

A trailing spacer after a mapped list:

```tsx
<div>{items.map((item) => <span key={item.id}>{item.name}</span>)}{" "}</div>
```

### Examples of **correct** code for this rule:

Put spacing inside the surrounding text:

```tsx
<div>Hello, world!</div>
```

```tsx
<Button>Click Me</Button>
```

```tsx
<div>{showGreeting && "Hello "}{username}</div>
```

Use layout spacing instead of text nodes:

```tsx
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
