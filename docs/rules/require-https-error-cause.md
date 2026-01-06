# Ensure HttpsError calls inside catch blocks pass the caught error as the fourth "cause" argument to preserve stack traces for monitoring (`@blumintinc/blumint/require-https-error-cause`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule ensures any `HttpsError` created inside a `catch` block includes the caught error as the `cause`. This can be done either via the fourth positional argument or a `cause` property in a single settings object argument. Passing the original error preserves the stack trace so monitoring can deduplicate issues reliably and keep the root cause available for debugging.
Always bind the full error object (for example, `catch (error)`) so it can be forwarded. Destructuring (such as `catch ({ message })`) drops the original error reference and cannot satisfy the required cause argument.

## Rule Details

Examples of **incorrect** code for this rule:

```typescript
try {
  await doWork();
} catch (error) {
  // Missing cause argument
  throw new HttpsError('internal', 'Operation failed');
}

try {
  await doWork();
} catch (error) {
  // Missing cause in settings object
  throw new HttpsError({
    code: 'internal',
    message: 'Operation failed',
  });
}

try {
  await doWork();
} catch (err) {
  // Cause placed in details instead of the fourth argument
  throw new HttpsError('internal', 'Operation failed', { err });
}

try {
  await doWork();
} catch (error) {
  // Cause is not the catch binding
  const otherError = new Error('other');
  throw new HttpsError('internal', 'Operation failed', undefined, otherError);
}

try {
  await doWork();
} catch ({ message }) {
  // Destructuring drops the original error object, so there is no catch binding
  throw new HttpsError('internal', 'Operation failed', undefined, message);
}
```

Examples of **correct** code for this rule:

```typescript
try {
  await doWork();
} catch (error) {
  throw new HttpsError('internal', 'Operation failed', undefined, error);
}

try {
  await doWork();
} catch (error) {
  throw new HttpsError({
    code: 'internal',
    message: 'Operation failed',
    cause: error,
  });
}

try {
  await doWork();
} catch (err) {
  throw new HttpsError('internal', 'Operation failed', { jobId }, err);
}

try {
  await doWork();
} catch (error) {
  // Stack override is allowed as a fifth argument
  throw new HttpsError('internal', 'Operation failed', { context: 123 }, error, 'custom stack');
}
```

## When Not To Use It

- You are working in contexts where `HttpsError` is not available or you intentionally want to construct errors outside a `catch` block (those calls are out of scope for this rule).
- You deliberately do not want to preserve the original error stack (not recommended for production error monitoring).
