# Enforce the use of Timestamp.now() for getting the current timestamp in backend code. This rule prevents using alternatives like Timestamp.fromDate(new Date()) or other date creation patterns that could lead to inconsistency (`@blumintinc/blumint/enforce-timestamp-now`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Firestore timestamps should originate from the Firestore SDK instead of the local JavaScript clock. Converting `new Date()` or `Date.now()` into a `Timestamp` uses the machine clock, which can drift across servers, cold starts, or developer machines. That drift produces inconsistent audit fields and undermines Firestore server timestamp semantics. This rule flags backend code in `functions/src/` that builds Firestore timestamps from JS `Date` values instead of calling `Timestamp.now()`. Test files are ignored.

## Rule Details

- Reports `Timestamp.fromDate(new Date())`, `Timestamp.fromMillis(Date.now())`, and direct `new Date()` assignments to timestamp-like variables.
- Auto-fixes replace the flagged expression with the detected `Timestamp` alias' `now()` call.
- A `new Date()` binding is only reported when **every** use of it survives the rewrite. `Timestamp` shares almost none of `Date`'s surface, so a binding that calls `getTime()`, `setDate()`, `toLocaleDateString()`, `toISOString()` or any other `Date`-only member would stop compiling the moment the initializer becomes `Timestamp.now()`. The uses that qualify are the ones `Timestamp` declares with matching meaning: `toDate()`, `toMillis()`, `isEqual()`, `seconds` and `nanoseconds`.
  - `valueOf()` and `toString()` do not qualify even though `Timestamp` declares them: `Timestamp#valueOf()` returns an encoded `string` where `Date#valueOf()` returns a `number`, and the string form renders `Timestamp(seconds=…, nanoseconds=…)` rather than a date. Those call sites keep compiling while the value silently changes.
  - A use that leaves the declaration — passed as an argument, returned, compared, interpolated, reassigned, read through a computed member access — does not qualify either, because the type it flows into is invisible to a rule that does not use type information. Converting a `Date` argument to a `Timestamp` one produces TS2345, and converting an annotated return produces TS2322.
  - Declining is silent rather than a report without a fix. The variable-name heuristic cannot tell a stored Firestore field from an age calculation or a formatted label, so a report on those is a plain false positive, and the message's only remedy is the very rewrite that was just ruled unsafe.
- A bare `new Date()` is only reported when a Firestore `Timestamp` import (static or dynamic, under either `firebase-admin/firestore` or `firebase/firestore`) is in scope at that point. The rewrite names an identifier the source never mentions, so without a binding it would emit an unbound `Timestamp`; a file with no Firestore import is also unlikely to be building a Firestore document at all. `Timestamp.fromDate(...)` and `Timestamp.fromMillis(...)` are unaffected by this gate because they rewrite an identifier the source already binds.
  - The import has to bind `Timestamp` as a **value**. A type-only binding — `import type { Timestamp } from 'firebase-admin/firestore'` or the inline `import { type Timestamp }` — is erased before emit, so a rewrite naming it produces TS1361 (`'Timestamp' cannot be used as a value because it was imported using 'import type'`). Only the type-only specifier is disqualified: `import { type DocumentData, Timestamp }` still authorizes the rewrite.

### Examples of **incorrect** code for this rule:
```ts
import { Timestamp } from 'firebase-admin/firestore';

const createdAt = Timestamp.fromDate(new Date());
const expiresAt = Timestamp.fromMillis(Date.now());
const timestamp = new Date();
```

### Examples of **correct** code for this rule:
```ts
import { Timestamp } from 'firebase-admin/firestore';

const createdAt = Timestamp.now();
const { Timestamp: FirestoreTimestamp } = await import('firebase-admin/firestore');
const updatedAt = FirestoreTimestamp.now();

// Allowed when mutating a Date for a scheduled time
const future = new Date();
future.setDate(future.getDate() + 30);
const readyAt = Timestamp.fromDate(future);
```

A `Date` the surrounding code actually treats as a `Date` is left alone, because `Timestamp` cannot answer those calls.

```ts
// File: functions/src/util/formatDate.ts
import { Timestamp } from 'firebase-admin/firestore';

export const startedAt = Timestamp.now();

export function label() {
  const now = new Date();
  return now.toLocaleDateString();
}

export function elapsedSince(start: Date) {
  const now = new Date();
  return now.getTime() - start.getTime();
}
```

A file with no Firestore `Timestamp` import keeps its plain `Date` usage too: rewriting it would reference a name the file never binds.

```ts
// File: functions/src/util/formatDate.ts
export function label() {
  const now = new Date();
  return now.toLocaleDateString();
}
```

A file whose only `Timestamp` import is type-only is treated the same way, because the name it binds exists solely in type space and cannot be the receiver of a `now()` call.

```ts
// File: functions/src/util/date/Dates.ts
import type { Timestamp } from 'firebase-admin/firestore';

export function isExpired(deadline: Timestamp) {
  const now = new Date();
  return deadline.toMillis() < now.getTime();
}
```

## When Not To Use It

- You intentionally rely on a JS `Date` that differs from Firestore server time (for example, reproducible fixtures).
- You convert a mutated `Date` object to `Timestamp` and prefer not to allow auto-fix for that case (the rule already leaves such bindings alone, but you can disable the rule around special cases).

## Further Reading

- [Firestore Timestamps](https://firebase.google.com/docs/firestore/manage-data/data-types#timestamps)
