# Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. All HttpsError constructor calls must include a third argument for contextual details (`@blumintinc/blumint/dynamic-https-errors`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces two important requirements for `HttpsError` constructor calls:

1. **No dynamic content in the message field**: Template literals and dynamic content should not be used in the second argument (message field) of the `HttpsError` constructor, as this field is hashed to produce a unique identifier for error monitoring.

2. **Required third argument**: All `HttpsError` constructor calls must include a third argument for contextual details that aids in debugging.

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

The second argument of `HttpsError` is used to generate a unique identifier for error monitoring and tracking. Including dynamic content in this field would result in different identifiers for what should be considered the same type of error, making it difficult to aggregate and monitor errors effectively.

The third argument should contain all dynamic context information that helps with debugging while preserving the error's unique identifier.
