# Enforce dynamic imports for Firebase dependencies (`@blumintinc/blumint/require-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Static Firebase imports keep the SDK in every bundle, even on routes that never touch Firebase. This rule enforces dynamic imports so Firebase loads lazily, keeping initial bundles smaller and avoiding runtime issues when the SDK initializes in environments without `window`.

## Rule Details

Use `await import()` for Firebase runtime imports (such as `firebase/app`, `firebase/auth`, or `config/firebase-client`). Static runtime imports bundle the full SDK, block route-level code splitting, and can fail during SSR because they execute immediately. Type-only imports remain allowed so you can keep type safety without pulling runtime code into the bundle — this covers both `import type { ... }` statements and imports where every specifier carries an inline `type` marker (`import { type Firestore } from 'firebase/firestore'`), since both are erased at compile time.

`await import()` must run in an async context; wrap the call in an async function or use `import('firebase/auth').then(...)` instead of static runtime imports.

## Why there is no autofix

The rule reports without offering a `--fix`. A static `import` declaration is legal only at the top level of a module or namespace, so every violation sits at module scope, where the `await import()` replacement would introduce top-level await — silently converting a synchronous module into an async one and breaking build targets that lack top-level await support.

The remedy is a restructuring, not a text substitution: move the import into the async code path that actually needs Firebase. Two details matter when you do that by hand:

* **Type specifiers must not move into the runtime destructuring.** A dynamic import cannot supply types, and dropping the `type` marker turns type references into dangling value bindings (`TS2749`). In a mixed import, keep the type specifiers in a static `import type { ... }` at module scope — it is erased at compile time and costs nothing at runtime — and destructure only the value specifiers off the `await import()`.
* **The `await` binds to the nearest enclosing function.** A synchronous helper nested inside an async function cannot host the dynamic import; the call has to live in the async function itself, or the helper has to become async too.

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
