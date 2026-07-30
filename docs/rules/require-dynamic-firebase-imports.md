# Enforce dynamic imports for Firebase dependencies (`@blumintinc/blumint/require-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Static Firebase imports keep the SDK in every bundle, even on routes that never touch Firebase. This rule enforces dynamic imports so Firebase loads lazily, keeping initial bundles smaller and avoiding runtime issues when the SDK initializes in environments without `window`.

## Rule Details

Use `await import()` for Firebase runtime imports (such as `firebase/app`, `firebase/auth`, or `config/firebase-client`). Static runtime imports bundle the full SDK, block route-level code splitting, and can fail during SSR because they execute immediately. Type-only imports remain allowed so you can keep type safety without pulling runtime code into the bundle — this covers both `import type { ... }` statements and imports where every specifier carries an inline `type` marker (`import { type Firestore } from 'firebase/firestore'`), since both are erased at compile time.

`await import()` must run in an async context; wrap the call in an async function or use `import('firebase/auth').then(...)` instead of static runtime imports.

The fixer rewrites static Firebase imports to an equivalent dynamic import, preserving default imports, namespace imports, named imports, aliases, and side-effect imports. Two safety limits apply:

* **Type specifiers never move into the runtime destructuring.** A dynamic import cannot supply types, and dropping the `type` marker would turn type references into dangling value bindings (`TS2749`). In a mixed import, value specifiers become the `await import()` destructuring while type specifiers are hoisted into a static `import type { ... }` at module scope, which costs nothing at runtime.
* **The fixer only applies inside an async function.** Rewriting a module-scope import would introduce top-level await, converting a synchronous module into an async one (and breaking build targets without top-level await support). Module-scope Firebase imports are reported without an autofix; restructure the code so Firebase loads inside the async code path that needs it.

### Examples

#### ❌ Incorrect

```ts
import firebase from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import '../../config/firebase-client';
import 'firebase/auth';
```

#### ✅ Correct

```ts
// Lazy-load Firebase inside the async code path that actually needs it
async function signIn(email: string, password: string) {
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  return signInWithEmailAndPassword(getAuth(), email, password);
}

async function loadConfig() {
  const firebaseConfig = (await import('../../config/firebase-client')).default;
  return firebaseConfig;
}

async function setup() {
  await import('firebase/auth'); // Dynamic side-effect import when needed
}

// Type-only imports remain static because they do not load runtime code
import type { FirebaseApp } from 'firebase/app';
import { type Firestore, type FirestoreSettings } from 'firebase/firestore';
```
