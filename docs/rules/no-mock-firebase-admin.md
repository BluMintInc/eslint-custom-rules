# Prevent mocking of functions/src/config/firebaseAdmin (`@blumintinc/blumint/no-mock-firebase-admin`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule stops test suites from replacing the shared `firebaseAdmin` mock that `jest.setup.node.js` provides. Mocking the module yourself bypasses the stable Firestore/Auth stub and leads to divergent state between tests. Use `__test-utils__/mockFirestore` to seed Firestore data without overriding the module mock.

## Rule Details

**Why this rule matters**

- The project already exports a vetted `firebaseAdmin` mock from `jest.setup.node.js`.
- Re-mocking the module with `jest.mock(...)` bypasses that shared stub, so Firestore/Auth state drifts between tests.
- Manual mocks are brittle: they often miss behaviors (tokens, timestamps, errors) the shared mock covers.
- Using `__test-utils__/mockFirestore` keeps test data isolated without replacing the module-level mock.

Examples of **incorrect** code for this rule:

```ts
jest.mock('../../config/firebaseAdmin', () => ({
  db: mockFirestore()
}));

// Even with additional properties
jest.mock('../../config/firebaseAdmin', () => ({
  db: mockFirestore(),
  auth: jest.fn()
}));

// Partial mocks
jest.mock('../../config/firebaseAdmin', () => ({
  db: jest.requireActual('../../config/firebaseAdmin').db,
}));

// Reset attempts
jest.resetModules();
jest.mock('../../config/firebaseAdmin');
```

Examples of **correct** code for this rule:

```ts
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

The rule reports with the following message (path interpolated from the offending mock):

> Do not mock firebaseAdmin module "<modulePath>". The project already ships a stable mock in jest.setup.node.js; overriding it creates divergent Firestore/Auth state and brittle test fixtures. Keep the shared mock and use __test-utils__/mockFirestore to seed data instead of replacing the module.

## When Not To Use It

This rule should always be enabled for test files in projects that use the default `firebaseAdmin` mock from `jest.setup.node.js`.

## Further Reading

- [Jest Mocking](https://jestjs.io/docs/mock-functions)
- [Jest Setup Files](https://jestjs.io/docs/configuration#setupfiles-array)
