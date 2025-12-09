# Enforce usage of centralized mockFirestore from predefined location (`@blumintinc/blumint/enforce-centralized-mock-firestore`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Require tests to use the shared `mockFirestore` from `../../../../../__test-utils__/mockFirestore` instead of declaring ad-hoc mocks. A single, centralized mock keeps Firestore test behavior aligned with real API changes and ensures fixes land in one place rather than being copied across suites.

## Rule Details

Using locally defined `mockFirestore` functions causes tests to diverge from the canonical behavior. When Firestore data shapes or helper APIs change, scattered mocks silently drift and break only in the suites that forgot to update. The centralized mock absorbs these changes once and keeps every test using the same behavior. This rule reports any file that declares, destructures, or references a local `mockFirestore` (including renames and `this.mockFirestore`) instead of importing from the shared path. The fixer rewrites the file to import the shared mock and swaps local references to it.

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

Disable this rule only when a suite must intentionally exercise a different Firestore mock. Prefer extending the centralized mock to cover that behavior so the team benefits from a single source of truth.

## Further Reading

- [Jest Mock Functions](https://jestjs.io/docs/mock-function-api)
- [Testing Best Practices](https://jestjs.io/docs/setup-teardown)
