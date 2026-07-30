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

### Autofix

- Rewrites a method call in place — only the method name and the tail of the argument list change — so the arguments keep their formatting and their comments. A comment inside a call is often an `eslint-disable` directive, and dropping one silently re-enables the rule it suppresses.
- Binds `setDoc` as part of the same edit that emits it. `updateDoc(ref, data)` becomes `setDoc(ref, data, { merge: true })`, which needs `setDoc` in scope, so the import edit and the call rewrite ship as one fix: they sit in disjoint ranges, and a multi-rule `--fix` that applied one without the other would leave the file with an unbound name.
- Renames the `updateDoc` entry — in `import { … } from 'firebase/firestore'` or in the object pattern of `await import('firebase/firestore')` — when the fix rewrites its last reference, so an alias disappears together with the reference that used it:

```ts
// before
import { updateDoc as modifyDoc } from 'firebase/firestore';
await modifyDoc(ref, { theme: 'dark' });

// after
import { setDoc } from 'firebase/firestore';
await setDoc(ref, { theme: 'dark' }, { merge: true });
```

- Adds `setDoc` alongside `updateDoc` instead when any other reference to `updateDoc` survives the pass, because a multi-rule `--fix` can drop a sibling violation's fix and strand that reference on a removed binding. An existing `firebase/firestore` import is extended rather than duplicated.
- Declines to fix when `setDoc` is already bound to something else, since the added import would collide with that declaration (TS2440/TS2300) and a narrower-scope shadow would rebind the emitted call to the local value with no diagnostic at all.

### Interaction with inline disable comments

The `setDoc` binding is added once per file, attached to the fix of the first
violation that is **not** suppressed by an inline `eslint-disable` directive.
Suppressing an individual call therefore never strands the remaining
`setDoc(...)` calls without their import — the file below is the result of
`--fix` on a file that imported only `updateDoc`:

```ts
import { updateDoc, setDoc } from 'firebase/firestore';

export async function saveTheme(ref) {
  // eslint-disable-next-line @blumintinc/blumint/enforce-firestore-set-merge
  await updateDoc(ref, { theme: 'dark' }); // left alone, and keeps updateDoc bound
}

export async function saveSize(ref) {
  await setDoc(ref, { fontSize: 14 }, { merge: true }); // fixed, and carries the import
}
```

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

## When Not To Use It

- Migration scripts that intentionally want `update()` to throw when the document is missing.
- Code paths that must enforce a strict existing-document contract and handle the error explicitly; disable locally for those cases.
