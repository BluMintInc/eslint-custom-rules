# Enforce usage of centralized mockFirestore from predefined location (`@blumintinc/blumint/enforce-centralized-mock-firestore`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

If a file defines or re-exports a local `mockFirestore` instead of importing it from `../../../../../__test-utils__/mockFirestore`, that mock drifts away from the canonical behavior and hides API changes. Import the centralized mock so fixes land in one place and every suite stays aligned. The binding is matched by the name it normalizes to, so `MOCK_FIRESTORE` and `mock_firestore` are the same mock as `mockFirestore` — see "The names that count as the local mock" below.

## Rule Details

If you define a local `mockFirestore`, your tests diverge from the canonical behavior. When Firestore data shapes or helper APIs change, scattered mocks silently drift and break only in the suites that forget to update, while the centralized mock absorbs the change once. This rule reports any file where you declare, destructure, or reference a local `mockFirestore` (including renames, other spellings of the same name, and `this.mockFirestore`) instead of importing from the shared path, and the fixer rewrites the file to import the shared mock and swap local references to it.

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

### Bindings the retired declaration was reading

Retiring a local mock deletes whatever its initializer read. When the retired
declarations were the last readers of some other binding, that binding is left
referenced by nothing — `--fix` would then turn a file that lints clean into one
that fails `no-unused-vars` and `noUnusedLocals`, and the report it traded away
is gone.

- A stranded **import** is retired in the same fix, down to the single specifier
  when its siblings are still read:

  ```js
  // before
  import { firestoreMock, buildFixture } from './localMocks';
  const mockFirestore = firestoreMock;
  // after
  import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
  import { buildFixture } from './localMocks';
  ```

- A stranded **local** withholds the whole fix, and the report stands unfixed.
  Deleting the local instead is not available: its initializer is an arbitrary
  expression — `jest.fn()`, a factory call, a `require` — whose effect the fixer
  cannot prove absent, and dropping it would delete working code to settle a
  lint warning. Retire such a mock by hand.
- A binding the surviving text still reads — a local used elsewhere, an import
  read by another statement, an exported const whose readers live in other files
  — is not stranded, so the fix proceeds and the binding stays.
- Anything the removal cannot be proven safe for withholds the fix as well: a
  comment among the import's specifiers, a directive comment bound to the
  import's line, or a name that still occurs in the file where scope analysis
  says it should not.

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

The alias above is reported without an autofix: the alias is the only reader of
`myMockFirestore`, so retiring it would leave that local bound to nothing. Delete
both declarations by hand and import the centralized mock.

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

Declaring the mock as a function hides it no better than spelling it
differently does:

```js
function mockFirestore() {
  return jest.fn();
}
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

### The names that count as the local mock

A binding is the local mock when its name matches `mockFirestore` after
separators (`_`, `-`) are dropped and case is folded. A mock must not be able to
hide behind its spelling: `global-const-style` renames module-scope constants
into `SCREAMING_SNAKE_CASE`, so under the composed recommended config a
`mockFirestore` becomes a `MOCK_FIRESTORE` and walks straight out of a
literal match — and a hand-written `MOCK_FIRESTORE` is equally invisible with no
fixer involved.

The comparison is against the WHOLE identifier, never a substring, so a name
that merely contains `mockFirestore` names a different mock and is left alone:

| Binding                                                              | Reported              |
| -------------------------------------------------------------------- | --------------------- |
| `mockFirestore`, `MOCK_FIRESTORE`, `mock_firestore`, `MockFirestore` | yes — one name        |
| `mockFirestoreAdmin`, `MOCK_FIRESTORE_ADMIN`                         | no — a different mock |
| `firestoreMock`, `FIRESTORE_MOCK`, `MOCK_STORAGE`                    | no — a different name |

Normalization applies to every place the rule DETECTS the mock: a `const`
binding, a `function` declaration, a destructured property key (including
`require`, dynamic `import` and deeply nested patterns), a class property, and a
`this.` reference to one. It does not apply to the two places the name is a
fixed contract rather than something being recognized:

- The specifier imported from the shared module. It exports the mock under one
  spelling, so `import { MOCK_FIRESTORE } from '../../../../../__test-utils__/mockFirestore'`
  would import a name that module does not have.
- The text the fixer emits. The injected import and every rewritten reference
  spell the mock `mockFirestore`, because that is the binding the import
  introduces.

Because the emitted name is fixed, retiring a mock spelled some other way is a
rename: the fixer rewrites **every** reference to the retired binding, not only
the calls, so nothing is left naming a binding that is gone.

```js
// before
const MOCK_FIRESTORE = jest.fn();
beforeEach(() => {
  MOCK_FIRESTORE({});
});
afterEach(() => {
  MOCK_FIRESTORE.mockClear();
});
// after
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => {
  mockFirestore({});
});
afterEach(() => {
  mockFirestore.mockClear();
});
```

### Declaration form is not a hiding place either

Spelling and declaration form are two doors into the same hiding place, so a
local mock written as a `function` declaration is retired exactly as the
`const`-holding-an-arrow spelling of it is. Both of these collapse to the same
file:

```js
// before
function mockFirestore() {
  return jest.fn();
}
beforeEach(() => {
  mockFirestore();
});
```

```js
// before
const mockFirestore = () => {
  return jest.fn();
};
beforeEach(() => {
  mockFirestore();
});
```

```js
// after, from either spelling
import { mockFirestore } from '../../../../../__test-utils__/mockFirestore';
beforeEach(() => {
  mockFirestore();
});
```

Leaving the declaration form unrecognized would cost more than the missed
report: a file whose other local mock IS flagged would lose its fix outright,
because the injected import cannot be added beside a surviving
`function mockFirestore`.

The export-surface restriction described under "Autofix behavior" covers this
form too, in both of its spellings. `export function mockFirestore() {…}` puts
the name on the module's export surface, and
`export default function mockFirestore() {…}` — a shape a `const` cannot take —
makes the mock the module's default export; retiring either breaks importers a
single-file fixer cannot reach, so both are reported without an autofix.

The one case that rename cannot serve is a collision. When a binding spelled
exactly `mockFirestore` outlives the retirement — an import of that name from
somewhere else, a `class mockFirestore`, or the overload signature above a
retired implementation — the injected import would redeclare it, so the fix is
withheld and the report stands for a human to resolve.

## When Not To Use It

You should disable this rule only when your suite must intentionally exercise a different Firestore mock. Prefer extending the centralized mock to cover that behavior so the team benefits from a single source of truth.

## Further Reading

- [Jest Mock Functions](https://jestjs.io/docs/mock-function-api)
- [Testing Best Practices](https://jestjs.io/docs/setup-teardown)
