# Enforce usage of centralized mockFirestore from predefined location (`@blumintinc/blumint/enforce-centralized-mock-firestore`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

If a file defines or re-exports a local `mockFirestore` instead of importing it from `../../../../../__test-utils__/mockFirestore`, that mock drifts away from the canonical behavior and hides API changes. Import the centralized mock so fixes land in one place and every suite stays aligned.

## Rule Details

If you define a local `mockFirestore`, your tests diverge from the canonical behavior. When Firestore data shapes or helper APIs change, scattered mocks silently drift and break only in the suites that forget to update, while the centralized mock absorbs the change once. This rule reports any file where you declare, destructure, or reference a local `mockFirestore` (including renames and `this.mockFirestore`) instead of importing from the shared path, and the fixer rewrites the file to import the shared mock and swap local references to it.

### Autofix behavior

The fixer retires each local declaration by its own source range, never by the
lines it happens to touch:

- A declaration that is the sole occupant of its line takes the whole line with
  it.
- A declaration sharing its line with anything else surrenders only its own
  characters. A neighbouring statement stays bound, and a trailing comment —
  including an `eslint-disable-line` directive, which governs which rules report
  on that line — is left in place rather than deleted.
- A declarator sharing a `const` with live siblings loses only itself and the
  comma binding it to them.
- A declaration that cannot be excised without malforming the construct around
  it, such as a `for (const mockFirestore of …)` head, is reported without an
  autofix instead of being cut anyway.

The injected import is placed below whatever opens the file, and the text above
it is emitted exactly once:

- A `'use client'` / `'use server'` directive stays the first statement, so the
  file keeps the meaning the directive gives it.
- A `#!` shebang stays at character 0, so the file keeps parsing.
- A header comment — a license block, a `@ts-nocheck`, an `eslint-disable`
  block — keeps leading the file, and the import goes below it.
- A suppression bound to the line under it, such as
  `eslint-disable-next-line`, is never split from its subject by the import.
- An existing import block is where the new import joins.

### Examples of **incorrect** code for this rule:

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

### Examples of **correct** code for this rule:

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
