# Prevent direct mocking of firebaseAdmin; use shared test helpers instead (`@blumintinc/blumint/no-mock-firebase-admin`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule prevents you from replacing the shared `firebaseAdmin` mock that `jest.setup.node.js` provides. Substituting your own module body with a `jest.mock()` **factory** bypasses the stable Firestore/Auth stub and leads to divergent state between tests. Use `__test-utils__/mockFirestore` to seed Firestore data without overriding the module mock.

## Rule Details

### Why this rule matters

- The project already exports a vetted `firebaseAdmin` mock, activated by `jest.setup.node.js`.
- Replacing the module with a `jest.mock(path, factory)` call bypasses that shared stub, so Firestore/Auth state drifts between tests.
- Hand-rolled factories are brittle: they often miss behaviors (tokens, timestamps, errors) the shared mock covers.
- Using `__test-utils__/mockFirestore` keeps test data isolated without replacing the module-level mock.

The rule only runs inside test files (`*.test.*` / `*.spec.*`).

### Bare calls versus factory calls

`jest.setup.node.js` activates the shared mock with a **bare** call of its own:

```ts
// File: jest.setup.node.js
jest.mock('./functions/src/config/firebaseAdmin');
```

A one-argument `jest.mock()` supplies no module body. It tells Jest to use the manual mock that already sits at `functions/src/config/__mocks__/firebaseAdmin.ts` — the very stub this rule protects. A local bare call on that module is therefore the **identical call** the setup file makes: it re-activates the shared manual mock, replaces nothing, and creates no divergent state. Suites use it deliberately, because activating the mock locally is what yields per-call spies (`db.doc`, `db.runTransaction`) that the shared `FakeFirestore` instance never exposes.

Only a **factory** — `jest.mock(path, () => ({ ... }))` — substitutes a different module body, and that is what the rule reports. `jest.mock(path, undefined, { virtual: true })` passes the `undefined` placeholder purely to reach the third argument, so it counts as a bare call too.

### Tier resolution

The repository contains two unrelated modules named `firebaseAdmin`, and only one of them is covered by a shared mock. The rule therefore resolves the `jest.mock()` specifier against the file that performs the mock instead of pattern-matching the raw string, then attributes the result to a tier:

| Resolved module | Shared mock | Reported |
| --- | --- | --- |
| `functions/src/config/firebaseAdmin` (backend) | `jest.setup.node.js` runs the bare `jest.mock('./functions/src/config/firebaseAdmin')`, which activates `functions/src/config/__mocks__/firebaseAdmin.ts` | Only with a factory — a factory replaces the manual mock, while a bare call re-activates the same one |
| `src/config/firebaseAdmin` (frontend) | None — no `__mocks__` entry, no `jest.setup.node.js` registration | No — there is no shared mock to bypass, so a local `jest.mock()` is the only way to stub it |
| Anything else | Unknown | Yes, bare or not — see below |

The bare exemption stops at the backend tier on purpose. It rests on a manual mock that is **known** to exist at `functions/src/config/__mocks__/`; for an unattributable specifier no such sibling is known, so a bare call may instead fall through to Jest's **automock**, which replaces every export with an empty `jest.fn()`. That genuinely is the divergent state the rule exists to prevent, so the unknown tier keeps reporting both forms.

Resolution details:

