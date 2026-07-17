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

- Pseudo-elements that already specify `pointer-events`.
- Explicit `pointer-events: auto` for intentionally interactive pseudo-elements.
- Non-pseudo-element styles.
- Hit-slop touch-target extensions (see [Exceptions](#exceptions)).

## Exceptions

### Hit-slop touch-target extensions

A pseudo-element whose inset offsets only **extend beyond** the origin element's box is a hit-slop overlay that enlarges the tappable area of the control it decorates. Because a browser attributes pointer events on a pseudo-element to its **origin element** (the control itself), such an overlay cannot occlude anything — the rule's rationale ("positioned overlays capture clicks, blocking the underlying control") does not apply. Adding `pointer-events: none` here would silently **shrink** the tap target, the exact accessibility regression this rule exists to prevent.

The rule treats an object-literal pseudo-element style as a hit-slop extension (and does **not** flag it) when all of the following hold:

- it sets `position: 'absolute'` or `'fixed'`, and
- at least one of the inset offsets `top`/`right`/`bottom`/`left` is a clearly-negative length, and
- none of the parseable inset offsets is positive (zero and negative are allowed).

This distinguishes a hit-slop (extends outward) from a full-cover overlay such as `{ top: 0, right: 0, bottom: 0, left: 0 }` (all zero → still flagged) or an inward positive-offset overlay (still flagged).

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
```

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
