# Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter (`@blumintinc/blumint/prefer-global-router-state-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforce using global constants or type-safe functions for `useRouterState` key parameter.

## Rule Details

This rule requires every `useRouterState` `key` to come from the centralized `QUERY_KEY_*` exports in `src/util/routing/queryKeys` (or an approved re-export such as `src/constants`). Ad-hoc string keys fragment the router cache, hide the set of supported keys, and make refactors brittle. The rule reports:

- String literals (including template/binary expressions with static segments) passed as the `key`.
- Variables that resolve to a static string not sourced from `queryKeys.ts` or its approved re-exports.

Two kinds of key variable are deliberately exempt — see [What the rule allows](#what-the-rule-allows).

### Why this matters

- **Stable routing cache**: Centralized constants prevent typo-driven cache splits (e.g., `user-profile` vs `userProfile`) that create duplicate entries.
- **Discoverability**: Keeping keys in one module documents the allowed set and makes audits and refactors reliable.
- **Safer refactors**: Imports ensure IDEs and codemods can update keys when names change.

### What triggers a violation

- Passing a string literal or template literal directly to `useRouterState`.
- Building the key with inline string concatenation.
- Using a variable that resolves to a static string and was not imported from `queryKeys.ts` (or an allowed re-export) as the key.

### What the rule allows

Two classes of key variable never report, because neither exposes a static string the rule could check:

- **Function parameters.** A key bound by a parameter is exempt: the caller chooses the key, and the callee cannot control where it came from (issue #1394). Enforcement belongs at the call site, which the rule checks there instead.
- **Call results.** A variable initialized from a function call is exempt, as is a call passed straight to `key`. A return value is opaque to a syntactic check, so the rule stays permissive rather than guessing. This is the "type-safe functions" allowance the summary at the top refers to.

```tsx
// Allowed: the caller owns the key (#1394)
function useSessionState(key: string) {
  return useRouterState({ key });
}

// Allowed: a call's return value is opaque to a syntactic check
const derivedKey = buildQueryKey('match-session');
const [value] = useRouterState({ key: derivedKey });

// Allowed: an optional link is read through to the source underneath
const optionalKey = config?.getQueryKey();
const [optionalValue] = useRouterState({ key: optionalKey });
```

An optional link anywhere in that call is read through: `config?.getQueryKey()`
takes its key from the same place `config.getQueryKey()` does, and a
short-circuit changes only whether that source is evaluated, never which source
it is. The chain is resolved rather than waved through, so a key variable read
from a source the rule does not approve still reports: `const key =
config?.queryKey` reports exactly as `const key = config.queryKey` does, and a
namespace alias of `queryKeys.ts` still has to name a `QUERY_KEY_*` export
(`QueryKeys?.matchKey` reports). The sibling rule `enforce-querykey-ts` reads
the same spellings the same way, so no key source is one rule's allowance and
the other's violation.

### Examples

#### ❌ Incorrect

```typescript
// String literal bypasses the shared QUERY_KEY_* constants
const [value] = useRouterState({ key: 'match-session' });

// Variable not sourced from queryKeys.ts
import { USER_PROFILE_KEY } from 'src/constants/other';
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

### Autofix behavior

The fix replaces the key with the matching `QUERY_KEY_*` constant and
makes sure that constant is imported. It is gated on the key's **value**, not on
the notation that spells it: a quoted string and an expression-free template are
the same key written two ways, so both are rewritten to the same constant, with
the template read through its cooked value so `` `user-profile` `` and
`'user-profile'` derive one name. A key whose value the rule cannot evaluate —
concatenation, a ternary, or a template that interpolates an expression — is
still reported, and requires manual refactoring. So is a key that names no
constant: `''`, `` `` ``, `'-'` and `'_-:/.'` all normalize to nothing, and the
bare `QUERY_KEY_` they would produce is not a name `queryKeys.ts` exports, so
those report without a fix in every spelling. An existing import of `queryKeys.ts` is
reused: a namespace or default import qualifies the constant (`QueryKeys.QUERY_KEY_MATCH`),
and a named import is extended in place rather than duplicated. Relative
specifiers count as that module, including ones whose text hides the directory
names (`./queryKeys` from a sibling, `../../routing/queryKeys` from two levels
below `src/util`), so a second violation in the same file extends the import the
fix itself wrote.

Only a freshly written import statement needs a specifier of its own, and that
specifier is derived from the file under lint:

| File under lint | Emitted specifier | Why |
| --- | --- | --- |
| Inside `src/**` | Relative, e.g. `../../util/routing/queryKeys` | Relative paths resolve everywhere and dominate the codebase. |
| Everywhere else | `src/util/routing/queryKeys` | The root tsconfig `paths` and the Jest `moduleNameMapper` both map `src/*`. |

The `../` count comes from the linted file's own depth below the root that owns
its `src/` segment, so `src/index.tsx` imports `./util/routing/queryKeys` and a
sibling in `src/util/routing/` imports `./queryKeys`. An `@/`-aliased specifier
is never emitted: that alias is declared in no tsconfig, bundler or Jest config,
so it resolves nowhere. Where no correct specifier can be derived, the rule
reports without fixing rather than write an import that fails to resolve.

The emitted reference is only as good as the name it starts with — the namespace
or default import's alias for a qualified `QueryKeys.QUERY_KEY_*`, otherwise the
constant's own imported name. That name is resolved through the scope chain at
the key being rewritten, not at module scope, so a binding in any enclosing block,
function or parameter list is seen. Where it resolves to anything other than the
intended import, the fix is withheld and only the report stands:

```tsx
import * as QueryKeys from '../util/routing/queryKeys';

function Component() {
  // Rewriting the literal to QueryKeys.QUERY_KEY_USER_PROFILE would read this
  // object, so the rule reports and leaves the shadow for you to rename.
  const QueryKeys = { QUERY_KEY_USER_PROFILE: 'wrong-key' };
  const [value] = useRouterState({ key: 'user-profile' });
  return [value, QueryKeys];
}
```

## When Not To Use It

You might consider disabling this rule in test files or in cases where you need to quickly prototype with string literals.

## Further Reading

- [URL-based State Management Best Practices](https://example.com)
- [Type Safety in React Applications](https://example.com)
