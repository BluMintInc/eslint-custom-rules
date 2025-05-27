# enforce-routerStateKeys

Enforce the use of centralized router state key constants from `src/util/routing/routerStateKeys.ts` instead of arbitrary string literals when calling router methods that accept key parameters.

## Rule Details

This rule enforces the use of the `QueryKey` namespace imported from `src/util/routing/routerStateKeys.ts` for router state keys. This ensures type safety, prevents typos, enables better refactoring, and maintains consistency across the application's routing layer.

### ❌ Incorrect

```tsx
// Using string literals directly
const [playbackId] = useRouterState({ key: 'playback-id' });

// Using template literals with static parts
const [value] = useRouterState({ key: `notification-${id}` });

// Using string concatenation
const [value] = useRouterState({ key: 'notification' + '-' + id });

// Using conditional expression with string literals
const [value] = useRouterState({
  key: isNotification ? 'notification' : 'channel'
});
```

### ✅ Correct

```tsx
import { QueryKey } from '@/util/routing/routerStateKeys';

// Using QueryKey constants
const [playbackId] = useRouterState({ key: QueryKey.PLAYBACK_ID });

// Using QueryKey with an alias
import { QueryKey as RouterKeys } from '@/util/routing/routerStateKeys';
const [playbackId] = useRouterState({ key: RouterKeys.PLAYBACK_ID });

// Using namespace import
import * as RouterStateKeys from '@/util/routing/routerStateKeys';
const [playbackId] = useRouterState({ key: RouterStateKeys.QueryKey.PLAYBACK_ID });

// Using a variable that references QueryKey
const keyToUse = QueryKey.PLAYBACK_ID;
const [playbackId] = useRouterState({ key: keyToUse });

// Using a conditional expression with QueryKey constants
const [value] = useRouterState({
  key: isNotification ? QueryKey.NOTIFICATION : QueryKey.CHANNEL
});
```

## Options

This rule has no options.

## When Not To Use It

If you're not using the centralized router state key system or if you're working in a codebase that doesn't use the `useRouterState` hook, you can disable this rule.

## Further Reading

- [BluMint Router State Management Documentation](https://github.com/BluMintInc/eslint-custom-rules)
