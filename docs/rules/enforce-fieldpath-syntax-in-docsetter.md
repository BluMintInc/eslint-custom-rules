# Enforce the use of Firestore FieldPath syntax when passing documentData into DocSetter. Instead of using nested object syntax, developers should use dot notation for deeply nested fields (`@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

When you pass nested objects in a `DocSetter` payload, Firestore treats each nested map as a whole sub-document write. If you pass `{ roles: { contributor: ... } }` to `set()` or `updateIfExists()`, Firestore replaces the entire `roles` map and can silently drop sibling fields you leave out. FieldValue helpers (`arrayUnion`, `increment`, etc.) expect dotted field paths for nested updates. This rule requires FieldPath (dot) notation so your DocSetter calls touch only the intended leaf fields and you avoid data loss during partial updates.

### What This Rule Checks

- `DocSetter.set()` payloads that contain nested object literals
- `DocSetter.updateIfExists()` payloads that contain nested object literals

The receiver must be provably a `DocSetter`: either a variable initialized with `new DocSetter(...)` in the same file, or a chained `new DocSetter(...).set(...)`. A `set()` call on a receiver of unknown origin is left alone, which is why every example below constructs its own setter.

### What This Rule Ignores

- `DocSetter.overwrite()` calls because they intentionally replace the whole document
- Object literals that are already flattened with dotted keys
- Dynamic/computed/spread constructions where safe auto-flattening is ambiguous
- Arrays of objects (Firestore cannot target nested array members with FieldPath keys)
- Payloads whose top-level keys include numeric literals (these often model array-like buckets; the rule skips them entirely to avoid unsafe fixes that could drop those entries)

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
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  id: tournamentId,
  metadata: { createdAt: new Date(), updatedBy: userId },
});
```

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
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
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  id: tournamentId,
  'metadata.createdAt': new Date(),
  'metadata.updatedBy': userId,
});
```

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.updateIfExists({
  id: tournamentId,
  'player.stats.score': 100,
});
```

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// This is allowed - overwrite replaces the entire document
await docSetter.overwrite({
  id: tournamentId,
  roles: { contributor: FieldValue.arrayUnion(contributorId) },
});
```

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// This is allowed - already using FieldPath syntax
await docSetter.set({
  id: tournamentId,
  'roles.contributor': FieldValue.arrayUnion(contributorId),
});
```

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
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
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// This will NOT be flagged
const data = { id: tournamentId };
data.roles = { contributor: FieldValue.arrayUnion(contributorId) };
await docSetter.set(data);
```

### Arrays of Objects

Firestore does not support FieldPath notation inside arrays of objects, so these are ignored:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// This will NOT be flagged
await docSetter.set({
  id: tournamentId,
  players: [{ id: 'player1', score: 10 }],
});
```

### Exception for Overwrite Operations

The `overwrite` method replaces the entire document, so FieldPath syntax is not required:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// This will NOT be flagged
await docSetter.overwrite({
  id: tournamentId,
  roles: { contributor: FieldValue.arrayUnion(contributorId) },
});
```

### Keys requiring quotes

When keys contain characters that are not valid identifiers (like dots), the auto-fixer quotes them:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
// Nested key with dot becomes quoted field path
await docSetter.set({
  'app.config': { version: 1 } // Becomes 'app.config.version': 1
});
```

### Method Shorthand

A function-valued field is flattened the same way whichever spelling it uses. A method shorthand carries no `function` keyword and its parameter list is where the value's own text begins, so the fix writes the keyword back — including `async` and the generator `*`, which sit ahead of the key:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  handlers: { async onDone() { await notify(); } },
  // Becomes 'handlers.onDone': async function () { await notify(); }
});
```

A getter or setter is left alone instead: its body runs on access rather than holding a value, so no FieldPath entry can carry it. A method referencing `super` is left alone too, because `super` resolves through the enclosing object literal and a function expression has nothing for it to resolve through.

### Indentation of the relocated value

Flattening lifts a nested value out to its parent's column. A multi-line value carries the indentation of the depth it was written at, so every line after the first is shifted by the same amount — the landing column minus the column the value opened at — which moves the span while preserving the nesting inside it:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  handlers: {
    *onDone() {
      yield 1;
    },
  },
});
// Becomes:
// await docSetter.set({
//   'handlers.onDone': function* () {
//     yield 1;
//   },
// });
```

Two kinds of line are left exactly where they are, because their leading whitespace is content rather than layout:

- lines inside a multi-line template literal, where the indentation is part of the string's value
- the interior of a block comment that is not `*`-aligned, where the indentation is part of the prose

A `*`-aligned block comment is realigned along with the code it is attached to. A span whose indentation mixes tabs and spaces with the landing column has no delta expressible as whitespace, so it is left at its original depth rather than being rewritten with a guessed tab width.

### Comments on a flattened property

Every comment inside a flattened property survives the rewrite, and each one takes exactly one of two routes. A comment between nested properties is hoisted above the flattened entry, because the nested object it sat in disappears. A comment inside a relocated value travels with that value's copied text, staying attached to the statement it documents:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  handlers: {
    // hoisted above the entry
    onDone() {
      // travels with the body
      return 1;
    },
  },
});
// Becomes:
// await docSetter.set({
//   // hoisted above the entry
//   'handlers.onDone': function () {
//     // travels with the body
//     return 1;
//   },
// });
```

### Mixed Nesting

You can mix already-flattened paths with nested objects:

```javascript
const docSetter = new DocSetter<Tournament>(tournamentRef.parent);
await docSetter.set({
  'profile.name': 'John',
  settings: { theme: 'dark' } // Becomes 'settings.theme': 'dark'
});
```

## Auto-fix

This rule provides automatic fixes that convert nested object syntax into FieldPath syntax. The auto-fix will:

1. Flatten nested objects into dot notation keys
1. Quote keys that contain dots
1. Rewrite only the properties that need flattening, so every other property keeps its position, its comments, and its indentation byte-for-byte
1. Carry every comment inside a flattened property through to the rewrite exactly once — hoisted above the entry when it sits between nested properties, carried along with the value when it sits inside one — which keeps `eslint-disable-next-line` directives covering the code they were written for
1. Re-emit a method shorthand as a function expression, since a FieldPath key needs a value in expression position
1. Re-indent the relocated value to the column it lands in, so the fix is already formatted the way Prettier would print it
1. Decline to rewrite a nested property that cannot be flattened losslessly — one containing a spread, a computed key, an accessor, a method referencing `super`, or nothing at all. The violation is still reported so you can flatten it by hand instead of receiving a fix that drops payload fields.

## When Not to Use

You might want to disable this rule if:

- You're working with legacy code that cannot be easily migrated
- You have specific use cases where nested object syntax is required
- You're using `DocSetter.overwrite()` exclusively (though the rule already ignores this method)
