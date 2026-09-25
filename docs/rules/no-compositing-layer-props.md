# Discourage CSS properties that force GPU compositing layers (e.g., transform, filter, will-change). Extra layers consume GPU memory and split rendering work, which slows scrolling and animation when sprinkled across a page. The rule inspects inline style objects and MUI sx props so layer promotion stays intentional rather than incidental (`@blumintinc/blumint/no-compositing-layer-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Properties such as `transform`, `filter`, `will-change`, `backdrop-filter`, and
fractional `opacity` promote elements to their own GPU compositing layers. Each
layer allocates texture memory and requires separate rasterization; when
scattered across a page this increases memory pressure and can make scroll and
animation janky. One layer per row of a long list is the failure this rule
exists to prevent. The rule keeps layer promotion intentional in inline style
objects and MUI `sx` props by flagging properties and values known to trigger
GPU layers (including `translate3d`, `scale3d`, and `translateZ`).

Animate `opacity` and `transform`, never `width`, `height`, `top` or `left`.
Put the change under an interaction state (`&:hover`, `&:active`,
`&:focus-visible`), or drive a state-dependent value with a `transition`. This
rule exempts both, because neither can promote a whole list at once. A
transform or fractional opacity at rest, any 3D transform, `will-change`,
`filter`, `backdrop-filter` and `mix-blend-mode` still fire, because on a
component repeated in a list each one costs a GPU layer per row. Brighten on
hover with a lighter color, never `filter: brightness()`.

## Rule Details

- Warns on style/sx objects and style-like variables; ignores TypeScript type
  declarations and non-style objects.
- Flags compositing properties (`transform`, `scale`, `rotate`, `translate`,
  `filter`, `backdrop-filter`, `will-change`, `perspective`,
  `backface-visibility`, `contain`, `mix-blend-mode`) and fractional `opacity`
  between 0 and 1.
- Flags values that imply GPU promotion even when the property itself is not in
  the list above: 3D transform functions (`translate3d(...)`, `translateZ(...)`,
  `scale3d(...)`, `scaleZ(...)`, `rotate3d(...)`, `rotateX(...)`,
  `rotateY(...)`, `rotateZ(...)`, `matrix3d(...)`, `perspective(...)`), but only
  under a key that is a CSS property whose value grammar accepts that value. A
  transform function only promotes a layer through `transform`, so that is the
  only key the value arm accepts, including vendor-prefixed spellings such as
  `WebkitTransform` or `'-webkit-transform'`. A key that is not a CSS property
  in any spelling (`spotFill`, `desktop`, `mobile`) is never reported as one.
- Does not flag `transparent`. A transparent paint allocates no texture and
  promotes no compositing layer, under a color property or anywhere else.
- Exempts compositing properties declared inside a `@keyframes` block. Animating
  `transform` and `opacity` via `@keyframes` is the web-standard,
  GPU-accelerated animation pattern, not a gratuitous static layer. The
  exemption is scoped to descendants of the `@keyframes` value object, so a
  static compositing prop sitting as a *sibling* of the `@keyframes` key is
  still flagged.
- Exempts the reset/identity value of each compositing property, which provably
  promotes nothing: `none` for `transform`, `scale`, `rotate`, `translate`,
  `filter`, `backdrop-filter`, `contain` and `perspective`; `1` for `scale`;
  `auto`/`unset`/`initial`/`inherit`/`revert` for `will-change`; `visible` for
  `backface-visibility`; and `normal` for `mix-blend-mode`. Since
  `mix-blend-mode` is not inherited, `initial`/`unset`/`revert` resolve to
  `normal` and are exempt too, but `inherit` is still flagged because it can
  resolve to a blending value set higher up.

### Interaction states (`exemptInteractionStates`)

A 2D `transform`, `scale`, `rotate` or `translate`, or a fractional `opacity`,
is exempt when every comma-separated member of the selector above it carries a
singular interaction state on the styled element's own `&` compound or to its
right: `:hover`, `:active`, `:focus`, `:focus-visible`, `:focus-within`,
`.Mui-focusVisible`, `.Mui-focused` or `.Mui-active`. No transition is
needed, and the exemption applies inside `.map` callbacks too.

- A singular state matches one element per pointer or focus however many
  siblings share the style, so it can never promote a whole list at once.
- `@media`, `@supports`, `@container` and MUI breakpoint keys
  (`[theme.breakpoints.up('md')]`) are skipped when finding the selector.
- Nested selector keys compose the way emotion composes them, so
  `'&:hover': { '& .icon': { ... } }` reads as `&:hover .icon`, and a key
  opening with `:` (`':hover'`) attaches to the styled element.
- A state only to the left of `&` never qualifies: `.MuiList-root:hover &`
  matches every child of the hovered list at once.
- A negated state never qualifies: `&:not(:hover)` matches every element that
  is not hovered.
- One unqualified member disqualifies the list: `'&:hover, & .label'` applies
  the value to `.label` at rest.
- Known limit: `'&:hover .row': { transform }` written on a list *container*
  moves every row while the container is hovered. The rule cannot tell a
  container from a card, and the shape is rare.

### State-driven values with a transition (`exemptStateTransitions`)

A 2D `transform`, `scale`, `rotate` or `translate`, or a fractional `opacity`,
is also exempt when all three of these hold:

