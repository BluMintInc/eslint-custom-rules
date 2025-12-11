# Enforce dynamic importing for modules within the firebaseCloud directory to optimize initial bundle size. This ensures Firebase-related code is only loaded when needed, improving application startup time and reducing the main bundle size (`@blumintinc/blumint/enforce-dynamic-firebase-imports`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧💡 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix) and manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces dynamic importing for modules under `firebaseCloud` so Firebase code loads only when needed. Dynamic imports keep cold-start and bundle size lower by deferring Firebase client/server code until it is actually executed.

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
import { firebaseCloud } from 'firebaseCloud';

const handler = () => {
  return firebaseCloud.doWork();
};
```

### Correct

```ts
// Runtime import keeps Firebase out of the initial bundle
const handler = async () => {
  const { firebaseCloud } = await import('firebaseCloud');
  return firebaseCloud.doWork();
};

// Type-only imports remain untouched
import type { FirebaseTypes } from 'firebaseCloud';
```
