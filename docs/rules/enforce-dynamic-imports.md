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

Unlike `ignoredLibraries`, an entry here does **not** reach the package's subpaths: listing `pkg` enforces `pkg` but leaves `pkg/sub` alone. This list decides what is *reported*, so covering subpaths implicitly would add errors to configurations that predate the behaviour. Write `pkg/**` when you want the subpaths enforced too.

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

A plain (non-glob) entry covers the package **and everything published under it**, because a subpath entry point is the same dependency as its root: `fast-deep-equal` also allows `fast-deep-equal/es6`, upstream's documented ESM build. The boundary is the `/` separator, never a bare substring, so a *different* package whose name merely starts with an entry is still reported — `fast-deep-equal` does not allow `fast-deep-equal-extra`.

Glob entries keep their [minimatch](https://github.com/isaacs/minimatch) semantics unchanged, since a pattern already states how far it reaches: `@ignored/*` matches one segment and nothing beyond it.

```js
// ignoredLibraries: ["fast-deep-equal", "@ignored/*"]

import isEqual from "fast-deep-equal"; // ✅ the package root
import isEqualEs6 from "fast-deep-equal/es6"; // ✅ a subpath of an ignored package
import isEqualReact from "fast-deep-equal/es6/react"; // ✅ a deeper subpath
import thing from "@ignored/lib"; // ✅ matched by the glob
import extra from "fast-deep-equal-extra"; // ❌ a different package
import deep from "@ignored/lib/deep"; // ❌ '@ignored/*' spans one segment
```

Defaults to: `react`, `react/**`, `react-dom`, `react-dom/**`, `next`, `next/**`, `@mui/material`, `@mui/material/**`, `@mui/icons-material`, `@mui/icons-material/**`, `@emotion/**`, `clsx`, `tailwind-merge`, `use-latest-callback`, `@blumintinc/typescript-memoize`, `@blumintinc/use-deep-compare`, `microdiff`, `safe-stable-stringify`, `fast-deep-equal`.

The last six are modules this plugin's own fixers inject: `use-latest-callback`, `enforce-memoize-async`, `enforce-memoize-getters`, `require-memoize-jsx-returners`, `prefer-use-deep-compare-memo`, `enforce-microdiff`, `enforce-safe-stringify`, and `fast-deep-equal-over-microdiff` all write a static import as part of their autofix. Reporting them would turn an auto-fixable violation into one a human has to resolve by hand, and a dynamic import is not even an option for a hook (which must be called unconditionally) or a decorator (which must resolve statically). If you override `ignoredLibraries`, keep these entries.

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
