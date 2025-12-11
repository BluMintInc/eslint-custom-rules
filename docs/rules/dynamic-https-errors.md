# Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. All HttpsError constructor calls must include a third argument for contextual details (`@blumintinc/blumint/dynamic-https-errors`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces two important requirements for `HttpsError` constructor calls:

1. **No dynamic content in the message (second argument)**: Do not use template literals or any dynamic content in the second argument of `HttpsError`. This string is hashed to produce a stable unique ID for error monitoring.

2. **Required third argument**: All `HttpsError` constructor calls must include a third argument with contextual details to aid debugging.

## Rule Details

Examples of **incorrect** code for this rule:

```typescript
// Missing third argument
throw new HttpsError('invalid-argument', 'No orderBy found');
throw new https.HttpsError('permission-denied', 'Access denied');

// Dynamic content in second argument (message field)
throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');
throw new HttpsError('foo', `Error: ${bar}`, 'baz');

// Both issues: missing third argument AND dynamic content in message
throw new HttpsError('foo', `Error: ${bar}`);
```

**Missing third argument (messageId: `missingThirdArgument`)**

- ❌ Invalid:
  ```typescript
  throw new HttpsError('not-found', 'Resource not found');
  ```
- ✅ Valid:
  ```typescript
  throw new HttpsError('not-found', 'Resource not found', { id: resourceId });
  ```

**Dynamic message content (messageId: `dynamicHttpsErrors`)**

- ❌ Invalid:
  ```typescript
  throw new https.HttpsError('permission-denied', `User ${userId} cannot access`, {
    path,
  });
  ```
- ✅ Valid:
  ```typescript
  throw new https.HttpsError('permission-denied', 'User cannot access', {
    path,
    userId,
  });
  ```

Examples of **correct** code for this rule:

```typescript
// Static message with contextual details in third argument
throw new HttpsError('invalid-argument', 'No orderBy found', { afterData, scoreOptions });
throw new https.HttpsError('permission-denied', 'Access denied', { userId, resource });

// Static message with dynamic details in third argument
throw new https.HttpsError('foo', 'bar', 'baz');
throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);
throw new HttpsError('not-found', 'Resource not found', { id: resourceId });
```

## Why?

The second argument of `HttpsError` is used to generate a unique ID for error monitoring and tracking. Including dynamic content in this field produces different IDs for the same error shape, making aggregation and monitoring ineffective.

The third argument should contain all dynamic context information that helps with debugging while preserving the error's unique identifier.

### Warnings & Considerations

- Do not include PII in the second argument; keep the second argument stable and generic.
- Keep third-argument context small and serializable; avoid dumping large nested objects.
- Prefer explicit identifiers in the second argument (e.g., `OrderNotFound`) over prose.
- For exceptional one-off errors, use an inline disable with a comment explaining why.
