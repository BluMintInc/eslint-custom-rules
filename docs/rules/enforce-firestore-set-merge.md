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
- `update()` on a Realtime Database batch manager — see below.

It reports without fixing when the call is not the single-data-object form the
`set(data, { merge: true })` rewrite is valid for — the `update(field, value, …)`
varargs overload and the `update(data, precondition)` overload — see
[Call shapes the fix declines](#call-shapes-the-fix-declines).

### Realtime Database receivers

Realtime Database's batch manager is held under the same `batchManager` field
name as the Firestore one, so the field name alone does not identify a Firestore
write. `RealtimeBatchManager` supports no batched `set` at all: its positional
`update(path, data)` **is** the write path, and Realtime Database's `update`
already merges shallowly, which makes `{ merge: true }` meaningless there.
Rewriting such a call emits a method that does not exist (TS2339).

Two syntactic signals take a `batchManager.update(…)` call out of the rule's
scope. Either one is enough:

1. **The receiver resolves in-file to `RealtimeBatchManager`** — a field or
   variable initialized with `new RealtimeBatchManager()`, or a type annotation
   naming the class (`RealtimeBatchManager`, `Readonly<RealtimeBatchManager>`,
   `realtimeDb.RealtimeBatchManager`) on the field, the variable, or a
   constructor parameter, including one the constructor only forwards to
   `super()`. The initializer is read through the TypeScript wrappers that
   restate a value's type — `as T`, `satisfies T`, `!`, `<T>` — since none of
   them changes which class is constructed. A superclass declared in the same
   file counts too, since a subclass inherits the field, and it is resolved
   lexically from the `extends` clause outward through every enclosing statement
   container — a function body, a namespace, a static block, a switch case, or
   the module itself — under either the `class Base {}` or the
   `const Base = class {}` spelling, exported or not. The innermost declaration
   wins, so a nested class shadowing an outer one answers for the code below it.
   A value binding shadows the same way even when it declares no class: in a
   mixin factory `function build(Base) { class X extends Base {} }` the base is
   the parameter, so an outer class of that name proves nothing about `X` and
   the carve-out does not apply.
2. **The data argument is a primitive literal** — a boolean, number, string,
   template literal, or one of those behind an assertion. Firestore's update
   data is an object of field updates, so a primitive in that position proves the
   call is not Firestore's. This is the only evidence available to a subclass
   that inherits the field from another module. A call with no data argument has
   nothing in that position, so only signal 1 answers for it.

Evidence about a differently named member, or about a different class under the
`batchManager` name (`new BatchManager()`, however it is wrapped), exempts
nothing: those calls report and fix as before.

### Autofix

- Rewrites a method call in place — the method name, the argument list's separators and its tail change, never an argument's own text beyond the indentation a re-laid-out list shifts — so the arguments keep their comments. A comment inside a call is often an `eslint-disable` directive, and dropping one silently re-enables the rule it suppresses. When the appended option cannot ride the closing line — an argument already spans lines, or the widened call would overrun the print width — the whole list is re-broken one argument per line, closing at the column the call opened at, which is the layout the consumer's formatter prints.
- Keeps a comment between the last argument and the closing parenthesis exactly where it was written. One trailing the argument's line stays on that line and the option opens the next one, with the separator placed where the consumer's formatter prints it: between the argument and a line comment — after one it would be comment text, and the call would stop parsing — and after a block comment, which prettier prints before the comma; a comma the author wrote on the other side of a block comment is moved rather than doubled. A block comment forces no line break either, so a list whose break is held up by nothing else folds onto one line whenever the widened call fits the print width, and stays one argument per line when it does not. One on a line of its own keeps its neighbours: the option lands before it, so what it sat above it still sits above. A trailing `eslint-disable-next-line` (or `@ts-ignore`/`@ts-expect-error`) means the line that FOLLOWS it, and any emission there would hand `{ merge: true }` the suppression written for the closing line — so the fix is withheld and the report left, with the directive in view.
- Binds `setDoc` as part of the same edit that emits it. `updateDoc(ref, data)` becomes `setDoc(ref, data, { merge: true })`, which needs `setDoc` in scope, so the import edit and the call rewrite ship as one fix: they sit in disjoint ranges, and a multi-rule `--fix` that applied one without the other would leave the file with an unbound name.
- Renames the `updateDoc` entry — in `import { … } from 'firebase/firestore'` or in the object pattern of `await import('firebase/firestore')` — when the fix rewrites every reference to it, so an alias disappears together with the references that used it:

```ts
// before
import { updateDoc as modifyDoc } from 'firebase/firestore';
await modifyDoc(ref, { theme: 'dark' });

// after
import { setDoc } from 'firebase/firestore';
await setDoc(ref, { theme: 'dark' }, { merge: true });
```

- Adds `setDoc` alongside `updateDoc` instead when any reference to `updateDoc` survives the pass, because a multi-rule `--fix` can drop a sibling violation's fix and strand that reference on a removed binding. An existing `firebase/firestore` import is extended rather than duplicated.
- Declines to fix when `setDoc` is already bound to something else, since the added import would collide with that declaration (TS2440/TS2300) and a narrower-scope shadow would rebind the emitted call to the local value with no diagnostic at all. A `setDoc` imported from a *different* firestore entry point counts as something else: `firebase-admin`'s API is not the modular SDK's, so emitting the call against it would call another function.

### Call shapes the fix declines

`set` has exactly two parameters, `set(data, options)`, so appending
`{ merge: true }` is a valid rewrite of exactly one `update` call shape: the
single data object. `update` ships two further documented forms, and appending
to either emits broken code — one of them silently:

| Form | What the append emitted | Why it is wrong |
| --- | --- | --- |
| `ref.update(field, value, …)` | `ref.set('a.b', 1, { merge: true })` | `set` reads the field NAME as the document data, and everything past the second argument is a type error. |
| `ref.update(data, precondition)` | `ref.set(data, { exists: true }, { merge: true })` | `set` reads its second argument as `SetOptions`. A `Precondition` carries neither `merge` nor `mergeFields`, so the guard is dropped **and** the merge never applies — and a `set` without merge overwrites the whole document, deleting every field the partial update was not naming. |

The second one is the reason the fix is withheld rather than approximated: it
converts a guarded partial update into a full-document overwrite, exits 0, and
produces no diagnostic without type information.

The fix therefore fires only on the single-data-object form:

* `ref.update(data)` — exactly one argument, and it is not a string, a template
  literal, another primitive, or a `FieldPath` (`new FieldPath('a', 'b')`,
  `admin.firestore.FieldPath.documentId()`);
* `transaction.update(ref, data)`, `batch.update(ref, data)`,
  `bulkWriter.update(ref, data)` — exactly two, with the same test on the
  second;
* `updateDoc(ref, data)` — exactly two, with the same test on the second;
* `batchManager.update(ref, data)` — exactly two, since the descriptor object
  the rewrite builds carries no third argument anywhere.

A spread (`ref.update(...args)`) hides the argument count outright and declines
for the same reason.

Whether a receiver takes the reference first is read from its last camelCase
segment — `batch`, `writeBatch`, `bulkWriter`, `transaction`, `tx`, `txn`,
`trx`, `writer` — rather than from a substring, because a name that merely
*contains* one of those words is usually a document: `transactionRef` is a
document in a `transactions` collection, and its single argument is data. An
unrecognised receiver reads as a document, which is safe in both directions: its
one-argument calls still rewrite, since `update(data)` is the only valid reading
of a single argument on any of these receivers, and its two-argument calls
decline rather than gamble the precondition rewrite on a name. A receiver that
matches can still be a document — `const batch = db.collection('batches').doc(id)`
— so an object literal in the reference position withdraws the name's evidence
and the call declines: no batch or transaction passes a document's *data* where
its *reference* goes.

**The report stands in every declined case.** Suppressing it instead was
considered and rejected. Neither broken form has a mechanical `set` equivalent —
the varargs one has to be folded into an object literal by hand, and a
precondition has no `set` counterpart at all — but both are still genuine
`update()` uses that this rule exists to surface, and the author who wrote one
resolves it by converting the call or by opting out with a reviewable
`eslint-disable-next-line`. Suppressing would additionally hand the decision to
the receiver-name heuristic above: a batch this rule fails to recognise would
stop reporting a violation it can plainly see, which trades a declined **fix**
for an unenforced **rule**. Declining at the fixer keeps the finding and loses
only the automation.

### Indentation of the batch manager descriptor

A `batchManager` call is the one shape whose arguments are genuinely restructured rather than extended: `update(ref, data)` carries two positional arguments where `set` takes a single descriptor object. That object is emitted across several lines, so its body lands two columns deeper than the line the call opens on and its closing brace lands at that line's own column, at whatever depth the call sits:

```ts
// before
class Syncer {
  public sync(notificationRef, updates) {
    this.batchManager.update(notificationRef, updates);
  }
}

// after
class Syncer {
  public sync(notificationRef, updates) {
    this.batchManager.set({
      ref: notificationRef,
      data: updates,
      merge: true,
    });
  }
}
```

An argument that itself spans lines is relocated text, so it travels the same way: every line after its first is shifted by the difference between the column it opened at and the column it is emitted at, which moves the span while preserving the nesting inside it.

Three kinds of line are held back, because their leading whitespace is data rather than layout and shifting it would be a correctness defect rather than a formatting one: the interior of a multi-line template literal, that of a line-continued string, and that of a block comment whose continuation lines are not `*`-aligned — prose this fixer does not own, which prettier reproduces byte for byte. A `*`-aligned block is layout, and prettier realigns those stars to the comment's new column, so it moves. A span whose old and new indentation share no prefix (tabs against spaces) has no delta expressible as whitespace and is left where it was, rather than have the fix pick a tab width and rewrite the file's indentation style.

Because this is the one rewrite that rebuilds an argument list rather than editing it in place, it copies the receiver and the two arguments and nothing between them. A comment in one of those gaps — before the first argument, between the two, or after the last — has nowhere to go, and a dropped `eslint-disable` silently re-enables the rule it was suppressing. The fix is withheld there: the file is left byte-identical and keeps its report, so the call is restructured by hand with the comment in view. A comment *inside* the receiver or either argument travels with the text it annotates and is preserved, so only a comment in a gap declines.

### Retiring the `updateDoc` entry

The rewrite strips a reference. When it strips the LAST one, the entry it came
from has to go in the **same** fix — leaving it behind turns a file that lints
clean into one failing `no-unused-vars` and `noUnusedLocals`, and the report
that would have surfaced the problem is resolved by the very fix that caused it.

Retirement is not a per-report question, so it is not decided per report. Two
violations sharing one import each strip one reference, and only once both land
is the entry unreferenced; a report that removed it on its own would strand
whichever sibling fix a multi-rule `--fix` drops. One violation therefore owns
every rewrite that justifies the removal, and its siblings report without a fix:

```ts
// before
import { doc, updateDoc } from 'firebase/firestore';
await updateDoc(refA, { theme: 'dark' });
await updateDoc(refB, { fontSize: 14 });

// after
import { doc, setDoc } from 'firebase/firestore';
await setDoc(refA, { theme: 'dark' }, { merge: true });
await setDoc(refB, { fontSize: 14 }, { merge: true });
```

Removing the entry takes its separator with it, down to the whole declaration
when it was the only specifier. A comment caught in that span is **carried**
rather than deleted — and rather than being allowed to decide whether the
rewrite fires at all, which would be a comment changing the transform just the
same:

```ts
// before
import { doc, setDoc, /* keep */ updateDoc } from 'firebase/firestore';
await updateDoc(doc(db, 'users', id), { theme: 'dark' });

// after
import { doc, setDoc /* keep */ } from 'firebase/firestore';
await setDoc(doc(db, 'users', id), { theme: 'dark' }, { merge: true });
```

A carried line comment keeps a line of its own, or the entry moving up into its
place would be commented out. The one comment that cannot be carried is a
directive — `eslint-disable-next-line`, `@ts-expect-error`, `@ts-ignore` — whose
meaning **is** its position: re-emitting one retargets it. Those withhold the
whole fix and leave the report standing, since a report that stays unfixed costs
a manual edit where a mistargeted directive silences an unrelated line.

Nothing is retired while a reference survives — an entry read as a value, a
sibling call suppressed by an inline directive, or one the rule cannot rewrite
(spread arguments) all keep the binding, because an over-eager removal deletes
working code where a surviving specifier is merely inert.

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

The `admin.firestore()` handle below is load-bearing, not scaffolding. A receiver
written as a plain identifier carries no Firestore marker of its own, so the
file's handle is the evidence that proves one — see [Identifying a Firestore
receiver](#identifying-a-firestore-receiver). Drop the handle and three of these
four calls become unprovable receivers that the rule deliberately leaves alone,
so the block would stop demonstrating the violation it is here to show.

```ts
import * as admin from 'firebase-admin';
import { updateDoc } from 'firebase/firestore';

const db = admin.firestore();

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

```ts
import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';

export class MessageProcessor {
  protected readonly batchManager = new RealtimeBatchManager();

  protected setPulsate(path: string) {
    // Realtime Database: update() is the write path, and there is no set()
    this.batchManager.update(path, true);
  }
}

export class ReadMessageProcessor extends MessageProcessor {
  protected resetCount(path: string) {
    // A primitive data argument identifies the receiver on its own
    this.batchManager.update(path, 0);
  }
}
```

```ts
import { RealtimeBatchManager } from '../realtimeDb/RealtimeBatchManager';

export function buildProcessor() {
  // The base class is resolved from the `extends` clause outward, so nesting it
  // beside its subclass does not hide the evidence it carries
  class MessageProcessor {
    protected readonly batchManager = new RealtimeBatchManager();
  }

  class ReadMessageProcessor extends MessageProcessor {
    public markRead(path: string, counts: { unread: number }) {
      this.batchManager.update(path, counts);
    }
  }

  return ReadMessageProcessor;
}
```

### Identifying a Firestore receiver

A receiver written as a plain identifier (`someRef.update(…)`) carries no
Firestore marker in its name or in its call chain, so the file's own Firestore
handle stands as the evidence: a declaration initialized from `<x>.firestore()`.
The handle is looked up in every statement container enclosing the call — the
module body, function and arrow bodies, blocks, namespace bodies, class static
blocks and `switch` cases — and through an `export` wrapper, because where the
handle is written says nothing about the call that uses it. Both spellings below
report:

```ts
export const db = admin.firestore();
await someRef.update({ theme: 'dark' });
```

```ts
export async function saveTheme(someRef) {
  const db = admin.firestore();
  await someRef.update({ theme: 'dark' });
}
```

A name bound to something else (`const db = somethingElse()`), a handle declared
in a sibling scope that does not enclose the call, and a file carrying no such
handle at all each leave the receiver unproven, and the call is left alone.

## When Not To Use It

- Migration scripts that intentionally want `update()` to throw when the document is missing.
- Code paths that must enforce a strict existing-document contract and handle the error explicitly; disable locally for those cases.
