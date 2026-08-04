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
