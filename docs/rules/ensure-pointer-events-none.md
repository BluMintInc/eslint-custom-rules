# Ensure pointer-events: none is added to non-interactive pseudo-elements (`@blumintinc/blumint/ensure-pointer-events-none`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule prevents decorative pseudo-elements that use absolute or fixed positioning from intercepting user interactions. Overlays applied with `::before` or `::after` can sit on top of buttons and links; without `pointer-events: none`, they absorb clicks, taps, hover, and focus feedback and make the underlying control feel broken or inaccessible. Add `pointer-events: none` so the pseudo-element stays visual only while the element underneath remains usable.

## What triggers a violation

- `::before` or `::after` styles that use `position: absolute` or `position: fixed` without defining `pointer-events`
- Styled-components or other CSS-in-JS templates that place pseudo-elements on top of content without disabling pointer events

## How to fix

- Set `pointer-events: none` (or `pointerEvents: 'none'` in JS objects) on positioned pseudo-elements that are meant to be decorative overlays
- If the overlay must remain interactive, set `pointer-events: auto` explicitly so the intent is clear

## Examples

### ❌ Incorrect

```
const styles = {
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
};
```

### ✅ Correct

```
const styles = {
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
};
```

### ✅ Styled-components example

```
const Overlay = styled.div`
  &::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
  }
`;
```