1. **The value is state-driven**: a non-literal value
   (`isOpen ? 'rotate(180deg)' : 'none'`, a template literal with a
   substitution, a variable), an object reached through a conditional
   (`...(isOpen && { opacity: 0.5 })`, `sx={[base, isOpen && { ... }]}`), or a
   key under a state selector on the `&` compound or to its right: a MUI state
   class (`&.Mui-checked`, `&.Mui-expanded`), a state pseudo-class
   (`&:checked`, `&:disabled`, or any interaction state above), or a state
   attribute (`&[aria-expanded="true"]`, `&[data-state="open"]`). A
   responsive object or array (`{ xs: 'none', md: 'scale(1.05)' }`) varies by
   breakpoint rather than by state, so it counts only when every entry is
   state-driven or a reset.
2. **A transition covers the property**: a `transition` or
   `transitionProperty` in the same object, an ancestor object, or a sibling
   entry of an `sx` array names the property or `all`, or is an expression the
   rule cannot read (`theme.transitions.create('transform')`,
   `createTransition(...)`). A shorthand item naming no property animates
   `all`, `none` covers nothing, and a conditional transition
   (`isDragging ? 'none' : TRANSITIONS.transform`) covers when either branch
   does. `transform` and the individual `scale`/`rotate`/`translate`
   properties are separate animatable properties, so a `transform` transition
   does not cover `scale`.
3. **No enclosing function is a lexical iteration callback**: a `.map`,
   `.flatMap`, `.forEach` or `Array.from` callback, or a `render*`,
   `itemContent` or `*Renderer` render prop. Every rendered sibling can be "on"
   at once there, so the exemption is withheld.

A CSS transition never runs on first paint, so a state-driven value promotes
only the element whose state flipped, and only while it animates. The rule
reads one file, so it cannot see a component that another file renders in a
list; a mass toggle across such rows runs their transitions together. If that
ever tears, switch this arm off with `exemptStateTransitions: false`.

### Never exempt

`filter`, `backdrop-filter`, `will-change`, `mix-blend-mode`, `perspective`,
`backface-visibility` and `contain` are reported in every context, including
under `:hover`. So is any 3D transform (a 3D transform function, a third
`translate`/`scale` component, or a `rotate` axis) and any `transform` or
fractional `opacity` at rest: a literal that no state or transition qualifies.

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

// A transform at rest stays reported even beside a transition.
<Box sx={{ transform: 'rotate(45deg)', transition: 'transform 200ms' }} />;

// An ancestor hover moves every child of the list at once.
<Box sx={{ '.MuiList-root:hover &': { transform: 'translateX(4px)' } }} />;

// A hover brighten is a lighter color, never a filter.
<Box sx={{ '&:hover': { filter: 'brightness(1.1)' } }} />;

// Inside a .map callback every row can be toggled at once.
rows.map((row) => (
  <Box
    key={row.id}
    sx={{
      transform: row.isOpen ? 'rotate(180deg)' : 'none',
      transition: 'transform 200ms',
    }}
  />
));
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

// Reset/identity values promote nothing, so they are not flagged.
const reset = {
  transform: 'none',
  scale: 1,
  willChange: 'auto',
  mixBlendMode: 'normal',
};

// Animating transform/opacity inside @keyframes is the recommended pattern.
<Box
  sx={{
    animation: 'spin 1s linear infinite',
    '@keyframes spin': {
      '0%': { transform: 'rotate(0deg)' },
      '100%': { transform: 'rotate(360deg)' },
    },
  }}
/>;

// A hover lift and a press: one element at a time.
<Box
  sx={{
    transition: 'transform 150ms',
    '&:hover': { transform: 'translateY(-2px)' },
    '&:active': { scale: 0.98 },
  }}
/>;

// A state-driven chevron paired with a transition that covers it.
const Chevron = ({ isOpen }) => (
  <Box
    sx={{
      transform: isOpen ? 'rotate(180deg)' : 'none',
      transition: 'transform 200ms',
    }}
  />
);

// A MUI state class with the transition in an ancestor object.
<Box
  sx={{
    transition: 'transform 150ms',
    '&.Mui-expanded': { transform: 'rotate(180deg)' },
  }}
/>;

// A transparent paint promotes no layer, so it is not flagged.
const overlay = {
  backgroundColor: 'transparent',
  borderColor: 'transparent',
};

// A data record keyed by names that are not CSS properties is left alone; a key
// is only ever reported when it names a CSS property.
export const TOUR_VARIANT_STYLES = {
  tour: {
    spotFill: 'transparent',
    spotShade: { desktop: '#0009', mobile: '#000c' },
  },
};
```

## Options

This rule accepts an options object with the following properties, both
defaulting to `true`:

```ts
{
  "exemptInteractionStates": boolean,
  "exemptStateTransitions": boolean
}
```

### `exemptInteractionStates`

When `true`, a 2D transform or fractional opacity under a singular interaction
state (`&:hover`, `&:active`, `&:focus-visible`) is not reported. Set it to
`false` to report every such declaration.

### `exemptStateTransitions`

When `true`, a state-driven 2D transform or fractional opacity paired with a
covering `transition`, outside any lexical iteration callback, is not reported.
If toggled transforms tear during scroll, set it to `false` to report them
again with no other change.

```json
{
  "rules": {
    "@blumintinc/blumint/no-compositing-layer-props": [
      "error",
      { "exemptStateTransitions": false }
    ]
  }
}
```

## Making an intentional exception

If you need a persistent compositing layer (e.g., to stabilize a specific
animation), keep the property and add an eslint-disable comment explaining the
reason so reviewers know the GPU cost is deliberate. Before reaching for one,
check whether the effect can be written as a `transform` or `opacity` change
under an interaction state, or as a state-driven value paired with a
`transition`: both are exempt, so neither needs a disable.
