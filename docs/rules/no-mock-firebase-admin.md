# Prevent direct mocking of firebaseAdmin; use shared test helpers instead (`@blumintinc/blumint/no-mock-firebase-admin`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Prevents mocking of `functions/src/config/firebaseAdmin` since it is already mocked in `jest.setup.node.js`. Instead of manually mocking `firebaseAdmin`, tests should use `mockFirestore` for Firestore interactions.

## Rule Details

This rule aims to prevent inconsistent test behavior and potential conflicts by ensuring that tests do not manually override the default mock for `firebaseAdmin`.

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

## When Not To Use It

This rule should always be enabled for test files in projects that use the default `firebaseAdmin` mock from `jest.setup.node.js`.

## Further Reading

- [Jest Mocking](https://jestjs.io/docs/mock-functions)
- [Jest Setup Files](https://jestjs.io/docs/configuration#setupfiles-array)
