# Enforce using the standardized mockFirestore utility instead of manual Firestore mocking or third-party mocks. This ensures consistent test behavior across the codebase, reduces boilerplate, and provides type-safe mocking of Firestore operations (`@blumintinc/blumint/enforce-mock-firestore`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Ad-hoc Firestore mocks lead to inconsistent behavior across tests and fragile expectations. The repository ships a vetted `mockFirestore` helper under `__test-utils__/mockFirestore` that aligns with production usage. This rule blocks manual `jest.mock("firebase-admin"…)` Firestore stubs and imports from `firestore-jest-mock`.

## Rule Details

This rule reports when:

- A `jest.mock(...)` targets `firebase-admin` (or `functions/src/config/firebaseAdmin`) and returns `db`, `firestore`, or `getFirestore` objects inline.
- Code imports `mockFirebase` from `firestore-jest-mock` instead of the shared `mockFirestore` helper.

### Examples of **incorrect** code for this rule:

```ts
// Inline jest mock of firebase-admin
jest.mock('firebase-admin', () => ({
  firestore: () => ({ collection: jest.fn(), doc: jest.fn() }),
}));

// Using firestore-jest-mock
import { mockFirebase } from 'firestore-jest-mock';
```

### Examples of **correct** code for this rule:

```ts
// Centralized helper
import { mockFirestore } from '__test-utils__/mockFirestore';
jest.mock('firebase-admin', () => mockFirestore);

// Or when tests need the helper directly
const { db, firestore } = mockFirestore();
```

## Options

This rule does not have any options.

## When Not To Use It

- Projects that do not rely on the shared Firestore test helper (e.g., if using a completely different mocking library across the repo).

## Further Reading

- Internal testing utility: `__test-utils__/mockFirestore`
