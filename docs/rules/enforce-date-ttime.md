# Enforce that any generic type parameter named TTime is explicitly set to Date in frontend code (`@blumintinc/blumint/enforce-date-ttime`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce that any generic type parameter named `TTime` is explicitly set to `Date` in frontend code.

## Rationale

Our Firestore converters automatically translate `Timestamp` to `Date` on the client. Leaving `TTime` unspecified (which usually defaults to `Timestamp`) forces defensive, unnecessary type checks and conversions in frontend code. By requiring `TTime = Date`, frontend types stay accurate and code stays clean.

- Prevents `Timestamp`/`Date` ambiguity in frontend code.
- Reinforces the Firestore Frontend Hooks contract.
- Reduces type-safe workarounds like `instanceof Timestamp` usage.
- Keeps frontend type definitions aligned with actual runtime values.

## Examples

The rule resolves the referenced type and looks for a type parameter literally named `TTime`, so both examples declare the types they reference. A name that resolves to something else — an ambient global such as the DOM's `Notification`, for instance — carries no `TTime` parameter and is left alone.

### Incorrect

```typescript
// File: src/types/notifications.ts
type Timestamp = { seconds: number; nanoseconds: number };
interface Notification<TTime = Timestamp> {
  createdAt: TTime;
}
type PendingWalletToken<TType extends string, TTime = Timestamp> = {
  type: TType;
  updatedAt: TTime;
};

// BAD: defaults to Timestamp (incorrect for client)
type NotificationDefaulted = Notification;

// BAD: explicitly set to Timestamp
type NotificationStamped = Notification<Timestamp>;

// BAD: set to a union or alias
type NotificationUnion = Notification<Date | null>;
```

### Correct

```typescript
// File: src/types/notifications.ts
type Timestamp = { seconds: number; nanoseconds: number };
interface Notification<TTime = Timestamp> {
  createdAt: TTime;
}
type PendingWalletToken<TType extends string, TTime = Timestamp> = {
  type: TType;
  updatedAt: TTime;
};

// GOOD: explicit Date
type NotificationDate = Notification<Date>;

// GOOD: explicit Date for TTime in any position
type WalletDoc = PendingWalletToken<'offchain', Date>;
```

### Fixer behavior

The fixer supplies the missing `Date` argument, or overwrites the one that is not `Date`. Overwriting deletes every name the argument mentions, and that argument is often the only reference to the alias it names. Dropping it alone would leave the alias bound to nothing, so a file that lints clean would fail `@typescript-eslint/no-unused-vars` afterwards — with a violation this rule cannot report, because its own finding is resolved by the fix. The rewrite and anything it orphans therefore go as a single fix:

```ts
// Before: the argument is the only consumer of the Time import
import { Time } from './time';

type Doc = Notification<Time>;

// After: the import goes with the argument it bound
type Doc = Notification<Date>;
```

Two limits keep the fix safe rather than clever:

- **Every argument rewritten in the same pass is weighed together.** An alias two rewritable arguments share is unbound once both of them go, even though neither is its last consumer on its own, so the rewrites ship as one fix rather than a rewrite at a time. An argument whose report is suppressed stays out of that reckoning: it keeps its argument, so it keeps the binding alive. Suppression is resolved before the batch is formed, because a rule cannot otherwise see `eslint-disable` — directives are applied to reports after they are emitted, and assuming a suppressed sibling will also be rewritten would delete an import the surviving argument still references, trading an unused import for a type bound to nothing.
- **A binding that cannot be unbound cleanly cancels that argument's fix.** The report then carries no fixer, and you resolve it by hand — by dropping the declaration or by using it. This covers a locally declared `type` alias or `interface`, a value declaration the rewritten argument was the last to read (a `const` or a `function` alike, since a declaration's own initializer does not count as a use of it), an import behind a `// eslint-disable-next-line` or `@ts-expect-error` directive, a comment sitting among the specifiers, and a name another binding shadows. Such an argument drops out of the batch without taking its siblings' fixes with it; only when the batch as a whole would orphan something unrewritable — two arguments sharing a local declaration, say — is the fix declined for all of them.

```ts
// The alias is declared here and named nowhere else, so the argument stays as
// written and the report is left for you: deleting a declaration is your call.
type Time = Date;

type Doc = Notification<Time>;
```

The enclosing declaration's own type parameter is treated the same way, for a second reason as well: hard-coding a pass-through argument leaves the parameter unread by the body it was declared for — reported by `@typescript-eslint/no-unused-vars` and by `tsc --noUnusedParameters` alike — and leaves callers an argument that no longer means anything. The use sites are still fixed, and `UserDoc<Date>` already forwards `Date`:

```ts
// Reported, not rewritten: TTime is UserDoc's only link between its callers
// and Notification.
type UserDoc<TTime = Timestamp> = Notification<TTime>;

// Fixed, because UserDoc<Date> resolves createdAt to Date on its own.
const doc: UserDoc<Date> = load();
```

An alias that is exported, or still named elsewhere in the file, keeps its declaration and its autofix — nothing is orphaned by the rewrite.

## When to Use This Rule

This rule should be applied to frontend code (e.g., `src/**`) via ESLint overrides. It is not intended for backend code where `Timestamp` is the appropriate default.
