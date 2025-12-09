# Enforce dynamic importing for modules within the firebaseCloud directory to optimize initial bundle size. This ensures Firebase-related code is only loaded when needed, improving application startup time and reducing the main bundle size (`@blumintinc/blumint/enforce-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Static imports from `firebaseCloud/` pull Firebase handlers, admin utilities, and their dependencies into the initial client bundle. Those modules are only needed when a specific action runs, so loading them eagerly slows startup and can initialize Firebase earlier than intended. This rule keeps Firebase code lazy by requiring dynamic imports and auto-fixing offending statements.

## Rule Details

- Flags any static `import` whose path contains `firebaseCloud/`.
- Allows `import type` and type-only specifiers to keep type information available without loading runtime code.
- Auto-fix rewrites to an awaited `import()` call and preserves type-only specifiers as a separate `import type`.

## Why this matters

- `firebaseCloud` modules often include large SDK chunks; statically importing them inflates the first payload and hurts time-to-interactive.
- Static imports defeat code splitting—every route pays the Firebase cost even if the code path never executes.
- Lazy loading keeps Firebase initialization aligned with the trigger point and avoids accidental early side effects.

## Examples

### ❌ Incorrect

```ts
import { setGroupChannel } from '../../../../firebaseCloud/messaging/setGroupChannel';
import helper from 'src/firebaseCloud/utils/helper';
import '../../../../firebaseCloud/utils/helper';
```

### ✅ Correct

```ts
const { setGroupChannel } = await import('../../../../firebaseCloud/messaging/setGroupChannel');
const helper = await import('src/firebaseCloud/utils/helper');
await import('../../../../firebaseCloud/utils/helper'); // side-effect import
import type { Params } from '../../../../firebaseCloud/messaging/setGroupChannel';
```

## How to fix violations

- Replace static firebaseCloud imports with an awaited `import()` in the code path that uses the module.
- Destructure only the exports you need from the resolved module; default exports can be accessed via `default`.
- Keep type information with `import type` statements when necessary—the auto-fix will preserve them for you.
