# Enforce using centralized router state key constants from queryKeys.ts for useRouterState key parameter (`@blumintinc/blumint/enforce-querykey-ts`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This ESLint rule enforces the use of centralized router state key constants imported from `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling router methods that accept key parameters. The rule addresses the anti-pattern of scattered string literals throughout the codebase for router state management, which leads to inconsistency, typos, and maintenance difficulties.

As BluMint transitions to centralized router state management with the new query parameter persistence system, it's critical that all router key references use the predefined `QUERY_KEY_*` constants. This ensures type safety, prevents typos, enables better refactoring, and maintains consistency across the application's routing layer.

### What this rule does:

1. **Targets the `key` property** in objects passed to the `useRouterState` hook
1. **Ensures that key parameters** are imported from `src/util/routing/queryKeys.ts` and use the `QUERY_KEY_*` constants
1. **Accepts an approved re-export** of those constants — the `constants` barrel re-exports queryKeys.ts, so a `QUERY_KEY_*` taken from it is the same constant under a shorter path
1. **Allows for computed values or variables** that are derived from the imported constants
1. **Allows a key produced by a call**, since a return value is opaque to a syntactic check
1. **Provides auto-fix suggestions** when possible to replace string literals with appropriate constant imports

## Examples

### ❌ Incorrect

```typescript
// Using string literals directly
function Component() {
  const [playbackId] = useRouterState({ key: 'playback-id' });
  return <div>{playbackId}</div>;
}

// String concatenation with literals
function Component({ id }) {
  const [value] = useRouterState({ key: 'user-profile-' + id });
  return <div>{value}</div>;
}

// Conditional expressions with string literals
function Component({ isAdmin }) {
  const [value] = useRouterState({
    key: isAdmin ? 'admin-dashboard' : 'user-dashboard'
  });
  return <div>{value}</div>;
}

// Template literal with static content
function Component({ id }) {
  const [value] = useRouterState({ key: `user-profile-${id}` });
  return <div>{value}</div>;
}

// Variable not from queryKeys.ts
const MY_KEY = 'custom-key';
function Component() {
  const [value] = useRouterState({ key: MY_KEY });
  return <div>{value}</div>;
}

// Import from wrong source
import { QUERY_KEY_WRONG } from './wrong/path';
function Component() {
  const [value] = useRouterState({ key: QUERY_KEY_WRONG });
  return <div>{value}</div>;
}

// Constant not following QUERY_KEY_ pattern
import { WRONG_PATTERN } from 'src/util/routing/queryKeys';
function Component() {
  const [value] = useRouterState({ key: WRONG_PATTERN });
  return <div>{value}</div>;
}
```

### ✅ Correct

```typescript
// Using imported QUERY_KEY constants
import { QUERY_KEY_PLAYBACK_ID } from 'src/util/routing/queryKeys';

function Component() {
  const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });
  return <div>{playbackId}</div>;
}

// Multiple imports
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from 'src/util/routing/queryKeys';

function Component() {
  const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
  const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
  return <div>{notification} {channel}</div>;
}

// Aliased imports
import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from 'src/util/routing/queryKeys';

function Component() {
  const [notification] = useRouterState({ key: NOTIFICATION_KEY });
  return <div>{notification}</div>;
}

// Conditional usage with valid constants
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from 'src/util/routing/queryKeys';

function Component({ isNotification }) {
  const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
  const [queryValue] = useRouterState({ key: keyToUse });
  return <div>{queryValue}</div>;
}

// Template literals with query key variables
import { QUERY_KEY_USER_PROFILE } from 'src/util/routing/queryKeys';

function Component({ userId }) {
  const key = `${QUERY_KEY_USER_PROFILE}-${userId}`;
  const [profile] = useRouterState({ key });
  return <div>{profile}</div>;
}

// Binary expressions with query keys
import { QUERY_KEY_MATCH } from 'src/util/routing/queryKeys';

function Component({ matchId }) {
  const [match] = useRouterState({ key: QUERY_KEY_MATCH + '-' + matchId });
  return <div>{match}</div>;
}

// Function calls (permissive approach)
import { QUERY_KEY_TOURNAMENT } from 'src/util/routing/queryKeys';

function generateKey(base, suffix) {
  return `${base}-${suffix}`;
}

function Component({ tournamentId }) {
  const [tournament] = useRouterState({
    key: generateKey(QUERY_KEY_TOURNAMENT, tournamentId)
  });
  return <div>{tournament}</div>;
}

// A call's return value is opaque, whatever the factory is named and whether
// the call is passed straight to the key or bound to a variable first
function ComponentFromFactory() {
  const derivedKey = buildQueryKey('match-session');
  const [value] = useRouterState({ key: derivedKey });
  return <div>{value}</div>;
}

// Constants taken from an approved re-export of queryKeys.ts
import { QUERY_KEY_ATTEMPT } from 'src/constants';

function ComponentFromBarrel() {
  const [attempt] = useRouterState({ key: QUERY_KEY_ATTEMPT });
  return <div>{attempt}</div>;
}

// Variables derived from query key constants
import { QUERY_KEY_USER } from 'src/util/routing/queryKeys';

function Component() {
  const userKey = QUERY_KEY_USER;
  const [user] = useRouterState({ key: userKey });
  return <div>{user}</div>;
}
```

