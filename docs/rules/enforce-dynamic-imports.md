# Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored (`@blumintinc/blumint/enforce-dynamic-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce dynamic imports for external libraries by default to optimize bundle size, unless explicitly ignored.

## Rule Details

Static imports pull the entire target package into your entry bundle. For heavy UI SDKs and media clients, that eager load inflates your users' first download, delays time-to-interactive, and forces them to fetch code paths they might never hit. This rule enforces dynamic imports for external libraries, requiring a dynamic import (for example, `useDynamic(() => import("source"))`) so the dependency downloads only when your code path runs.

The rule operates in two modes depending on which option is provided:

- **Enforce-by-default mode** (default): all external npm packages must be dynamically imported. Packages that are safe to import statically can be listed in `ignoredLibraries`. Node.js built-in modules and project-internal paths (controlled by `internalPrefixes`) are automatically exempt.
- **Whitelist mode**: when you supply a `libraries` array, only those specific packages are enforced. All other imports are silently allowed. This preserves compatibility with pre-1.16.0 consumer configurations.

### Exempt sources (enforce-by-default mode)

The following sources are **never** reported, regardless of configuration:

- Relative imports (`./foo`, `../bar`)
- Path aliases starting with `@/` (treated as project-internal)
- Node.js core modules — bare names (`fs`, `path`, `crypto`, `url`), `node:`-prefixed (`node:fs`), and sub-path forms (`fs/promises`, `util/types`)
- Paths that start with a configured internal prefix (`src/` and `functions/` by default)

### Examples

#### ❌ Incorrect

```js
// Static import from an external library — ships everything on first load
import { VideoCall } from "@stream-io/video-react-sdk";

// Default import from an external library
import VideoSDK from "@stream-io/video-react-sdk";

// lodash is not ignored by default
import { debounce } from "lodash";
```

#### ✅ Correct

```js
// Dynamic import keeping the initial bundle lean
const VideoCall = useDynamic(() =>
  import("@stream-io/video-react-sdk").then((mod) => mod.VideoCall)
);

// Type imports are allowed by default
import type { VideoCallProps } from "@stream-io/video-react-sdk";

// Type-only specifiers are also allowed
import { type StreamVideo } from "@stream-io/video-react-sdk";

// Relative imports are always allowed
import { localHelper } from "./helpers";

// Standard libraries like react are ignored by default
import React from "react";

// Node builtins are exempt
import { readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

// Internal baseUrl paths (src/ and functions/ prefixes) are exempt
import { COLORS } from "src/styles/layout";
import { assertSafe } from "functions/src/util/assertSafe";
```

## Options

The rule accepts an options object with the following properties:

```js
{
  // Whitelist mode: enforce ONLY these libraries (restores pre-1.16.0 behaviour)
  "libraries": ["@stream-io/video-react-sdk"],

  // Enforce-by-default mode: allow these libraries to be imported statically
  "ignoredLibraries": ["react", "next/**", "custom-lib"],

  // Paths starting with these prefixes are treated as project-internal
  "internalPrefixes": ["src/", "functions/"],

  "allowImportType": true
}
```

### `libraries` (array, optional)

Activates **whitelist mode**. Only imports whose source matches one of these patterns are reported. All other imports — including heavy external packages — are silently allowed. Supports exact strings and glob patterns (via [minimatch](https://github.com/isaacs/minimatch)).

When `libraries` is provided, `ignoredLibraries` and `internalPrefixes` are not consulted.

Use this option to preserve compatibility with configurations written before 1.16.0:

```json
"rules": {
  "@blumintinc/blumint/enforce-dynamic-imports": ["error", {
    "libraries": ["@stream-io/video-react-sdk"],
    "allowImportType": true
  }]
}
```

### `ignoredLibraries` (array, optional)

Used in **enforce-by-default mode** (when `libraries` is absent). An array of library names or glob patterns that are allowed to be imported statically.

Defaults to: `react`, `react/**`, `react-dom`, `react-dom/**`, `next`, `next/**`, `@mui/material`, `@mui/material/**`, `@mui/icons-material`, `@mui/icons-material/**`, `@emotion/**`, `clsx`, `tailwind-merge`.

### `internalPrefixes` (array, optional)

Used in **enforce-by-default mode** only. Any import source that starts with one of these prefixes is treated as project-internal and exempt from the rule. This handles TypeScript `baseUrl` configurations where internal modules are imported as bare paths (e.g., `src/styles/layout`, `functions/src/util/assertSafe`).

Defaults to: `["src/", "functions/"]`.

### `allowImportType` (boolean, optional)

Whether to allow `import type` statements or specifiers with the `type` keyword. Applies in both modes.

Defaults to `true`.

### Example Configuration (enforce-by-default mode)

```json
"rules": {
  "@blumintinc/blumint/enforce-dynamic-imports": ["error", {
    "ignoredLibraries": ["react", "react-dom", "next", "clsx"],
    "internalPrefixes": ["src/", "functions/", "packages/"],
    "allowImportType": true
  }]
}
```

## When Not To Use It

If you don't have any large libraries that need to be dynamically imported, or if you're working on a project where bundle size optimization is not a concern, you can disable this rule.

## Further Reading

- [Dynamic Imports in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports)
- [Code Splitting in React](https://reactjs.org/docs/code-splitting.html)
