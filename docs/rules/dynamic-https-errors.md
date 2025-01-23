# Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id (`@blumintinc/blumint/dynamic-https-errors`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule warns against the use of template literals in the `message` field of the `HttpsError` constructor, and suggests their use in the `details` field instead.

## Rule Details

Examples of **incorrect** code for this rule:

```typescript
throw new https.HttpsError('foo', `Error: ${bar}`, 'baz');
throw new HttpsError('foo', `Error: ${bar}`, 'baz');
```

Examples of **correct** code for this rule:

```typescript
throw new https.HttpsError('foo', 'bar', 'baz');
throw new https.HttpsError('foo', 'bar', `Details: ${baz}`);
```