## Edge Cases Handled

### 1. Conditional Key Usage
Keys might be used conditionally or stored in variables before being passed to router methods.

```typescript
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from 'src/util/routing/queryKeys';

const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
const [queryValue] = useRouterState({ key: keyToUse });
```

### 2. Re-exported Constants
Constants might be re-exported from other files or imported with different names.

```typescript
// Re-export scenario
export { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from './queryKeys';

// Usage with alias
import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from 'src/util/routing/queryKeys';
const [notification] = useRouterState({ key: NOTIFICATION_KEY }); // ✅ Allowed
```

### 3. Multiple Constants Import
Files might import multiple query key constants in a single import statement.

```typescript
import {
  QUERY_KEY_NOTIFICATION,
  QUERY_KEY_CHANNEL,
  QUERY_KEY_PLAYBACK_ID
} from 'src/util/routing/queryKeys';

const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
```

### 4. Keys produced by a call

A return value is opaque to a syntactic check, so a key that comes from a call is
left alone whatever the factory is named — passed straight to `key`, reached
through an object, or bound to a variable first.

```typescript
const derivedKey = buildQueryKey('match-session');
const [session] = useRouterState({ key: derivedKey });

const [inline] = useRouterState({ key: queryKeyUtils.buildQueryKey('match') });
```

The allowance covers the call, not the text wrapped around it: a template
literal that carries static content of its own names a key of its own and is
still reported.

## Valid Import Sources

The rule recognizes the following import sources as valid:

- `src/util/routing/queryKeys`
- `@/util/routing/queryKeys`, for a consumer that declares that alias
- `util/routing/queryKeys`
- `./util/routing/queryKeys`
- `../util/routing/queryKeys`
- `../../util/routing/queryKeys`
- `../../../util/routing/queryKeys`
- `../../../../util/routing/queryKeys`
- Any path ending with `/util/routing/queryKeys`
- A relative specifier that resolves to that module from the linted file, even
  when its text hides the directory names (`./queryKeys` from a sibling,
  `../../routing/queryKeys` from two levels below `src/util`)
- The `constants` barrel, which re-exports those constants: `constants`,
  `constants/index`, and the same two under any root that names them —
  `src/constants`, `@/constants`, `./constants`, `../../constants`

The barrel spellings are exactly the ones
[`prefer-global-router-state-key`](./prefer-global-router-state-key.md)
recognizes as an approved re-export. Both rules police the same `key`, so a
source one of them accepts is accepted here too; otherwise one rule's advertised
remedy would be the other's violation.

Recognition is deliberately wider than emission: every form above is accepted on
an existing import, but the fixer writes only the forms in the table below. An
existing import of an approved re-export is the exception — it is proof of a path
that resolves for that file, so a substituted constant joins that import rather
than opening a second one.

## Auto-fix Capability

The rule provides automatic fixes for keys whose value is statically known by converting them to suggested `QUERY_KEY_*` constant names **together with the import that makes the constant resolve**:

```typescript
// Before (auto-fixable), in src/components/tournament/TeamCard.tsx
function TeamCard() {
  const [value] = useRouterState({ key: 'user-profile' });
  return <div>{value}</div>;
}

// After auto-fix
import { QUERY_KEY_USER_PROFILE } from '../../util/routing/queryKeys';

function TeamCard() {
  const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
  return <div>{value}</div>;
}
```

