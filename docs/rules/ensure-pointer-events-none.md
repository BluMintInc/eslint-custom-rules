# Ensure pointer-events: none is added to non-interactive pseudo-elements (`@blumintinc/blumint/ensure-pointer-events-none`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Absolutely or fixed-positioned pseudo-elements (`::before`/`::after`) can block clicks and hovers on the elements they decorate. This rule ensures those pseudo-elements explicitly set `pointer-events: none` so decorations never intercept user input.

## Rule Details

This rule reports when:

- Plain CSS, styled-components, or emotion templates define `::before` or `::after` with `position: absolute` or `position: fixed` and omit `pointer-events: none`.
- A CSS-in-JS object for a pseudo-selector (e.g., `{ '&::before': { ... } }`) has absolute/fixed positioning without `pointerEvents: 'none'`.
- A JSX `style={{ ... }}` object represents a pseudo-element style (via nested selector keys) and lacks `pointerEvents: 'none'`.

The rule allows:

- Pseudo-elements that already specify `pointer-events` with a statically readable value.
- Explicit `pointer-events: auto` for intentionally interactive pseudo-elements.
- Non-pseudo-element styles.
- Hit-slop touch-target extensions (see [Exceptions](#exceptions)).

### Notation

A selector, a property name, and a property value are read as the static string they denote, whichever notation spells it: `` position: `absolute` `` is the same declaration as `position: 'absolute'`, and `` [`pointerEvents`]: 'none' `` is the same exemption as `pointerEvents: 'none'`. Detection and the `pointerEvents` exemption read through the same accessor, so a template-literal exemption is honored rather than given a second `pointerEvents` key by the fixer.

A template with a substitution — `` position: `${POSITION}` `` — is not known statically, so the rule stays silent on it (the one exception is a hit-slop offset, whose leading literal `-` states its direction; see [Exceptions](#exceptions)).

### Type assertions are transparent

An expression assertion states a type about the expression it wraps and contributes no value of its own, so all four spellings — `'none' as const`, `'none' satisfies string`, `('none')!`, and `<const>'none'` — denote the same string as `'none'`, and chains of them peel fully. Every selector, property name, property value, and inset offset is read through the assertion, so the verdict never turns on which type syntax an author reached for: `pointerEvents: 'none' as const` is honored as the exemption it is, `position: 'absolute' as const` is detected as absolute positioning, and `top: '-6px' as const` still counts toward the hit-slop carve-out.

An assertion around a value that is *not* statically readable does not make it readable. `pointerEvents: theme.overlay!` reads exactly as `pointerEvents: theme.overlay` does — the expression underneath decides.

### An unreadable `pointerEvents` value reports without a fix

A pseudo-element may already declare `pointerEvents` with a value the rule cannot read: `pointerEvents: theme.overlay`, a call, a ternary such as `isDecorative ? 'none' : 'auto'`, or an interpolated template (with or without an assertion around it). The rule still **reports** there — it cannot prove the value is `none`, and an overlay left at `auto` is exactly what the rule exists to catch — but it does **not** autofix. Its only remedy is to append a `pointerEvents` key, and the object already declares one; an object literal with two identical keys does not compile (TS1117). A report with no fix is the correct outcome: a fixer that cannot prove its output is correct emits nothing.

Resolve such a report by hand — write the value the overlay actually needs (`pointerEvents: 'none'`), or set `pointerEvents: 'auto'` to record that it is deliberately interactive.

### The autofix writes the property in the object's own layout

The fix adds `pointerEvents: 'none'` to the pseudo-element's style object, and where it writes the property follows the layout already there. A formatter owns that layout: a fix it has to re-lay-out lands non-canonical source in the repo before a human reads the report, and surfaces as unexplained formatting churn in the next diff.

An object written one property per line gets the new property on a line of its own, at the column its siblings occupy. That column is read from the siblings, so a four-space file gets four spaces and a tab-indented file gets a tab.

```ts
// before
const style = {
  '&::before': {
    position: 'absolute',
  },
};
```

```ts
// after --fix
const style = {
  '&::before': {
    position: 'absolute',
    pointerEvents: 'none',
  },
};
```

An object genuinely written on one line keeps both properties there, for as long as the result fits inside [`printWidth`](#printwidth) — that is where a formatter leaves it.

```ts
// before
const style = {
  '&::after': { content: '""', position: 'fixed' },
};
```

```ts
// after --fix
const style = {
  '&::after': { content: '""', position: 'fixed', pointerEvents: 'none' },
};
```

Past that width the one-line form is no longer a layout a formatter would keep, so the object is written one property per line instead — which is what the formatter would otherwise do to the appended line.

```ts
// before
const style = {
  '&::before': { content: '""', position: 'absolute', width: '100%', top: 0 },
};
```

```ts
// after --fix
const style = {
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '100%',
    top: 0,
    pointerEvents: 'none',
  },
};
```

Two shapes keep the appended-in-place form at every width, because re-laying them out would cost more than the churn it saves: an object holding a comment, which has no unambiguous home once the properties are spread over several lines, and an object whose container opens on the same line (`const style = { '&::before': { ... } };`), which cannot keep its own layout once the object inside it breaks.

A comment trailing the last property stays with the property it documents: the new property goes after the comment, and the comma the insertion needs goes before it.

```ts
// after --fix
const style = {
  '&::before': {
    position: 'absolute', // anchored to the tile
    pointerEvents: 'none',
  },
};
```

## Options

### `printWidth`

The column the autofix lays out against, defaulting to `80` — Prettier's own default, and the width of a project that has never configured one. Set it to the width your formatter uses:

```json
{
  "rules": {
    "@blumintinc/blumint/ensure-pointer-events-none": [
      "error",
      { "printWidth": 120 }
    ]
  }
}
```

It moves one boundary, in both directions: the width past which a one-line style object is written out one property per line rather than taking the new property inline. At `120`, an object whose appended line measures 101 columns keeps that line; at `40`, one measuring 74 columns is written out instead. It changes nothing else — no width silences a report, and an object already written one property per line is fixed identically at every width.

The width is measured over the code on the line, with any comment the line carries masked out. A comment carries no semantics, so counting its characters would let the same object fix one way bare and another way with a comment trailing it.

## Exceptions

### Hit-slop touch-target extensions

A pseudo-element whose inset offsets only **extend beyond** the origin element's box is a hit-slop overlay that enlarges the tappable area of the control it decorates. Because a browser attributes pointer events on a pseudo-element to its **origin element** (the control itself), such an overlay cannot occlude anything — the rule's rationale ("positioned overlays capture clicks, blocking the underlying control") does not apply. Adding `pointer-events: none` here would silently **shrink** the tap target, the exact accessibility regression this rule exists to prevent.

The rule treats an object-literal pseudo-element style as a hit-slop extension (and does **not** flag it) when all of the following hold:

- it sets `position: 'absolute'` or `'fixed'`, and
- at least one inset offset is a clearly-negative length, and
- none of the parseable inset offsets is positive (zero and negative are allowed).

The inset offsets are the longhands `top`/`right`/`bottom`/`left`, the `inset` shorthand, and the logical spellings `insetInline`/`insetBlock`. A shorthand carries up to four space-separated lengths, and each component is classified separately: a positive component anywhere outranks a negative one, because it pulls an edge inside the origin box where the overlay can occlude the control. So the verdict does not depend on whether an overlay is spelled longhand or shorthand.

An offset derived from a named constant — `` inset: `-${HIT_SLOP}px` `` — counts as negative because the leading literal `-` states the direction whatever the interpolation resolves to (an interpolated negative would render `--8px`, which is not a valid length). Any other interpolation, such as `` inset: `${SIZE}px` ``, stays opaque and earns no exemption.

This distinguishes a hit-slop (extends outward) from a full-cover overlay such as `{ top: 0, right: 0, bottom: 0, left: 0 }` or `{ inset: 0 }` (all zero → still flagged) or an inward positive-offset overlay (still flagged).

```tsx
// Not flagged: hit-slop extends the button's tappable area outward
const buttonStyles = {
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-6px',
    bottom: '-6px',
    left: 0,
    right: 0,
  },
};

// Not flagged: the same overlay written with the shorthand
const HIT_SLOP = 8;
const iconButtonStyles = {
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: `-${HIT_SLOP}px`,
  },
};
```

A full-cover overlay that is *deliberately* interactive — the Bootstrap-style stretched link, `{ position: 'absolute', inset: 0 }` — is indistinguishable from a decorative full-cover overlay, so it stays flagged. Set `pointerEvents: 'auto'` or disable the rule inline at that site to record the intent.

If a positioned pseudo-element is genuinely interactive for another reason, the `pointerEvents: 'auto'` opt-out remains available and documents that intent explicitly.

## How to fix

- Set `pointer-events: none` (or `pointerEvents: 'none'` in JS objects) on positioned pseudo-elements that are meant to be decorative overlays.
- If the overlay must remain interactive, set `pointer-events: auto` explicitly so the intent is clear.

### Examples of **incorrect** code for this rule:

```tsx
// styled-components
const Wrapper = styled.div`
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--glow);
  }
`;

// CSS-in-JS object
const styles = {
  '&::after': {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.3)',
  },
};
```

### Examples of **correct** code for this rule:

```tsx
const Wrapper = styled.div`
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--glow);
  }
`;

const styles = {
  '&::after': {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    background: 'rgba(0,0,0,0.3)',
  },
};
```

### Styled-components overlay example

```tsx
const Overlay = styled.div`
  &::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
  }
`;
```

## When Not To Use It

- Pseudo-elements that are intentionally interactive (e.g., custom tooltip hit targets). Add `pointer-events: auto` and disable the rule locally if needed.
- Projects that do not use CSS-in-JS or pseudo-elements with absolute/fixed positioning.

## Further Reading

- [MDN: `pointer-events` CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events)
