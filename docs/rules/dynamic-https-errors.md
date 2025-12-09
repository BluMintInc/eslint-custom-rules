# Keep HttpsError messages static and put request context in the third argument (`@blumintinc/blumint/dynamic-https-errors`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule keeps Firebase `HttpsError` messages stable for monitoring while preserving rich debugging details. It enforces two constraints:

1. **Static messages in the second argument**: The message (second argument) is hashed to produce an error identifier. Dynamic content here fractures monitoring because every interpolation produces a different hash.
2. **Context in the third argument**: Every `HttpsError` call must pass a third `"details"` argument so request-specific context is available without altering the hashed identifier.

## Rule Details

### Why this rule matters

- Dynamic message strings explode the number of error ids, making it hard to group and alert on recurring issues.
- Omitting the third argument hides the request context needed to debug and nudges developers to stuff variables into the hashed message.
- Keeping the message static while passing details separately yields stable identifiers and actionable logs.

### How to fix

- Keep the second argument a constant string that describes the error type.
- Put interpolated or request-specific values (ids, emails, payload snippets) in the third argument as an object or string.

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