The import is resolved as follows:

* **A queryKeys import already exists** — it is extended with the missing specifier, reusing that file's own path (`../util/routing/queryKeys`, `src/util/routing/queryKeys`, `src/util/routing/queryKeys`, …) rather than a second import statement. An existing specifier is proof of a path that resolves for that file, so it outranks anything the rule derives.
* **The constant is already imported** — only the literal changes. If the export is already imported under an alias, the fix substitutes the alias instead of importing the same export twice.
* **No queryKeys import exists** — a fresh import statement is written, and its specifier is derived from the file under lint:

| File under lint | Emitted specifier | Why |
| --- | --- | --- |
| Inside `src/**` | Relative, e.g. `../../util/routing/queryKeys` | Relative paths resolve everywhere and dominate the codebase. |
| Everywhere else | `src/util/routing/queryKeys` | The root tsconfig `paths` and the Jest `moduleNameMapper` both map `src/*`. |

  The `../` count comes from the linted file's own depth below the root that owns its `src/` segment, so `src/index.tsx` imports `./util/routing/queryKeys` and a sibling in `src/util/routing/` imports `./queryKeys`. An `@/`-aliased specifier is never emitted: that alias is declared in no tsconfig, bundler or Jest config, so it resolves nowhere.
* **Several keys in one file** — every substituted constant lands in a single import.

The fix is declined (the violation is still reported, but nothing is rewritten) when:

* the constant name is already taken by something else — another module's export, a local declaration, or an alias of a non-`QUERY_KEY_*` export — because substituting would silently point the key at an unrelated value;
* no correct specifier can be derived for a file that has no queryKeys import to reuse, because an import that fails to resolve is worse than the literal it replaced; or
* the key names no constant at all: `''`, `'-'`, `'_-:/.'` and `'   '` all normalize to nothing, and the bare `QUERY_KEY_` they would produce is not a name `queryKeys.ts` exports, so those report without a fix. A key that keeps a single alphanumeric character — `'a'`, `'-a-'` — still fixes, to `QUERY_KEY_A`.

Note: the fix is gated on the key's **value**, not on the notation that spells it. A quoted string and an expression-free template are the same key written two ways, and both are rewritten to the same constant — reading the template through its cooked value, so `` `user-profile` `` and `'user-profile'` derive one name. Keys whose value depends on something the rule cannot evaluate — concatenation, ternaries, and templates that interpolate an expression — are still reported and require manual refactoring.

### Interaction with inline disable comments

The single import is attached to the fix of the first violation that is **not** suppressed by an inline `eslint-disable` directive, and it names only the constants the surviving substitutions use. Suppressing one key therefore neither strands the other rewritten keys without an import nor leaves an unused specifier behind:

```tsx
function MatchComponent() {
  // eslint-disable-next-line @blumintinc/blumint/enforce-querykey-ts
  const [value] = useRouterState({ key: 'match-view' });  // left alone, and not imported
}

function TournamentComponent() {
  const [other] = useRouterState({ key: 'tournament-view' });  // fixed, and carries the import
}
```

The suggested constant name is derived from the literal, so `queryKeys.ts` may still need the export added; the generated import makes that a compile error instead of an undefined identifier at runtime.

## When Not to Use

This rule should not be disabled as it's part of BluMint's architectural transition to centralized router state management. However, if you're working on legacy code that hasn't been migrated yet, you might temporarily disable it for specific files:

```javascript
/* eslint-disable @blumintinc/blumint/enforce-querykey-ts */
```

## Related Rules

- [`prefer-global-router-state-key`](./prefer-global-router-state-key.md) — polices the same `useRouterState` key and enforces the same import sources: it reports `invalidQueryKeySource` for a key variable sourced from anywhere other than queryKeys.ts or an approved re-export, and autofixes string literals the same way.

  The carve-outs the two rules share are kept identical — call results, function parameters, and the set of approved sources — so a key that one rule's carve-out allows is not reported by the other. Each still reaches shapes the other leaves alone: that rule also reports a member expression passed as the key, where this rule reports only string-literal expressions and bare identifiers; this rule also reports a template literal that carries static content of its own, which that rule accepts as long as one of its expressions is a valid key.
