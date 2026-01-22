# Warn when messageUserFriendly is used in HttpsError or toHttpsError to ensure it is truly a user-caused error (`@blumintinc/blumint/warn-https-error-message-user-friendly`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule flags any use of `messageUserFriendly` when constructing an `HttpsError` (either via `new HttpsError({ ... })` or `toHttpsError(err, { ... })`).

It also attempts to trace variables and function return values that might contain `messageUserFriendly`.

## Rationale

The use of `messageUserFriendly` is an intentional speed bump to re-evaluate whether an error is truly user-caused. Misusing this property suppresses automated error monitoring and QA issue creation for real bugs.

BluMint's error monitoring systems often treat errors with user-friendly messages as "expected" user errors, which means they might not trigger alerts or incidents. If a real code defect is labeled with `messageUserFriendly`, it might go unnoticed.

This rule does not forbid usage, but requires developers to consciously decide and use `// eslint-disable-next-line` when appropriate.

## Examples

### Incorrect

```typescript
throw new HttpsError({
  code: 'already-exists',
  message: 'email-already-taken',
  details: `Your email is already connected to an existing ${owner.provider} account`,
  messageUserFriendly: USER_MESSAGE_EMAIL_ALREADY_CONNECTED,
});

throw toHttpsError(error, {
  code: 'unavailable',
  message: 'Third-party API failed',
  messageUserFriendly: USER_MESSAGE_SOMETHING_WENT_WRONG,
});

// Helper function returning messageUserFriendly
const getOptions = () => ({ messageUserFriendly: 'oops' });
new HttpsError(getOptions());
```

### Correct

```typescript
// For internal errors, do not use messageUserFriendly
throw new HttpsError({
  code: 'invalid-argument',
  message: 'toMilliseconds: missing date value',
});

// If the error is truly user-caused, acknowledge the warning
// eslint-disable-next-line @blumintinc/blumint/warn-https-error-message-user-friendly
throw new HttpsError({
  code: 'permission-denied',
  messageUserFriendly: USER_MESSAGE_NOT_AUTHORIZED,
});
```

## When to Use `// eslint-disable-next-line`

Use the disable comment only when the error is strictly caused by user action (e.g., invalid input, unauthorized access to their own data) and you want to provide a specific, translated message to the frontend while deliberately suppressing backend error alerts for this specific instance.
