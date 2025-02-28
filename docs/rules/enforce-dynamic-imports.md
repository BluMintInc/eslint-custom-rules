# Enforce dynamic imports for specified libraries to optimize bundle size (`@blumintinc/blumint/enforce-dynamic-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce dynamic imports for specified libraries to optimize bundle size.

## Rule Details

This rule enforces dynamic imports for specified npm packages instead of static imports. Some libraries, such as `@stream-io/video-react-sdk`, are large and can significantly impact the initial bundle size. By dynamically importing these libraries, we can improve performance and optimize loading times.

### Examples

#### ❌ Incorrect

```js
// Static import from a large library
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
// Dynamic import using useDynamic hook
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