- Only specifiers whose final path segment is exactly `firebaseAdmin` (ignoring a trailing `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, or `.cjs`) are considered. Neighbors such as `firebaseAdminHelper`, `firebase-admin-utils`, `firebase-admin/firestore`, and `./firebaseAdmin.mock` are never reported.
- Relative specifiers (`./…`, `../…`) are resolved against the directory of the file containing the `jest.mock()` call, so the same `'../../config/firebaseAdmin'` text lands in the backend tier from a backend test and in the frontend tier from a frontend test — and a factory is reported only in the first of those.
- Bare and aliased specifiers (`src/config/firebaseAdmin`, `functions/src/config/firebaseAdmin`, `@project/functions/src/config/firebaseAdmin`) are matched verbatim, because the module resolver maps them from project roots rather than from the importing file.
- Backend attribution is checked before frontend attribution, since the backend path contains the frontend path as a substring.
- Template literals with interpolated segments cannot be attributed to a module and are left alone.

Because the filename determines the tier, every example below includes the file that performs the mock.

### Collection-group exemption

The remedy the message prescribes has one gap: `mockFirestore` seeds collections by path and exposes **no `collectionGroup`** at all. A suite that must drive a collection-group query — for example the `__name__`-ordered, index-free `orderBy`/`limit`/`startAfter` pagination loop that migration scripts run — cannot be written against the shared fake, so reporting it would demand deleting the very assertions the suite exists to make.

A `jest.mock()` whose factory references `collectionGroup` is therefore not reported. The exemption is deliberately narrow:

- It is anchored on `collectionGroup` alone. Ordinary cursor pagination (`orderBy`, `limit`, `startAfter`) over a plain collection **is** expressible through the shared fake, so a factory using only those is still reported — otherwise nearly every hand-rolled factory would qualify.
- The reference may sit at any depth inside the factory (a nested helper or a method body counts), and may be written as an identifier, a string key, or a computed access.
- A string that merely mentions the word (an error message, for instance) is not a reference and does not exempt anything.
- Size is irrelevant: an elaborate factory with no `collectionGroup` is reported exactly as before.

### Examples of **incorrect** code for this rule:

```ts
// functions/src/util/realtimeDb/updateIfExists.test.ts
// Resolves to functions/src/config/firebaseAdmin, whose manual mock
// jest.setup.node.js already activates. The factory replaces it.
jest.mock('../../config/firebaseAdmin', () => ({
  db: mockFirestore(),
}));

// src/test.test.ts — bare specifiers are matched verbatim
jest.mock('functions/src/config/firebaseAdmin', () => ({
  db: mockFirestore(),
  auth: jest.fn(),
}));

// functions/src/util/realtimeDb/updateIfExists.test.ts
// Partial mocks bypass the shared stub just as completely.
jest.mock('../../config/firebaseAdmin', () => ({
  db: jest.requireActual('../../config/firebaseAdmin').db,
}));

// functions/src/util/realtimeDb/updateIfExists.test.ts
// Cursor pagination over a plain collection IS expressible through the shared
// fake, so a hand-rolled orderBy/limit/startAfter builder is still reported.
jest.mock('../../config/firebaseAdmin', () => ({
  db: {
    collection: () => ({
      orderBy: () => ({
        limit: () => ({ startAfter: () => ({ get: jest.fn() }) }),
      }),
    }),
  },
}));

// src/test.test.ts — an unattributable specifier. No __mocks__ sibling is known
// for it, so even this bare call may fall through to Jest's automock.
jest.mock('firebaseAdmin');
```

### Examples of **correct** code for this rule:

```ts
// functions/src/util/tournament/payout/deriveIsChampionPayout.test.ts
// A BARE backend jest.mock is the same call jest.setup.node.js makes: it
// re-activates the manual mock at functions/src/config/__mocks__/firebaseAdmin.ts.
// Nothing is replaced, so no divergent Firestore/Auth state can arise — and the
// local activation is what gives the suite per-call spies on db.doc and
// db.runTransaction that the shared FakeFirestore instance never exposes.
jest.mock('../../../config/firebaseAdmin');
```

```ts
// functions/src/util/realtimeDb/updateIfExists.test.ts
// The `undefined` placeholder exists only to reach the options argument, so
// this is still the bare call and still just re-activates the manual mock.
jest.mock('../../config/firebaseAdmin', undefined, { virtual: true });
```

```ts
// functions/src/util/realtimeDb/updateIfExists.test.ts
// Seed data through the shared mock rather than replacing the module.
import { mockFirestore } from '../../../../__test-utils__/mockFirestore';

beforeEach(() => {
  mockFirestore({
    'some/path': [{ id: 'test' }],
  });
});
```

```ts
// src/pages/api/test/kv.test.ts
// Resolves to the frontend src/config/firebaseAdmin, which has no shared mock,
// so a local jest.mock is the only way to stub it.
jest.mock('../../../config/firebaseAdmin', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: { collection: jest.fn(), doc: jest.fn() },
}));
```

```ts
// src/components/snapshots/server/buildPreemptionSnapshotStrategy.test.ts
// Bare frontend specifier, likewise exempt.
jest.mock('src/config/firebaseAdmin');
```

```ts
// functions/src/callable/scripts/migrateOverlaySettingsToPerAlert.f.test.ts
// The suite must drive a real __name__-ordered, index-free pagination loop, and
// the shared mockFirestore fake has no collectionGroup, so the factory that
// hand-rolls one is exempt.
jest.mock('../../config/firebaseAdmin', () => {
  const state = { docs: [] };
  const buildQuery = (afterPath, limitCount) => ({
    orderBy: () => buildQuery(afterPath, limitCount),
    limit: (count) => buildQuery(afterPath, count),
    startAfter: (snapshot) => buildQuery(snapshot.ref.path, limitCount),
    get: async () => ({ docs: state.docs, empty: state.docs.length === 0 }),
  });
  return {
    db: {
      collectionGroup: () => buildQuery(),
      batch: () => ({ update: jest.fn(), commit: jest.fn() }),
    },
    __mockState: state,
  };
});
```

```ts
// functions/src/util/realtimeDb/updateIfExists.test.ts
// Modules that merely resemble firebaseAdmin are untouched.
jest.mock('../config/firebaseAdminHelper');
jest.mock('firebase-admin/firestore');
```

The rule reports with the following message (path interpolated from the offending mock):

> Do not override the firebaseAdmin module mock for "{{modulePath}}". jest.setup.node.js already activates the shared manual mock; substituting your own module body creates divergent Firestore/Auth state and brittle test fixtures. Use `__test-utils__/mockFirestore` to seed data, and where a suite only needs the shared mock active, write a bare `jest.mock()` of functions/src/config/firebaseAdmin with no factory argument.

## When Not To Use It

This rule should always be enabled for test files in projects that use the default `firebaseAdmin` mock from `jest.setup.node.js`.

## Further Reading

- [Jest Mocking](https://jestjs.io/docs/mock-functions)
- [Jest Setup Files](https://jestjs.io/docs/configuration#setupfiles-array)
