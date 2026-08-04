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
- An **exported** declaration — `export const mockFirestore = …`, one binding of
  an exported multi-declarator `const`, or an `export const` inside a namespace
  — is reported without an autofix. Retiring it would drop the name from the
  module's export surface, and the importers that spell it out live in files a
  single-file fixer cannot reach. Collapse such a mock by hand: redirect the
  importers first, then delete the export. A class property is exempt from this
  restriction because it belongs to its class rather than to the module, so
  `export default class { mockFirestore = … }` is still fixed.

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

### The centralized module itself

`__test-utils__/mockFirestore.ts` is exempt: its local definition is the
canonical mock this rule sends every other file to, so reporting it would ask
the module to import itself, and the fix would delete the very implementation
the rest of the codebase imports. The exemption is keyed on the module's path
segments (`__test-utils__/mockFirestore`, matched at a path-segment boundary
under any source extension), so neighbours such as
`__test-utils__/mockFirestore.test.ts`, `__test-utils__/mockAuth.ts`, and
`not__test-utils__/mockFirestore.ts` stay reported and fixed.

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

Exporting the local mock does not make it acceptable — it multiplies the drift
across every file that imports it. This is reported without an autofix, since
the fixer cannot rewrite those importers:

```js
export const mockFirestore = jest.fn();

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
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

The centralized module defines the mock it exports:

```js
// File: __test-utils__/mockFirestore.ts
export const mockFirestore = jest.fn();
```

## When Not To Use It

You should disable this rule only when your suite must intentionally exercise a different Firestore mock. Prefer extending the centralized mock to cover that behavior so the team benefits from a single source of truth.

## Further Reading

- [Jest Mock Functions](https://jestjs.io/docs/mock-function-api)
- [Testing Best Practices](https://jestjs.io/docs/setup-teardown)
