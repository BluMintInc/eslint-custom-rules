# Enforce using proprietary HttpsError instead of throw new Error or firebase-admin HttpsError in functions/src (`@blumintinc/blumint/require-https-error`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Using the proprietary `HttpsError` keeps Cloud Functions responses consistent: clients receive the intended status code, logs capture the canonical error shape, and messages are sanitized before leaving the service. Throwing a generic `Error` or the `firebase-admin` `HttpsError` bypasses that wrapper, which leads to generic 500s, uneven logging, and payloads that are harder to trace.

## Rule Details

- Applies only to files in `functions/src`.
- Reports `throw new Error(...)` so Cloud Functions do not return an unstructured 500 response.
- Reports any use of `firebase-admin`’s `HttpsError`, including aliased imports and `https.HttpsError`, because it skips the proprietary wrapper and its logging/sanitization behavior.
- Allows throwing the proprietary `HttpsError` (for example from `@our-company/errors`) or other project-specific error types.

## Examples

### ❌ Incorrect

```ts
// Throws a generic Error: client receives an unstructured 500
throw new Error('Missing user id');
```

```ts
// Uses firebase-admin HttpsError: bypasses proprietary logging and normalization
import { HttpsError } from 'firebase-admin';

throw new HttpsError('failed-precondition', 'Payment source missing');
```

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

## How to Fix

- Replace `throw new Error(...)` with the proprietary `HttpsError` and supply the canonical status code plus a client-safe message.
- Replace any `firebase-admin` `HttpsError` import (direct or via `https`) with the proprietary `HttpsError` from `@our-company/errors`.
- Keep this enforcement scoped to `functions/src` so other packages can define their own error handling.
