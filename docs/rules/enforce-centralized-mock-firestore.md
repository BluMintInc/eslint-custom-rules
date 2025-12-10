# Enforce usage of centralized mockFirestore from predefined location (`@blumintinc/blumint/enforce-centralized-mock-firestore`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

You must use the shared `mockFirestore` from `../../../../../__test-utils__/mockFirestore` instead of declaring ad-hoc mocks. When Firestore data shapes or helper APIs change, your local mocks drift and only your suite breaks, while the centralized mock absorbs the change once.

## Rule Details

If you define a local `mockFirestore`, your tests diverge from the canonical behavior. When Firestore data shapes or helper APIs change, scattered mocks silently drift and break only in the suites that forget to update, while the centralized mock absorbs the change once. This rule reports any file where you declare, destructure, or reference a local `mockFirestore` (including renames and `this.mockFirestore`) instead of importing from the shared path, and the fixer rewrites the file to import the shared mock and swap local references to it.

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

```js
const { mockFirestore: customMockFirestore } = require('./customMocks');

describe('test suite', () => {
  beforeEach(() => {
    customMockFirestore({
      'some/path': [{ id: 'test' }],
    });
  });
});
```

Examples of **correct** code for this rule:

```js
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

```js
import { mockFirestore as centralMockFirestore } from '../../../../../__test-utils__/mockFirestore';

beforeEach(() => {
  centralMockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

## When Not To Use It

You should disable this rule only when your suite must intentionally exercise a different Firestore mock. Prefer extending the centralized mock to cover that behavior so the team benefits from a single source of truth.

## Further Reading

- [Jest Mock Functions](https://jestjs.io/docs/mock-function-api)
- [Testing Best Practices](https://jestjs.io/docs/setup-teardown)
