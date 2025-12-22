# Enforce dynamic imports for Firebase dependencies (`@blumintinc/blumint/require-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Static Firebase imports keep the SDK in every bundle, even on routes that never touch Firebase. This rule enforces dynamic imports so Firebase loads lazily, keeping initial bundles smaller and avoiding runtime issues when the SDK initializes in environments without `window`.

## Rule Details

Use `await import()` for Firebase runtime imports (such as `firebase/app`, `firebase/auth`, or `config/firebase-client`). Static runtime imports bundle the full SDK, block route-level code splitting, and can fail during SSR because they execute immediately. Type-only imports remain allowed so you can keep type safety without pulling runtime code into the bundle.

`await import()` must run in an async context or with top-level await; if your environment lacks top-level await, wrap the call in an async function or use `import('firebase/auth').then(...)` instead of static runtime imports.

The fixer rewrites static Firebase imports to an equivalent dynamic import, preserving default imports, named imports, aliases, and side-effect imports.

### Examples

#### ❌ Incorrect

```ts
import firebase from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import '../../config/firebase-client';
import 'firebase/auth';
```

#### ✅ Correct

```ts
// Lazy-load Firebase where it is actually needed
const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
const firebaseConfig = (await import('../../config/firebase-client')).default;
await import('firebase/auth'); // Dynamic side-effect import when needed

// Type-only imports remain static because they do not load runtime code
import type { FirebaseApp } from 'firebase/app';
```
