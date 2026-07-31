# Keep HttpsError messages static and move request-specific details to the third argument so error identifiers remain stable and debugging context is preserved (`@blumintinc/blumint/dynamic-https-errors`)

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

### Examples of **incorrect** code for this rule:

#### Missing details

The positional signature reports `missingThirdArgument`; the object-based signature reports `missingDetailsProperty`, or `missingDetailsDueToSpread` when an object spread prevents static verification that `details` is present, or `unexpectedExtraArgumentForObjectCall` when the object signature is given more than one argument.

```typescript
// Missing third argument
throw new HttpsError('invalid-argument', 'No orderBy found');
throw new https.HttpsError('permission-denied', 'Access denied');
throw new HttpsError('not-found', 'Resource not found');
```

```typescript
// Object-based signature without a details property
new HttpsError({
  code: 'unauthenticated',
  message: 'User must be authenticated',
});
```

```typescript
// Object-based calls must have exactly one argument
throw new HttpsError({
  code: 'not-found',
  message: 'Resource not found',
  details: { id: resourceId },
}, 'extra-arg');
```

```typescript
// An object spread prevents static verification that "details" is present
throw new HttpsError({
  ...config,
  code: 'not-found',
  message: 'Resource not found',
});
```

#### Dynamic content in the message

All of these report `dynamicHttpsErrors`.

```typescript
// Template literal with interpolation in the second argument
throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');
throw new HttpsError('foo', `Error: ${bar}`, 'baz');
throw new https.HttpsError('permission-denied', `User ${userId} cannot access`, {
  path,
});
```

```typescript
// Other dynamic forms
throw new HttpsError('foo', getErrorMessage(), { id: resourceId });
throw new HttpsError('foo', condition ? 'A' : 'B', { id: resourceId });
throw new HttpsError('foo', someVar || 'default', { id: resourceId });
```

```typescript
// The message property of the object-based signature is checked the same way
new HttpsError({
  code: 'unauthenticated',
  message: `User ${userId} must be authenticated`,
  details: { userId },
});
```

#### Both defects at once

```typescript
// Dynamic message AND missing third argument
throw new HttpsError('foo', `Error: ${bar}`);
```

### Examples of **correct** code for this rule:

#### Positional signature

```typescript
// Static message with contextual details in the third argument
throw new HttpsError('invalid-argument', 'No orderBy found', { afterData, scoreOptions });
throw new https.HttpsError('permission-denied', 'Access denied', { userId, resource });
throw new HttpsError('not-found', 'Resource not found', { id: resourceId });
```

```typescript
// Only the message is hashed, so the details argument may itself be dynamic
throw new https.HttpsError('foo', 'bar', 'baz');
throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);
throw new https.HttpsError('permission-denied', 'User cannot access', {
  path,
  userId,
});
```

#### Object-based signature

```typescript
new HttpsError({
  code: 'unauthenticated',
  message: 'User must be authenticated',
  details: { userUid: 'guest' },
});
```

#### With TypeScript assertions

The message is unwrapped through `as`, `satisfies`, `!`, and angle-bracket assertions before it is checked, so an asserted string literal is still static.

```typescript
throw new HttpsError('invalid-argument', 'Static message' as const, { details });
```

```typescript
new HttpsError({
  code: 'unauthenticated',
  message: 'User must be authenticated' satisfies string,
  details: { userUid: 'guest' },
});
```

## Why?

The second argument of `HttpsError` is used to generate a unique ID for error monitoring and tracking. Including dynamic content in this field produces different IDs for the same error shape, making aggregation and monitoring ineffective.

The third argument should contain all dynamic context information that helps with debugging while preserving the error's unique identifier.

### Warnings & Considerations

- Do not include PII in the second argument; keep the second argument stable and generic.
- Keep third-argument context small and serializable; avoid dumping large nested objects.
- Prefer explicit identifiers in the second argument (e.g., `OrderNotFound`) over prose.
- For exceptional one-off errors, use an inline disable with a comment explaining why.
