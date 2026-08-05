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

### Breakpoints that never reach a style are exempt

The same principle reaches a second axis. A hook such as `useMobile` carries no query at all, so nothing about its argument can prove it free of layout — but its *result* can. When the value a media hook returns never reaches a style, the prescribed fix does not exist: no `@media` rule and no class name can select a Popover's `anchorOrigin`, a Snackbar's anchor position, or a transition's `timeout`.

The rule therefore traces the value from the call to the places it is consumed and exempts the call only when every one of them is a destination CSS cannot express. These are the style destinations — a value reaching any of them keeps reporting, wherever it also goes:

`sx`, `style`, `className`, `classes`, `css` — as a JSX attribute (`sx={{ ... }}`, ``className={`panel ${…}`}``) or as an object property (`const props = { sx: { … } }`).

The trace follows conditionals, template literals, objects and arrays the value is nested in, spreads, `as const`, and any number of intermediate `const` bindings. Everything else is unresolved and therefore reported, because an unseen destination may well be a stylesheet:

- a value returned from the component or hook, or exported;
- a value assigned to a binding declared outside the function, or held in a `let`;
- a value passed to a function (`clsx(isMobile && 'stack')` comes back out as a class name);
- a value spread into props (`{...(isMobile ? A : B)}`), which may carry `sx`;
- a value deciding which markup renders (`{isMobile ? <Compact /> : <Wide />}`), which a class name can do;
- a binding nothing reads, which proves no more than a query naming no feature does.

Known limitation: a value handed to a child component through an ordinary prop is exempt even if the child applies it to a class, because the trace stops at this file's props. That false negative is the accepted price of an analysis that stays inside one file — the alternative is the unactionable report this exemption removes.

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

```jsx
// A breakpoint reaching `sx` has a CSS remedy, whatever else it drives
import Box from '@mui/material/Box';
import { useMobile } from '../hooks/useMobile';

function Panel() {
  const isMobile = useMobile();
  return <Box sx={{ display: isMobile ? 'none' : 'block' }} />;
}
```

```jsx
// A call hides where the value goes, and here it comes back out as a class name
import clsx from 'clsx';
import { useMobile } from '../hooks/useMobile';

function Panel() {
  const isMobile = useMobile();
  const classes = clsx(isMobile && 'stack');
  return <div className={classes}>Content</div>;
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

```jsx
// A breakpoint reaching only a JS-only prop: no @media rule and no class name
// can select an anchorOrigin object, so the report would carry no remedy
import Popover from '@mui/material/Popover';
import { useMobile } from '../hooks/useMobile';

function CrewDock() {
  const isMobile = useMobile();
  const anchorOrigin = isMobile
    ? { vertical: 'bottom', horizontal: 'center' }
    : { vertical: 'top', horizontal: 'right' };
  return <Popover anchorOrigin={anchorOrigin} open />;
}
```

```jsx
// A transition duration is a JavaScript value that no stylesheet can supply
import Fade from '@mui/material/Fade';
import { useMobile } from '../hooks/useMobile';

function Reveal() {
  const isMobile = useMobile();
  return <Fade timeout={isMobile ? 0 : 300} />;
}
```

## When Not To Use It

If your project heavily relies on JavaScript-based responsive design and you're not ready to migrate to CSS media queries, you might want to disable this rule temporarily.

## Further Reading

- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)
- [Material-UI useMediaQuery](https://mui.com/material-ui/react-use-media-query/)
