# Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed (`@blumintinc/blumint/enforce-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces dynamic importing for modules under `firebaseCloud` so Firebase code loads only when needed. Dynamic imports keep cold-start and bundle size lower by deferring Firebase client/server code until it is actually executed.

The rule matches an import whose module specifier contains a `firebaseCloud/` path segment (e.g. `../../firebaseCloud/messaging/setGroupChannel`, `src/firebaseCloud/messaging/api`). A specifier that merely starts with the word — `firebaseClouds/utils/helper` — is not matched.

## Exempt files

The rationale is bundle weight, so files that never reach the client bundle are exempt entirely:

- **Test and spec files** — any path ending in `.test.` or `.spec.` followed by `js`, `jsx`, `ts`, `tsx`, `mjs`, `mts`, `cjs` or `cts`. A suite is never bundled, and its static binding is what `jest.mock()` hoisting intercepts.
- **Jest convention directories** — any file under a `__tests__/` or `__mocks__/` directory, whatever its name.
- **Declaration files** — any path ending in `.d.ts`, which emits no runtime code.
- **Third-party sources** — anything under `node_modules/`.

The test suffix is anchored to the end of the path, so production modules that merely contain the word (`latest.tsx`, `contest.ts`, `testHelpers.ts`, `src/testing/setup.ts`) keep their enforcement.

## Usage

Enable the rule via the recommended config or explicitly:

```json
{
  "plugins": ["@blumintinc/blumint"],
  "rules": {
    "@blumintinc/blumint/enforce-dynamic-firebase-imports": "error"
  }
}
```

This rule has no configuration options; the behavior is fixed.

## Autofix

The fix **relocates** the import to its call site: it deletes the static import
and declares the dynamic one at the top of the `async` function body that uses
it. Type-only specifiers stay behind as an `import type`, since they are erased
at compile time and a dynamic import cannot supply them.

An `import` declaration only ever sits at module scope, so rewriting it where it
stands could only ever produce a module-scope `await import(...)` — which defers
nothing (the module still awaits it while evaluating) and does not even parse
once the file is compiled to CommonJS, where top-level `await` does not exist.
The rule therefore offers the fix only where the rewrite is expressible at a
call site, and **reports without fixing** everywhere else. The editor suggestion
offers the same edit and is likewise withheld when the fix is.

The fix applies when every value reference to the import lives inside one
`async` function with a block body:

```ts
import { setGroupChannel } from '../../firebaseCloud/messaging/setGroupChannel';

export const handler = async () => {
  return setGroupChannel();
};
```

becomes

```ts
export const handler = async () => {
  const { setGroupChannel } = await import(
    '../../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel();
};
```

A reference held by a synchronous callback nested inside that async function
still counts, because the callback cannot run before the first statement of the
body it is created in.

The fix is withheld — the violation is still reported — when the import is:

- read at module scope, including a re-export (`export { create }`) or a
  module-level `typeof` annotation;
- read only from a synchronous function, which has nowhere to put an `await`;
- read from an `async` arrow with an expression body, which has no block to
  declare into;
- read from a function's signature (a parameter default or a return type),
  which is evaluated before the body runs;
- read from more than one `async` function, which is a per-call-site refactor;
- read by nothing at all, including a side-effect import (`import '…'`), which
  binds no name to relocate.

## Examples

### Incorrect

```ts
// Eager import pulls Firebase into the main bundle
import { setGroupChannel } from '../../firebaseCloud/messaging/setGroupChannel';

const handler = () => {
  return setGroupChannel();
};
```

### Correct

```ts
// Runtime import keeps Firebase out of the initial bundle
const handler = async () => {
  const { setGroupChannel } = await import(
    '../../firebaseCloud/messaging/setGroupChannel'
  );
  return setGroupChannel();
};

// Type-only imports remain untouched
import type { Params } from '../../firebaseCloud/messaging/setGroupChannel';
```

```ts
// File: src/hooks/useStartMatch.test.tsx
// A suite is never bundled, so a static import is fine there — and it is what
// `jest.mock()` hoisting needs in order to intercept the module
import { startMatch } from '../../firebaseCloud/tournament/startMatch';

jest.mock('../../firebaseCloud/tournament/startMatch');
```
