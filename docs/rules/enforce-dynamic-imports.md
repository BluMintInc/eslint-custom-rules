# Enforce dynamic imports for specified libraries to optimize bundle size (`@blumintinc/blumint/enforce-dynamic-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce dynamic imports for specified libraries to optimize bundle size.

## Rule Details

Static imports pull the entire target package into the entry bundle. For heavy UI SDKs and media clients, that eager load inflates the first download, delays time-to-interactive, and forces users to fetch code paths they might never hit. This rule blocks static imports for configured libraries and requires a dynamic import so the dependency downloads only when the code path runs. Type-only imports stay allowed when `allowImportType` is enabled, letting you keep type safety without shipping runtime code.

Use this rule when a library is large, rarely needed on initial render, or better loaded just before use (for example, before opening a call UI).

### Examples

#### ❌ Incorrect

```js
// Static import from a large library – ships everything on first load
import { VideoCall } from "@stream-io/video-react-sdk";

// Default import from a large library
import VideoSDK from "@stream-io/video-react-sdk";

// Multiple named imports from a large library
import { VideoCall, AudioCall } from "@stream-io/video-react-sdk";

// Side-effect import from a large library
import "@stream-io/video-react-sdk";
```

#### ✅ Correct

```js
// Dynamic import using useDynamic hook keeps the initial bundle lean
const VideoCall = useDynamic(() => import("@stream-io/video-react-sdk").then(mod => mod.VideoCall));

// Type imports are allowed by default
import type { VideoCallProps } from "@stream-io/video-react-sdk";

// Type-only specifiers are also allowed
import { type StreamVideo } from "@stream-io/video-react-sdk";

// Regular imports from non-blacklisted libraries
import React from 'react';
```

## Options

The rule accepts an options object with the following properties:

```js
{
  "libraries": ["@stream-io/video-react-sdk", "some-heavy-lib*"],
  "allowImportType": true
}
```

- `libraries`: An array of library names or glob patterns to enforce dynamic imports for.
- `allowImportType`: A boolean indicating whether to allow `import type` statements for the specified libraries. Defaults to `true`.

### Example Configuration

```json
"rules": {
  "@blumintinc/blumint/enforce-dynamic-imports": ["error", {
    "libraries": ["@stream-io/video-react-sdk", "some-heavy-lib*"],
    "allowImportType": true
  }]
}
```

## When Not To Use It

If you don't have any large libraries that need to be dynamically imported, or if you're working on a project where bundle size optimization is not a concern, you can disable this rule.

## Further Reading

- [Dynamic Imports in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)
- [Code Splitting in React](https://reactjs.org/docs/code-splitting.html)
