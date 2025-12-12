# Discourage CSS properties that force GPU compositing layers (e.g., transform, filter, will-change) (`@blumintinc/blumint/no-compositing-layer-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Properties such as `transform`, `filter`, `will-change`, `backdrop-filter`, and
fractional `opacity` promote elements to their own GPU compositing layers. Each
layer allocates texture memory and requires separate rasterization; when
scattered across a page this increases memory pressure and can make scroll and
animation janky. The rule keeps layer promotion intentional in inline style
objects and MUI `sx` props by flagging properties and values known to trigger
GPU layers (including `translate3d`, `scale3d`, `translateZ`, and `transparent`).

## Rule Details

- Warns on style/sx objects and style-like variables; ignores TypeScript type
  declarations and non-style objects.
- Flags compositing properties (`transform`, `filter`, `backdrop-filter`,
  `will-change`, `perspective`, `backface-visibility`, `contain`,
  `mix-blend-mode`) and fractional `opacity` between 0 and 1.
- Flags values that imply GPU promotion even when the property itself is safe,
  such as `translate3d(...)`, `scale3d(...)`, `translateZ(...)`, or
  `transparent`.

### Examples of **incorrect** code for this rule:

```tsx
const style = {
  filter: 'brightness(110%)',
  transform: 'translate3d(0, 0, 0)',
};

<div
  sx={{
    opacity: 0.5,
    willChange: 'transform',
  }}
/>;
```

### Examples of **correct** code for this rule:

```tsx
const style = {
  backgroundColor: 'blue',
  transition: '0.2s ease-out all',
  opacity: 1,
};

const config = {
  transform: 'module-alias', // non-style config is ignored
};

<div sx={{ opacity: 1, marginTop: 8 }} />;
```

## Making an intentional exception

If you need a persistent compositing layer (e.g., to stabilize a specific
animation), keep the property and add an eslint-disable comment explaining the
reason so reviewers know the GPU cost is deliberate.
