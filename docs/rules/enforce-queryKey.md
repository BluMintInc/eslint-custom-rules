# enforce-queryKey

Enforces the use of centralized router state key constants imported from `src/util/routing/queryKeys.ts` instead of arbitrary string literals when calling router methods that accept key parameters.

## Rule Details

This rule addresses the anti-pattern of scattered string literals throughout the codebase for router state management, which leads to inconsistency, typos, and maintenance difficulties.

As BluMint transitions to centralized router state management with the new query parameter persistence system, it's critical that all router key references use the predefined `QUERY_KEY_*` constants. This ensures type safety, prevents typos, enables better refactoring, and maintains consistency across the application's routing layer.

### Examples

#### ❌ Incorrect

```typescript
// Using string literals directly
const [playbackId] = useRouterState({ key: 'playback-id' });

// Using string literals with concatenation
const [value] = useRouterState({ key: 'playback-' + id });

// Using string literals in template literals
const [value] = useRouterState({ key: `playback-${id}` });

// Using string literals in conditional expressions
const [value] = useRouterState({
  key: isPlayback ? 'playback-id' : 'channel-id'
});

// Using variables assigned from string literals
const key = 'playback-id';
const [value] = useRouterState({ key });
```

#### ✅ Correct

```typescript
import { QUERY_KEY_PLAYBACK_ID } from '@/util/routing/queryKeys';

// Using imported constants directly
const [playbackId] = useRouterState({ key: QUERY_KEY_PLAYBACK_ID });

// Using imported constants with aliases
import { QUERY_KEY_PLAYBACK_ID as PLAYBACK_KEY } from '@/util/routing/queryKeys';
const [playbackId] = useRouterState({ key: PLAYBACK_KEY });

// Using variables assigned from imported constants
const playbackKey = QUERY_KEY_PLAYBACK_ID;
const [playbackId] = useRouterState({ key: playbackKey });

// Using conditional expressions with imported constants
import { QUERY_KEY_NOTIFICATION, QUERY_KEY_CHANNEL } from '@/util/routing/queryKeys';
const keyToUse = isNotification ? QUERY_KEY_NOTIFICATION : QUERY_KEY_CHANNEL;
const [value] = useRouterState({ key: keyToUse });
```

## When Not To Use It

If your project doesn't use the centralized router state management system with query parameter persistence, this rule may not be applicable.

## Further Reading

- [Router State Management Documentation](https://github.com/BluMintInc/blumint/blob/main/docs/router-state-management.md)
