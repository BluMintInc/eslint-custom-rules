# Prevent importing firestore-jest-mock in test files (`@blumintinc/blumint/no-firestore-jest-mock`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Direct imports from `firestore-jest-mock` bypass the shared `mockFirestore` helper that mirrors our production Firestore schema and centralizes test seeding/cleanup. The shared helper keeps mocks aligned with real collections, applies the same reset logic across suites, and prevents drift that leads to flaky or misleading tests.

## Rule Details

This rule ensures every test relies on the same Firestore test harness:

- Direct `firestore-jest-mock` imports set up mocks that diverge from our production schema and skip the shared teardown hooks, which causes brittle, stateful tests.
- The centralized `mockFirestore` helper handles seeding and cleanup consistently, so suites share reliable Firestore behavior.
- The rule is scoped to test files (`*.test.ts`) and offers an autofix that replaces the disallowed import with a path pointing at `__test-utils__/mockFirestore` (the path is computed relative to the current test file so nested suites resolve correctly).
- This repository ships a stubbed `__test-utils__/mockFirestore` to anchor autofixes; consuming projects should map that path (via resolver or tsconfig paths) to their real shared helper.

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

// Dynamic import also violates the rule:
const loadMock = async () => import('firestore-jest-mock');
```

Examples of **correct** code for this rule:

```ts
import { mockFirestore } from '../../__test-utils__/mockFirestore';

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
