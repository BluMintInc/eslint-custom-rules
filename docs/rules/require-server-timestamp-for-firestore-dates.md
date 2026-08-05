# Enforce serverTimestamp() instead of new Date() for Firestore timestamp fields (`@blumintinc/blumint/require-server-timestamp-for-firestore-dates`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Enforce `serverTimestamp()` instead of `new Date()` for Firestore timestamp fields.

## Rule Details

When a frontend object is declared with a type imported from
`functions/src/types/firestore/**`, any property value of `new Date()` is
flagged. Client clocks are unreliable — they can be incorrect, skewed, or
deliberately manipulated — which causes data integrity and ordering problems in
Firestore queries. Firebase's `serverTimestamp()` sets the timestamp on the
server at write time, providing a consistent and tamper-proof source of truth.

### Why this matters

- **Data integrity**: Timestamps are used for sorting and filtering across the
  platform (notifications, token creation dates, tournament scheduling).
  Incorrect client-side timestamps cause documents to appear out of order or
  be excluded from time-based queries.
- **Security**: Server timestamps cannot be spoofed by clients, preventing
  backdating or future-dating of documents.
- **Consistency**: Users span many time zones and device types with varying
  clock accuracy. A single authoritative source eliminates variance.
- **Audit trail**: Server timestamps provide reliable creation/modification
  times for compliance and debugging.

### Detection approach

The rule works purely syntactically — no TypeScript project configuration is
required. It:

1. Collects every type name imported from a path matching the configured
   `firestoreTypePaths` globs (absolute or relative).
2. Flags `new Date()` appearing as a property value (at any depth) inside an
   object literal whose declared type references one of those names — via a
   variable annotation, an `as`/`satisfies` cast, or a typed function return.
3. Also looks through `as any` / `as Timestamp` casts applied to `new Date()`,
   and through a non-null assertion — `new Date()!` and `new Date()! as Timestamp`
   are flagged too. A non-null assertion changes only the static type, and it is
   what a developer reaches for when silencing a nullability complaint, so
   leaving it unwrapped would turn an accident into a bypass.
4. Sees through assertion wrappers on the object literal itself. `as const`,
   `satisfies`, non-null assertions, and chained assertions are runtime no-ops, so
   `{ createdAt: new Date() } as const` still stamps the document with the
   client clock and is still flagged. This matters because
   `enforce-object-literal-as-const` appends `as const` automatically via
   `--fix`, so the wrapper appears without anyone writing it.

A literal reached by both an annotation and a Firestore-typed `as` cast is
reported once, not once per entry point.

The rule is conservative by design: it only fires when a Firestore type
annotation is visible in the same file. No false positives for objects that
have no Firestore type connection.

### Examples of incorrect code

```typescript
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';
import type { Advancement } from 'functions/src/types/firestore/Advancement';

// Variable annotation
const draftMetadata: TokenMetadata<'offchain', Date> = {
  id: tokenEncoded,
  createdAt: new Date(), // flagged
};

// `as` cast on the object
const advancement = {
  id,
  createdAt: new Date() as any, // flagged — cast doesn't hide the violation
} as Advancement<Date>;

// Function return type annotation
function buildToken(): TokenMetadata<'offchain', Date> {
  return {
    id: 'abc',
    createdAt: new Date(), // flagged
  };
}

// `as const` is a runtime no-op — it does not hide the violation
const draft: TokenMetadata<'offchain', Date> = {
  id: tokenEncoded,
  createdAt: new Date(), // flagged
} as const;

// ...including on a concise arrow body, the shape `enforce-object-literal-as-const`
// produces automatically
const buildAdvancement = (): Advancement<Date> => ({
  id,
  createdAt: new Date(), // flagged
} as const);
```

### Examples of correct code

```typescript
import type { TokenMetadata } from 'functions/src/types/firestore/TokenMetadata';

// Use serverTimestamp() from firebase/firestore
const draftMetadata: TokenMetadata<'offchain', Date> = {
  id: tokenEncoded,
  createdAt: serverTimestamp(), // ok
};

// Use firebaseFirestoreModule.serverTimestamp() in a useDocUpdate callback
await updateDraftDoc(({ firebaseFirestoreModule }) => ({
  createdAt: firebaseFirestoreModule.serverTimestamp(), // ok
}));

// new Date() is fine when not inside a Firestore-typed object
const now = new Date(); // ok — not in a Firestore-typed object

// Seeing through `as const` does not widen the rule: an object with no
// Firestore type connection stays untouched
const uiDefaults = { id: 'a', createdAt: new Date() } as const; // ok
```

## Options

```typescript
interface Options {
  /**
   * Import-path globs that identify Firestore types.
   * @default ['functions/src/types/firestore/**']
   */
  firestoreTypePaths?: string[];

  /**
   * Glob patterns for files where this rule applies.
   * @default ['src/**']
   */
  targetPaths?: string[];

  /**
   * Skip *.test.ts, *.spec.ts, __tests__/, and __mocks__/ files.
   * Test files legitimately use new Date() for predictable mock data.
   * @default true
   */
  ignoreTestFiles?: boolean;
}
```

### Example configuration

```javascript
// .eslintrc.js
{
  rules: {
    '@blumintinc/blumint/require-server-timestamp-for-firestore-dates': [
      'error',
      {
        firestoreTypePaths: ['functions/src/types/firestore/**/*'],
        targetPaths: ['src/**/*.ts', 'src/**/*.tsx'],
        ignoreTestFiles: true,
      }
    ]
  }
}
```

## Disabling the rule

When `new Date()` is intentionally used (rare), disable with an explanation:

```typescript
// eslint-disable-next-line @blumintinc/blumint/require-server-timestamp-for-firestore-dates -- local UI state only, serverTimestamp used on persist
createdAt: new Date(),
```

## When not to use this rule

Disable the rule for backend Functions code (`functions/src/**`) or any context
where server-side timestamp semantics differ from frontend Firestore writes.
