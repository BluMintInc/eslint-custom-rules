# Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields (`@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

Firestore treats nested objects in `DocSetter` payloads as whole sub-document writes. If you pass `{ roles: { contributor: ... } }` to `set()` or `updateIfExists()`, Firestore replaces the entire `roles` map and can silently drop siblings the payload did not include. FieldValue helpers (`arrayUnion`, `increment`, etc.) also expect dotted field paths for nested updates. This rule requires FieldPath (dot) notation so DocSetter only touches the intended leaf fields and avoids data loss during partial updates.

### What This Rule Checks

- `DocSetter.set()` payloads that contain nested object literals
- `DocSetter.updateIfExists()` payloads that contain nested object literals

### What This Rule Ignores

- `DocSetter.overwrite()` calls because they intentionally replace the whole document
- Object literals that are already flattened with dotted keys
- Dynamic/computed/spread constructions where safe auto-flattening is ambiguous
- Arrays of objects (Firestore cannot target nested array members with FieldPath keys)

## Examples

### ❌ Incorrect

These payloads send nested objects, so Firestore treats each nested map as a single value and can overwrite siblings that are not present in the payload.

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

Flattening nested fields into FieldPath keys targets only the intended leaves and keeps other data in the nested maps intact.

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
