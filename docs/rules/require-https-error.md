# Enforce using proprietary HttpsError instead of throw new Error or firebase-admin HttpsError in functions/src (`@blumintinc/blumint/require-https-error`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Using the proprietary `HttpsError` keeps Cloud Functions responses consistent: clients receive the intended status code, logs capture the canonical error shape, and messages are sanitized before leaving the service. Throwing a generic `Error` or the `firebase-admin` `HttpsError` bypasses that wrapper, which leads to generic 500s, uneven logging, and payloads that are harder to trace.

## Rule Details

- Applies only to files in `functions/src`.
- Skips Jest test files, which never run as a Cloud Function invocation and never return an HTTP response to a client: any path ending in `.test.*` or `.spec.*` (including multi-part suffixes such as `EventRegistry.integration.test.ts`) and any file inside a `__tests__/` or `__mocks__/` directory. Production modules whose names merely contain `test` or `spec` (`testUtils.ts`, `latest.ts`, `foo.test.helper.ts`) remain enforced.
- Reports `throw new Error(...)` so Cloud Functions do not return an unstructured 500 response.
- Reports any use of `firebase-admin`’s `HttpsError`, including aliased imports and `https.HttpsError`, because it skips the proprietary wrapper and its logging/sanitization behavior.
- Reports the forbidden `firebase-admin` `HttpsError` both when it is imported (to block unused but disallowed dependencies) and again when it is thrown, so runtime usage is always flagged.
- Allows throwing the proprietary `HttpsError` (for example from `@our-company/errors`) or other project-specific error types.

## Examples

The incorrect examples note whether the diagnostic appears at import time or when the throw is executed.

### ❌ Incorrect

Throwing a generic `Error` is reported at the throw site.

```ts
// Throws a generic Error: client receives an unstructured 500
throw new Error('Missing user id');
```

Importing `firebase-admin`’s `HttpsError` is reported immediately, and throwing it is also reported so the runtime path is blocked.

```ts
// Uses firebase-admin HttpsError: bypasses proprietary logging and normalization
import { HttpsError } from 'firebase-admin';

throw new HttpsError('failed-precondition', 'Payment source missing');
```

Aliased `https.HttpsError` imports are reported at import time, and throwing through the alias is also reported.

```ts
// Aliased firebase-admin https import still uses the wrong error class
import { https as firebaseHttps } from 'firebase-admin';

throw new firebaseHttps.HttpsError('permission-denied', 'Not allowed');
```

### ✅ Correct

```ts
// Uses the proprietary HttpsError so responses include structured status and logs
import { HttpsError } from '@our-company/errors';

throw new HttpsError('INVALID_ARGUMENT', 'Provide a user id before saving');
```

```ts
// Custom project error classes remain allowed
throw new CustomError('Feature flag not enabled');
```

```ts
// functions/src/util/example.test.ts
// Test setup guards and fixtures are exempt: a test is never a Cloud Function
describe('exampleGuard', () => {
  beforeAll(() => {
    if (!process.env.REQUIRED_ENV_VAR) {
      throw new Error('REQUIRED_ENV_VAR not set');
    }
  });
});
```

## How to Fix

- Replace `throw new Error(...)` with the proprietary `HttpsError` and supply the canonical status code plus a client-safe message.
- Replace any `firebase-admin` `HttpsError` import (direct or via `https`) with the proprietary `HttpsError` from `@our-company/errors`.
- Keep this enforcement scoped to `functions/src` so other packages can define their own error handling.
- Leave `throw new Error(...)` alone in `*.test.*` / `*.spec.*` files and in `__tests__/` or `__mocks__/` modules: swapping in `HttpsError` there adds no client-facing benefit and obscures the intent of the fixture.
