# enforce-centralized-mock-firestore

Enforces the use of the centralized mockFirestore from the predefined location instead of creating new mock instances.

## Rule Details

This rule aims to ensure consistency in test mocks by requiring the use of a centralized mockFirestore implementation.

Examples of **incorrect** code for this rule:

```js
const mockFirestore = jest.fn();

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

```js
const myMockFirestore = jest.fn();
const mockFirestore = myMockFirestore;

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

Examples of **correct** code for this rule:

```js
import { mockFirestore } from '../../../../../__mocks__/functions/src/config/mockFirestore';

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

## When Not To Use It

If you need to use different mock implementations for specific test cases, you might want to disable this rule. However, consider contributing to the centralized mockFirestore implementation instead of creating custom mocks.

## Further Reading

- [Jest Mock Functions](https://jestjs.io/docs/mock-function-api)
- [Testing Best Practices](https://jestjs.io/docs/setup-teardown)
