# Enforce proper logging for useAlertDialog based on severity. When severity is "error", console.error must be included. When severity is "warning", console.warn must be included. This ensures all user-facing errors and warnings are properly logged to monitoring systems (`@blumintinc/blumint/enforce-console-error`)

✅ Enabled in the `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

Enforce proper logging for useAlertDialog based on severity. When severity is "error", console.error must be included. When severity is "warning", console.warn must be included. This ensures all user-facing errors and warnings are properly logged to monitoring systems.

- severity: `"error"` → must call `console.error(...)` in the same function scope
- severity: `"warning"` → must call `console.warn(...)` in the same function scope

### ❌ Incorrect

```ts
function submit() {
  useAlertDialog({ severity: 'error', message: 'Failed' }); // missing console.error
}
```

### ✅ Correct

```ts
function submit(userId: string) {
  console.error('submit failed', { userId, context: 'submit' });
  useAlertDialog({ severity: 'error', message: 'Failed' });
}
```

## When Not To Use It

Tests or code paths where logging is intentionally centralized elsewhere.
