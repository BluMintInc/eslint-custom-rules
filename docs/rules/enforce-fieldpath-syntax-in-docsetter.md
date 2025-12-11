# Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields (`@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces the use of Firestore FieldPath syntax when passing `documentData` into `DocSetter`. Instead of using nested object syntax, developers should use dot notation for deeply nested fields. This ensures consistency in Firestore updates and aligns with best practices for Firestore field path updates.

Firestore operations like `FieldValue.arrayUnion` and `FieldValue.increment` work more predictably with FieldPath notation, reducing potential issues with partial document updates. This rule improves maintainability, readability, and consistency in Firestore operations within the BluMint codebase.

### When This Rule Applies

This rule applies to:

- `DocSetter.set()` method calls
- `DocSetter.updateIfExists()` method calls

### When This Rule Does NOT Apply

This rule does not apply to:

- `DocSetter.overwrite()` method calls (since overwrite replaces the entire document)
- Dynamically constructed objects
- Array elements (Firestore does not support FieldPath notation within array objects)
- Properties that already use dot notation

## Examples

### ❌ Incorrect

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  id: tournamentId,
  roles: { contributor: FieldValue.arrayUnion(contributorId) },
});
```

```javascript
await docSetter.set({
  id: tournamentId,
  metadata: { createdAt: new Date(), updatedBy: userId },
});
```

```javascript
await docSetter.updateIfExists({
  id: tournamentId,
  player: { stats: { score: 100 } },
});
```

### ✅ Correct

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
```

```javascript
await docSetter.set({
  id: tournamentId,
  'metadata.createdAt': new Date(),
  'metadata.updatedBy': userId,
});
```

```javascript
await docSetter.updateIfExists({
  id: tournamentId,
  'player.stats.score': 100,
});
```

```javascript
// This is allowed - overwrite replaces the entire document
await docSetter.overwrite({
  id: tournamentId,
  roles: { contributor: FieldValue.arrayUnion(contributorId) },
});
```

```javascript
// This is allowed - already using FieldPath syntax
await docSetter.set({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
```

```javascript
// This is allowed - arrays of objects are not converted
await docSetter.set({
  id: tournamentId,
  players: [{ id: 'player1', score: 10 }],
});
```

## Edge Cases

### Dynamic Object Construction

The rule does not flag dynamically constructed objects, as transforming them automatically may be error-prone:

```javascript
// This will NOT be flagged
const data = { id: tournamentId };
data.roles = { contributor: FieldValue.arrayUnion(contributorId) };
await docSetter.set(data);
```

### Arrays of Objects

Firestore does not support FieldPath notation inside arrays of objects, so these are ignored:

```javascript
// This will NOT be flagged
await docSetter.set({
  id: tournamentId,
  players: [{ id: 'player1', score: 10 }],
});
```

### Exception for Overwrite Operations

The `overwrite` method replaces the entire document, so FieldPath syntax is not required:

```javascript
// This will NOT be flagged
await docSetter.overwrite({
  id: tournamentId,
  roles: { contributor: FieldValue.arrayUnion(contributorId) },
});
```

### Keys requiring quotes

When keys contain characters that are not valid identifiers (like dots), the auto-fixer quotes them:

```javascript
// Nested key with dot becomes quoted field path
await docSetter.set({
  'app.config': { version: 1 } // Becomes 'app.config.version': 1
});
```

### Mixed Nesting

You can mix already-flattened paths with nested objects:

```javascript
await docSetter.set({
  'profile.name': 'John',
  settings: { theme: 'dark' } // Becomes 'settings.theme': 'dark'
});
```

## Auto-fix

This rule provides automatic fixes that convert nested object syntax into FieldPath syntax. The auto-fix will:

1. Flatten nested objects into dot notation keys
2. Preserve the `id` property at the top-level
3. Quote keys that contain dots
4. Maintain proper formatting and indentation

## When Not to Use

You might want to disable this rule if:

- You're working with legacy code that cannot be easily migrated
- You have specific use cases where nested object syntax is required
- You're using `DocSetter.overwrite()` exclusively (though the rule already ignores this method)
