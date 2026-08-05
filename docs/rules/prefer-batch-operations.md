# Enforce using setAll() and overwriteAll() instead of multiple set() or overwrite() calls (`@blumintinc/blumint/prefer-batch-operations`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Repeated `DocSetter.set()` or `DocSetter.overwrite()` calls inside a loop, array callback, or `Promise.all()` create one Firestore write per document. That pattern slows down writes and can leave partial updates if any later call fails. `DocSetter.setAll()` and `DocSetter.overwriteAll()` batch the same documents into one grouped write with predictable latency and fewer network round trips.

When this rule fires, the lint message tells you where the repetition happens (for example, `for...of loop`, `map() callback`, or `Promise.all()`) and points to the matching batch method as the fix.

## Rule Details

- Flags multiple `DocSetter.set()` or `DocSetter.overwrite()` calls inside `for`/`for...of`/`for...in`/`while`/`do...while`, `forEach`/`map`/`filter`/`reduce` callbacks, and `Promise.all()` arrays.
- Skips mixed operations that cannot be batched together (for example, mixing `set()` with unrelated service calls) and multiple setter instances in the same loop.
- Ignores `Map.set()` because it is not a Firestore write.
- Single `set()`/`overwrite()` calls remain valid; the rule only cares about repeated calls that should be batched.

## Examples

### ❌ Incorrect

```ts
const setter = new DocSetter(collectionRef);

await Promise.all([
  setter.set(doc1),
  setter.set(doc2),
  setter.set(doc3),
]);
```

```ts
const setter = new DocSetter(collectionRef);

for (const doc of documents) {
  await setter.overwrite(doc);
}
```

Where the setter is constructed makes no difference — a setter built inside the
function that uses it is the same violation:

```ts
async function syncAll(documents) {
  const setter = new DocSetter(collectionRef);

  for (const doc of documents) {
    await setter.set(doc);
  }
}
```

### ✅ Correct

```ts
const setter = new DocSetter(collectionRef);

await setter.setAll([doc1, doc2, doc3]);
```

```ts
const setter = new DocSetter(collectionRef);
const docsNeedingOverwrite = documents.filter((doc) => doc.shouldOverwrite);

await setter.overwriteAll(docsNeedingOverwrite);
```

### ✅ Allowed patterns

```ts
const setter = new DocSetter(collectionRef);

await Promise.all([
  setter.set(doc),
  sendEmail(), // different operation type
]);
```

```ts
const seen = new Map();
items.forEach((item) => seen.set(item.id, true)); // Map.set() is allowed
```
