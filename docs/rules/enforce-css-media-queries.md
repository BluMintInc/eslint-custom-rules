# Enforce CSS media queries over JS breakpoints (`@blumintinc/blumint/enforce-css-media-queries`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces the use of CSS media queries instead of JavaScript-based breakpoints in React components for better performance and separation of concerns.

## Rule Details

JavaScript breakpoint handling (e.g., Material-UI's `useMediaQuery`) can cause unnecessary re-renders and impact performance, whereas CSS media queries are optimized for responsive design.

This rule will flag any usage of JavaScript-based breakpoints, including:
- `useMediaQuery` from `@mui/material`
- Any imports from `react-responsive`
- `useMobile` hook from any path containing `hooks/useMobile`

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
```

## When Not To Use It

If your project heavily relies on JavaScript-based responsive design and you're not ready to migrate to CSS media queries, you might want to disable this rule temporarily.

## Further Reading

- [CSS Media Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries)
- [Material-UI useMediaQuery](https://mui.com/material-ui/react-use-media-query/)
