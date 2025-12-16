# Enforce the use of Timestamp.now() for getting the current timestamp in backend code. This rule prevents using alternatives like Timestamp.fromDate(new Date()) or other date creation patterns that could lead to inconsistency (`@blumintinc/blumint/enforce-timestamp-now`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Firestore timestamps should originate from the Firestore SDK instead of the local JavaScript clock. Converting `new Date()` or `Date.now()` into a `Timestamp` uses the machine clock, which can drift across servers, cold starts, or developer machines. That drift produces inconsistent audit fields and undermines Firestore server timestamp semantics. This rule flags backend code in `functions/src/` that builds Firestore timestamps from JS `Date` values instead of calling `Timestamp.now()`. Test files are ignored.

## Rule Details

- Reports `Timestamp.fromDate(new Date())`, `Timestamp.fromMillis(Date.now())`, and direct `new Date()` assignments to timestamp-like variables when a `Timestamp` import is present.
- Allows `Date` objects that are mutated before conversion (e.g., scheduling a future time) because those require the custom logic provided by the mutation.
- Auto-fixes replace the flagged expression with the detected `Timestamp` alias' `now()` call.

Examples of **incorrect** code for this rule:

```ts
import { Timestamp } from 'firebase-admin/firestore';

const createdAt = Timestamp.fromDate(new Date());
const expiresAt = Timestamp.fromMillis(Date.now());
const timestamp = new Date();
```

Examples of **correct** code for this rule:

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

## When Not To Use It

- You intentionally rely on a JS `Date` that differs from Firestore server time (for example, reproducible fixtures).
- You convert a mutated `Date` object to `Timestamp` and prefer not to allow auto-fix for that case (the rule already exempts mutated dates, but you can disable the rule around special cases).

## Further Reading

- [Firestore Timestamps](https://firebase.google.com/docs/firestore/manage-data/data-types#timestamps)
