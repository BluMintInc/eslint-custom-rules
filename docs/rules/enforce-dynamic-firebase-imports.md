# Require firebaseCloud modules to be loaded via dynamic import so Firebase code stays out of the initial bundle and only loads when needed (`@blumintinc/blumint/enforce-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces dynamic importing for modules under `firebaseCloud` so Firebase code loads only when needed. Dynamic imports keep cold-start and bundle size lower by deferring Firebase client/server code until it is actually executed.

The rule matches an import whose module specifier contains a `firebaseCloud/` path segment (e.g. `../../firebaseCloud/messaging/setGroupChannel`, `src/firebaseCloud/messaging/api`). A specifier that merely starts with the word — `firebaseClouds/utils/helper` — is not matched.

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
