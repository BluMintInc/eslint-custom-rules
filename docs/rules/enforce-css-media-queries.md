# Enforce CSS media queries over JS breakpoints (`@blumintinc/blumint/enforce-css-media-queries`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You keep responsive breakpoints in CSS instead of runtime JavaScript hooks. When you rely on JavaScript media detection (for example, `useMediaQuery` or `useMobile`), it attaches resize listeners inside React renders, which forces avoidable re-renders and introduces a second, drifting source of truth for breakpoints. CSS is already optimized for media evaluation, so letting styles own breakpoints keeps layout logic declarative and consistent.

## Rule Details

You get a report for any JavaScript-based viewport detection so that breakpoints live in CSS instead of the render path. The rule flags:
- `useMediaQuery` from `@mui/material`
- Any imports from `react-responsive`
- Any `useMobile` import or call (including `hooks/useMobile` paths and other sources)

### Capability and preference queries are exempt

A query that measures the viewport has a CSS remedy; a query that asks what the device or the user is capable of or prefers does not. No class name tells a component whether to mount, which `timeout` a transition prop carries, or which branch a hook takes, so the rule does not report a call whose query tests only capability and preference features.

Layout features — the rule keeps reporting these:

`width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`, `aspect-ratio` (and its `min-`/`max-` forms), `resolution` (and its `min-`/`max-` forms), the `device-*` variants of all of them, and every `theme.breakpoints.*` expression, which is a breakpoint by definition.

Capability and preference features — a query built only from these is exempt:

`hover`, `any-hover`, `pointer`, `any-pointer`, `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-data` (and any other `prefers-*` feature), `orientation`, `display-mode`, `forced-colors`, `inverted-colors`, `update`, `scripting`.

A mixed query is a breakpoint: `(hover: hover) and (min-width: 600px)` names a layout feature, so it reports.

The rule reads the query from a string literal, from a template literal with no interpolations, and from an in-file `const` binding holding either of those (an `as const` annotation is followed through). An argument it cannot resolve to a string — an imported constant, a function call, a template with interpolations, a reassignable `let` — reports, because nothing proves the query is free of layout. An unrecognized feature reports for the same reason.

### One report per usage

A single usage earns a single report, and therefore a single `eslint-disable` comment. When a file calls the imported hook, the report lands on the call: a breakpoint query reports at the call and the import stays silent, and a file whose every call is exempt gets no report at all, import included. An import with no call in the file — unused, re-exported, passed around as a value, or read under a name the rule does not track — has no call to carry the report, so the import keeps its own.

Why this matters:
- JavaScript breakpoint hooks attach listeners during render and trigger re-renders whenever the viewport changes, even if the component already has CSS that could handle the layout shift.
- Duplicating breakpoints in JavaScript and CSS creates divergence: a JS breakpoint can drift from design tokens, leading to layouts that disagree with the stylesheet.
- CSS media queries and container queries are evaluated by the browser’s rendering engine and avoid React work for viewport changes.

How to fix:
- Move breakpoint definitions into CSS `@media` rules or container queries.
- Let CSS class names or utility classes drive the responsive behavior, instead of conditional React renders based on viewport hooks.

### Examples of **incorrect** code for this rule:

```jsx
// Using Material-UI's useMediaQuery
import { useMediaQuery } from '@mui/material';

function Component() {
  const isSmallScreen = useMediaQuery('(max-width:600px)');
  return <div>{isSmallScreen ? 'Small screen' : 'Large screen'}</div>;
}
```

```jsx
// Using react-responsive
import { useMediaQuery } from 'react-responsive';

function Component() {
  const isMobile = useMediaQuery({ maxWidth: 767 });
  return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
}
```

```jsx
// Using custom useMobile hook
import { useMobile } from '../hooks/useMobile';

function Component() {
  const isMobile = useMobile();
  return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
}
```

```jsx
// Using custom useMobile hook with drift from CSS breakpoints
import { useMobile } from '../hooks/useMobile';

function Component() {
  const isMobile = useMobile();
  return <div className={isMobile ? 'stack' : 'inline'}>Content</div>;
}
```

```jsx
// A layout feature anywhere in the query makes it a breakpoint
import { useMediaQuery } from '@mui/material';

function Component() {
  const wideHover = useMediaQuery('(hover: hover) and (min-width: 600px)');
  return <div>{wideHover ? 'Desktop' : 'Compact'}</div>;
}
```

```jsx
// Breakpoint helpers are layout by definition
import { useMediaQuery, useTheme } from '@mui/material';

function Component() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('md'));
  return <div>{isSmall ? 'Small' : 'Large'}</div>;
}
```

```jsx
// A query the rule cannot resolve to a string is not provably free of layout
import { useMediaQuery } from '@mui/material';
import { MOBILE_QUERY } from '../styles/queries';

function Component() {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>;
}
```

### Examples of **correct** code for this rule:

```jsx
// Using CSS media queries
function Component() {
  return (
    <div className="responsive-container">
      Small screen
    </div>
  );
}
```

```css
/* In your CSS file */
@media (max-width: 600px) {
  .responsive-container {
    display: block;
  }
}

.inline {
  display: inline-flex;
  gap: 8px;
}

@media (max-width: 600px) {
  .stack {
    display: grid;
    gap: 8px;
  }
}
```

```jsx
// Capability probe: a class name cannot tell a hook whether the device hovers
import { useMediaQuery } from '@mui/material';

export const useHoverCapable = () =>
  useMediaQuery('(hover: hover) and (pointer: fine)');
```

```jsx
// Preference query gating JavaScript behavior, resolved through a const
import { useMediaQuery } from '@mui/material';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function Component() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  return <Fade timeout={reducedMotion ? 0 : 300}>Content</Fade>;
}
```

```jsx
// Orientation and color scheme describe the device and the user, not the layout
import { useMediaQuery } from '@mui/material';

function Component() {
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  return <Player rotate={isLandscape} mode={prefersDark ? 'dark' : 'light'} />;
}
```

## When Not To Use It

If your project heavily relies on JavaScript-based responsive design and you're not ready to migrate to CSS media queries, you might want to disable this rule temporarily.

## Further Reading

- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)
- [Material-UI useMediaQuery](https://mui.com/material-ui/react-use-media-query/)
