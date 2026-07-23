# Disallow console.error so errors flow through structured handling (HttpsError/useErrorAlert on frontend, structured loggers on backend) (`@blumintinc/blumint/no-console-error`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Why this rule matters

- console.error bypasses the shared error pipeline, hiding failures from user-facing alerts and monitoring.
- Frontend code should throw `HttpsError` or flow through `useErrorAlert` so user messaging stays consistent.
- Backend code should emit structured logs (e.g., `firebase-functions/v2` `logger.error`) and propagate errors for observability.

## Rule Details

- Reports any call to `console.error`, including optional chaining and computed properties.
- Flags aliasing of `console.error` via destructuring, assignment, or storing `console` in another variable before calling `.error`.
- Stops tracking aliases after they are reassigned to non-console targets to avoid false positives.
- Allows locally shadowed `console` objects so intentional logger shims are not reported.
- Skips files matched by default ignores: `**/__tests__/**`, `**/__mocks__/**`, `**/__playwright__/**`, `**/scripts/**`, `**/electron/**`, `**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, `**/coverage/**`.
- When `allowWithUseAlertDialog` is enabled, direct `console.error(...)` calls inside functions that open an error dialog via `useAlertDialog` are allowed, so the rule does not conflict with `@blumintinc/blumint/enforce-console-error`.
- When `allowErrorInstanceArgument` is enabled, calls that pass a `new <Something>Error(...)` argument (e.g. `console.error(new HttpsError({ ... }))`) are allowed, because that is the sanctioned backend monitoring pipeline — `spyOnConsoleErrors` reports the `Error` instance among the args rather than being bypassed. Detection is purely syntactic (an argument that is a `new` expression whose callee identifier ends in `Error`), so a bare identifier such as `console.error(error)` is still reported. The carve-out applies to every matched call shape (direct, aliased, destructured, computed).
- Does not auto-fix; remediation depends on context (throw vs. structured logger).

## Examples

### ❌ Incorrect

```ts
try {
  await submitForm();
} catch (err) {
  console.error('Submit failed', err);
}
```

```ts
const { error } = console;
error('boom');
```

### ✅ Correct

```ts
import { HttpsError } from '../../functions/src/util/errors/HttpsError';
import { useErrorAlert } from '@/hooks/useErrorAlert';

const { catchError } = useErrorAlert();

await catchError(async () => {
  await submitForm();
});
```

```ts
import { logger } from 'firebase-functions/v2';

try {
  await doWork();
} catch (err) {
  logger.error('doWork failed', { err });
  throw err;
}
```

```ts
// With `allowErrorInstanceArgument`: handing a structured Error instance to the
// monitored console.error pipeline in a deliberately non-fatal path.
import { HttpsError } from '../errors/HttpsError';

try {
  await revokeGrant(integrationId);
} catch (error) {
  console.error(
    new HttpsError({ code: 'unavailable', message: 'Grant revocation failed', cause: error }),
  );
}
```

## Options

```json
{
  "@blumintinc/blumint/no-console-error": [
    "warn",
    {
      "ignorePatterns": ["**/tools/**"],
      "allowWithUseAlertDialog": true,
      "allowErrorInstanceArgument": true
    }
  ]
}
```

- `ignorePatterns`: additional glob patterns to skip. These are appended to the defaults listed above.
- `allowWithUseAlertDialog`: when true, allows `console.error` for `useAlertDialog` error dialog flows that are required by `@blumintinc/blumint/enforce-console-error`.
- `allowErrorInstanceArgument`: when true, allows `console.error` calls that pass a `new <Something>Error(...)` argument (e.g. `new HttpsError({ ... })`), the sanctioned backend structured-error handoff captured by monitoring. Bare identifiers and non-`Error` constructors remain reported. Enabled in the `recommended` config.

## When not to use it

Disable or scope the rule only for files that intentionally print raw errors (e.g., throwaway debugging scripts). Prefer using `ignorePatterns` for narrowly scoped opt-outs instead of disabling the rule globally.
