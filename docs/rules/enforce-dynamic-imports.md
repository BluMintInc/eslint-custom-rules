# Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored (`@blumintinc/blumint/enforce-dynamic-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored.

## Rule Details

Static imports pull the entire target package into your entry bundle. For heavy UI SDKs and media clients, that eager load inflates your users' first download, delays time-to-interactive, and forces them to fetch code paths they might never hit. This rule enforces dynamic imports for all external libraries by default, requiring a dynamic import (for example, `useDynamic(() => import("source"))`) so the dependency downloads only when your code path runs.

Libraries that are safe to import statically (like `react`, `next`, or small utilities) can be added to `ignoredLibraries`.

Type-only imports stay allowed when you enable `allowImportType`, so you keep type safety without shipping runtime code.

### Examples

#### ❌ Incorrect

```js
// Static import from an external library - ships everything on first load
import { VideoCall } from "@stream-io/video-react-sdk";

// Default import from an external library
import VideoSDK from "@stream-io/video-react-sdk";

// lodash is not ignored by default
import { debounce } from "lodash";
```

#### ✅ Correct

```js
// Dynamic import keeping the initial bundle lean
const VideoCall = useDynamic(() => import("@stream-io/video-react-sdk").then(mod => mod.VideoCall));

// Type imports are allowed by default
import type { VideoCallProps } from "@stream-io/video-react-sdk";

// Type-only specifiers are also allowed
import { type StreamVideo } from "@stream-io/video-react-sdk";

// Relative imports are always allowed
import { localHelper } from "./helpers";

// Standard libraries like react are ignored by default
import React from 'react';
```

## Options

The rule accepts an options object with the following properties:

```js
{
  "ignoredLibraries": ["react", "next/**", "custom-lib"],
  "allowImportType": true
}
```

- `ignoredLibraries`: An array of library names or glob patterns that are allowed to be imported statically. Defaults to: `react`, `react/**`, `react-dom`, `react-dom/**`, `next`, `next/**`, `@mui/material`, `@mui/material/**`, `@mui/icons-material`, `@mui/icons-material/**`, `@emotion/**`, `clsx`, `tailwind-merge`.
- `allowImportType`: A boolean indicating whether to allow `import type` statements or type-only specifiers. Defaults to `true`.

### Example Configuration

```json
"rules": {
  "@blumintinc/blumint/enforce-dynamic-imports": ["error", {
    "ignoredLibraries": ["react", "react-dom", "next", "clsx"],
    "allowImportType": true
  }]
}
```

## When Not To Use It

If you don't have any large libraries that need to be dynamically imported, or if you're working on a project where bundle size optimization is not a concern, you can disable this rule.

## Further Reading

- [Dynamic Imports in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)
- [Code Splitting in React](https://reactjs.org/docs/code-splitting.html)
