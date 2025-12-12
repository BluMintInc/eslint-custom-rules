# Ensure pointer-events: none is added to non-interactive pseudo-elements (`@blumintinc/blumint/ensure-pointer-events-none`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Absolutely or fixed-positioned pseudo-elements (`::before`/`::after`) can block clicks and hovers on the elements they decorate. This rule ensures those pseudo-elements explicitly set `pointer-events: none` so decorations never intercept user input.

## Rule Details

This rule reports when:

- A styled-components/emotion template defines `::before` or `::after` with `position: absolute` or `position: fixed` and omits `pointer-events: none`.
- A CSS-in-JS object for a pseudo-selector (e.g., `{ '&::before': { ... } }`) has absolute/fixed positioning without `pointerEvents: 'none'`.
- A JSX `style={{ ... }}` object represents a pseudo-element style (via nested selector keys) and lacks `pointerEvents: 'none'`.

The rule allows:

- Pseudo-elements that already specify `pointer-events`.
- Explicit `pointer-events: auto` for intentionally interactive pseudo-elements.
- Non-pseudo-element styles.

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

## Options

This rule does not have any options.

## When Not To Use It

- Pseudo-elements that are intentionally interactive (e.g., custom tooltip hit targets). Add `pointer-events: auto` and disable the rule locally if needed.
- Projects that do not use CSS-in-JS or pseudo-elements with absolute/fixed positioning.

## Further Reading

- [MDN: `pointer-events` CSS property](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events)
