# no-firestore-jest-mock

Prevents importing from `firestore-jest-mock` in test files to ensure consistent Firestore mocking through our centralized `mockFirestore` utility.

## Rule Details

This rule aims to enforce standardized Firestore mocking by preventing direct imports from `firestore-jest-mock` in test files. Instead, it encourages using our centralized `mockFirestore` utility.

Examples of **incorrect** code for this rule:

```ts
import { mockFirebase, mockSet } from 'firestore-jest-mock';

beforeEach(() => {
  mockFirebase({
    'some/path': [{ id: 'test' }],
  });
  mockSet('some/path', { id: 'test' });
});

// Also incorrect:
jest.mock('firestore-jest-mock');

// And with aliases:
import { mockFirebase as myMock } from 'firestore-jest-mock';
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

This rule should always be enabled for test files to maintain consistent Firestore mocking across the codebase.

## Further Reading

- [Firestore Jest Mock Documentation](https://github.com/sbatson5/firestore-jest-mock)
- Internal documentation on `mockFirestore` utility
