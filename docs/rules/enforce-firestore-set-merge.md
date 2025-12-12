# Enforce using set() with { merge: true } instead of update() for Firestore operations to ensure consistent behavior. The update() method fails if the document does not exist, while set() with { merge: true } creates the document if needed and safely merges fields, making it more reliable and predictable (`@blumintinc/blumint/enforce-firestore-set-merge`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`update()` fails when a document is missing, leading to brittle writes and hard-to-reproduce errors. `set(..., { merge: true })` safely creates or updates documents and merges fields predictably. This rule replaces Firestore `update()` calls (including `updateDoc`, transaction updates, and batchManager updates) with `set`/`setDoc` plus `{ merge: true }`.

## Rule Details

This rule reports when:

- A Firestore `update()` or `updateDoc()` call is used instead of `set(..., { merge: true })`.
- A transaction or batch manager uses `update` without merge.
- A `set()`/`setDoc()` call omits the `{ merge: true }` option when it is acting on a Firestore reference.

The rule ignores:

- `set`/`setDoc` calls that already include `{ merge: true }`.
- Non-Firestore `update` methods (e.g., `createHash().update()`).

### Examples of **incorrect** code for this rule:

```ts
await docRef.update({ name: 'Ada' });
await updateDoc(docRef, { active: true });
await transaction.update(userRef, { visits: visits + 1 });
batchManager.batch.update({ ref: docRef, data: { score: 10 } });
```

### Examples of **correct** code for this rule:

```ts
await docRef.set({ name: 'Ada' }, { merge: true });
await setDoc(docRef, { active: true }, { merge: true });
await transaction.set(userRef, { visits: visits + 1 }, { merge: true });
batchManager.batch.set({ ref: docRef, data: { score: 10 }, merge: true });
```

## Options

This rule does not have any options.

## When Not To Use It

- Migration scripts that intentionally want `update()` to throw when the document is missing.
- Code paths that must enforce a strict existing-document contract and handle the error explicitly; disable locally for those cases.
