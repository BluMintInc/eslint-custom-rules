# Enforce CSS media queries over JS breakpoints (`@blumintinc/blumint/enforce-css-media-queries`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You keep responsive breakpoints in CSS instead of runtime JavaScript hooks. When you rely on JavaScript media detection (for example, `useMediaQuery` or `useMobile`), it attaches resize listeners inside React renders, which forces avoidable re-renders and introduces a second, drifting source of truth for breakpoints. CSS is already optimized for media evaluation, so letting styles own breakpoints keeps layout logic declarative and consistent.

## Rule Details

You get a report for any JavaScript-based viewport detection so that breakpoints live in CSS instead of the render path. The rule flags:
- `useMediaQuery` from `@mui/material`
- Any imports from `react-responsive`
- Any `useMobile` import or call (including `hooks/useMobile` paths and other sources)

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

## When Not To Use It

If your project heavily relies on JavaScript-based responsive design and you're not ready to migrate to CSS media queries, you might want to disable this rule temporarily.

## Further Reading

- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)
- [Material-UI useMediaQuery](https://mui.com/material-ui/react-use-media-query/)
