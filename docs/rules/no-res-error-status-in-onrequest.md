# Forbid sending 4xx/5xx Express responses inside onRequest handlers; throw structured HttpsError instances instead so the wrapper can format, log, and map errors consistently (`@blumintinc/blumint/no-res-error-status-in-onrequest`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Cloud Functions `onRequest` handlers must throw structured `HttpsError` instances so the shared wrapper can normalize HTTP status codes, response bodies, and logging. Writing error responses directly with `res.status(4xx|5xx)` or `res.sendStatus(4xx|5xx)` bypasses that pipeline and produces inconsistent error shapes and monitoring gaps.

## Mapped status → HttpsError code

- 400 → `invalid-argument`
- 401 → `unauthenticated`
- 403 → `permission-denied`
- 404 → `not-found`
- 409 → `already-exists`
- 412 / 422 → `failed-precondition`
- 429 → `resource-exhausted`
- 499 / 504 → `deadline-exceeded`
- 500 → `internal`
- 502 / 503 → `unavailable`
- Fallback → `unknown`

## Rule Details

**Incorrect** code (violations):

```typescript
import onRequest from 'functions/src/v2/https/onRequest';

export default onRequest((req, res) => {
  res.status(500).json({ message: 'Server error' });
  res.sendStatus(404);
  res.status(isAuth ? 401 : 400).send('Access denied');
  badRequest(res, { reason: 'missing fields' }); // helper that writes to res
});
```

**Correct** code:

```typescript
import onRequest from 'functions/src/v2/https/onRequest';
import { HttpsError } from 'functions/src/util/errors/HttpsError';

export default onRequest((req) => {
  if (!req.body.userId) {
    throw new HttpsError('invalid-argument', 'userId required', { body: req.body });
  }

  throw new HttpsError('failed-precondition', 'Not enough teams to promote', {
    sufficientTeamsCount: 0,
  });
});
```

### Computed or helper-based responses

- Computed statuses like `res.status(isAuth ? 401 : 400)` are flagged; pick an explicit `HttpsError` code and throw it.
- Helper wrappers that receive `res` (e.g., `badRequest(res, ...)`) are flagged; refactor helpers to throw `HttpsError` instead of writing to the response.

## When Not To Use It

Disable this rule only when experimenting with legacy handlers that cannot yet adopt the centralized `HttpsError` flow. Prefer documenting the exception inline if you must disable it.
