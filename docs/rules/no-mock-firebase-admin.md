# Prevent direct mocking of firebaseAdmin; use shared test helpers instead (`@blumintinc/blumint/no-mock-firebase-admin`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule prevents you from replacing the shared `firebaseAdmin` mock that `jest.setup.node.js` provides. Mocking the module yourself bypasses the stable Firestore/Auth stub and leads to divergent state between tests. Use `__test-utils__/mockFirestore` to seed Firestore data without overriding the module mock.

## Rule Details

### Why this rule matters

- The project already exports a vetted `firebaseAdmin` mock from `jest.setup.node.js`.
- Re-mocking the module with `jest.mock(...)` bypasses that shared stub, so Firestore/Auth state drifts between tests.
- Manual mocks are brittle: they often miss behaviors (tokens, timestamps, errors) the shared mock covers.
- Using `__test-utils__/mockFirestore` keeps test data isolated without replacing the module-level mock.

The rule only runs inside test files (`*.test.*` / `*.spec.*`).

### Tier resolution

The repository contains two unrelated modules named `firebaseAdmin`, and only one of them is covered by a shared mock. The rule therefore resolves the `jest.mock()` specifier against the file that performs the mock instead of pattern-matching the raw string, then attributes the result to a tier:

| Resolved module | Shared mock | Reported |
| --- | --- | --- |
| `functions/src/config/firebaseAdmin` (backend) | `jest.setup.node.js` runs `jest.mock('./functions/src/config/firebaseAdmin')` | Yes — the local mock bypasses the shared stub |
| `src/config/firebaseAdmin` (frontend) | None — no `__mocks__` entry, no `jest.setup.node.js` registration | No — there is no shared mock to bypass, so a local `jest.mock()` is the only way to stub it |
| Anything else | Unknown | Yes — the rule falls back to reporting so unfamiliar layouts stay protected |

Resolution details:

- Only specifiers whose final path segment is exactly `firebaseAdmin` (ignoring a trailing `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, or `.cjs`) are considered. Neighbors such as `firebaseAdminHelper`, `firebase-admin-utils`, `firebase-admin/firestore`, and `./firebaseAdmin.mock` are never reported.
- Relative specifiers (`./…`, `../…`) are resolved against the directory of the file containing the `jest.mock()` call, so the same `'../../config/firebaseAdmin'` text is reported in a backend test and allowed in a frontend test.
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
// Resolves to functions/src/config/firebaseAdmin, which jest.setup.node.js already mocks.
jest.mock('../../config/firebaseAdmin', () => ({
  db: mockFirestore(),
}));

// functions/src/util/tournament/payout/deriveIsChampionPayout.test.ts
jest.mock('../../../config/firebaseAdmin');

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
```

### Examples of **correct** code for this rule:

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

> Do not mock firebaseAdmin module "{{modulePath}}". The project already ships a stable mock in jest.setup.node.js; overriding it creates divergent Firestore/Auth state and brittle test fixtures. Keep the shared mock and use `__test-utils__/mockFirestore` to seed data instead of replacing the module.

## When Not To Use It

This rule should always be enabled for test files in projects that use the default `firebaseAdmin` mock from `jest.setup.node.js`.

## Further Reading

- [Jest Mocking](https://jestjs.io/docs/mock-functions)
- [Jest Setup Files](https://jestjs.io/docs/configuration#setupfiles-array)
