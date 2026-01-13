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
1. **Allows for computed values or variables** that are derived from the imported constants
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
import { WRONG_PATTERN } from '@/util/routing/queryKeys';
function Component() {
  const [value] = useRouterState({ key: WRONG_PATTERN });
  return <div>{value}</div>;
}
```

### ✅ Correct

```typescript
// Using imported QUERY_KEY constants
import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

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
import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';

function Component() {
  const [notification] = useRouterState({ key: NOTIFICATION_KEY });
  return <div>{notification}</div>;
}

// Conditional usage with valid constants
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

function Component({ isNotification }) {
  const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
  const [queryValue] = useRouterState({ key: keyToUse });
  return <div>{queryValue}</div>;
}

// Template literals with query key variables
import { QUERY_KEY_USER_PROFILE } from '@/util/routing/queryKeys';

function Component({ userId }) {
  const key = `${QUERY_KEY_USER_PROFILE}-${userId}`;
  const [profile] = useRouterState({ key });
  return <div>{profile}</div>;
}

// Binary expressions with query keys
import { QUERY_KEY_MATCH } from '@/util/routing/queryKeys';

function Component({ matchId }) {
  const [match] = useRouterState({ key: QUERY_KEY_MATCH + '-' + matchId });
  return <div>{match}</div>;
}

// Function calls (permissive approach)
import { QUERY_KEY_TOURNAMENT } from '@/util/routing/queryKeys';

function generateKey(base, suffix) {
  return `${base}-${suffix}`;
}

function Component({ tournamentId }) {
  const [tournament] = useRouterState({
    key: generateKey(QUERY_KEY_TOURNAMENT, tournamentId)
  });
  return <div>{tournament}</div>;
}

// Variables derived from query key constants
import { QUERY_KEY_USER } from '@/util/routing/queryKeys';

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
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';

const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
const [queryValue] = useRouterState({ key: keyToUse });
```

### 2. Re-exported Constants
Constants might be re-exported from other files or imported with different names.

```typescript
// Re-export scenario
export { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from './queryKeys';

// Usage with alias
import { QUERY_KEY_NOTIFICATION as NOTIFICATION_KEY } from '@/util/routing/queryKeys';
const [notification] = useRouterState({ key: NOTIFICATION_KEY }); // ✅ Allowed
```

### 3. Multiple Constants Import
Files might import multiple query key constants in a single import statement.

```typescript
import {
  QUERY_KEY_NOTIFICATION,
  QUERY_KEY_CHANNEL,
  QUERY_KEY_PLAYBACK_ID
} from '@/util/routing/queryKeys';

const [notification] = useRouterState({ key: QUERY_KEY_NOTIFICATION });
const [channel] = useRouterState({ key: QUERY_KEY_CHANNEL });
```

## Valid Import Sources

The rule recognizes the following import sources as valid:

- `@/util/routing/queryKeys`
- `src/util/routing/queryKeys`
- `./util/routing/queryKeys`
- `../util/routing/queryKeys`
- `../../util/routing/queryKeys`
- `../../../util/routing/queryKeys`
- `../../../../util/routing/queryKeys`
- Any path ending with `/util/routing/queryKeys`

## Auto-fix Capability

The rule provides automatic fixes for simple string literals by converting them to suggested `QUERY_KEY_*` constant names:

```typescript
// Before (auto-fixable)
const [value] = useRouterState({ key: 'user-profile' });

// After auto-fix
const [value] = useRouterState({ key: QUERY_KEY_USER_PROFILE });
```

Note: Auto-fix only works for simple string literals. Complex expressions require manual refactoring.

## When Not to Use

This rule should not be disabled as it's part of BluMint's architectural transition to centralized router state management. However, if you're working on legacy code that hasn't been migrated yet, you might temporarily disable it for specific files:

```javascript
/* eslint-disable @blumintinc/blumint/enforce-querykey-ts */
```

## Related Rules

- [`prefer-global-router-state-key`](./prefer-global-router-state-key.md) - A more general rule that discourages string literals but doesn't enforce specific imports
