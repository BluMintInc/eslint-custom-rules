# Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter (`@blumintinc/blumint/prefer-global-router-state-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using global constants or type-safe functions for `useRouterState` key parameter.

## Rule Details

This rule requires every `useRouterState` `key` to come from the centralized `QUERY_KEY_*` exports in `src/util/routing/queryKeys` (or an approved re-export such as `@/constants`). Ad-hoc string keys fragment the router cache, hide the set of supported keys, and make refactors brittle. The rule reports:

- String literals (including template/binary expressions with static segments) passed as the `key`.
- Variables that are not imported from `queryKeys.ts` or its approved re-exports.

### Why this matters

- **Stable routing cache**: Centralized constants prevent typo-driven cache splits (e.g., `user-profile` vs `userProfile`) that create duplicate entries.
- **Discoverability**: Keeping keys in one module documents the allowed set and makes audits and refactors reliable.
- **Safer refactors**: Imports ensure IDEs and codemods can update keys when names change.

### What triggers a violation

- Passing a string literal or template literal directly to `useRouterState`.
- Building the key with inline string concatenation.
- Using a variable that was not imported from `queryKeys.ts` (or an allowed re-export) as the key.

### Examples

#### ❌ Incorrect

```typescript
// String literal bypasses the shared QUERY_KEY_* constants
const [value] = useRouterState({ key: 'match-session' });

// Variable not sourced from queryKeys.ts
import { USER_PROFILE_KEY } from '@/constants/other';
const [value2] = useRouterState({ key: USER_PROFILE_KEY });

// Inline concatenation hides the intended key
const [value3] = useRouterState({ key: 'match-' + id });
```

#### ✅ Correct (centralized constants)

```typescript
// src/util/routing/queryKeys.ts
export const QUERY_KEY_MATCH_SESSION = 'match-session' as const;

// consumer file
import { QUERY_KEY_MATCH_SESSION } from 'src/util/routing/queryKeys';

const [value] = useRouterState({ key: QUERY_KEY_MATCH_SESSION });
```

## When Not To Use It

You might consider disabling this rule in test files or in cases where you need to quickly prototype with string literals.

## Further Reading

- [URL-based State Management Best Practices](https://example.com)
- [Type Safety in React Applications](https://example.com)
