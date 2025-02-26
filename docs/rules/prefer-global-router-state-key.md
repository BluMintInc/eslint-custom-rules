# prefer-global-router-state-key

Enforce using global constants or type-safe functions for `useRouterState` key parameter.

## Rule Details

This rule encourages type safety and maintainability for the `key` parameter in `useRouterState` hook calls. It enforces best practices by requiring the use of global constants or type-safe functions instead of string literals.

### Why?

- **Type Safety**: Using constants or type-safe functions provides better type checking and IDE support
- **Maintainability**: Centralizing key definitions makes it easier to track and update them
- **Consistency**: Ensures a consistent approach to router state key management across the codebase

### Examples

#### ❌ Incorrect

```typescript
// Untyped string literals lack type safety and IDE support
const [value, setValue] = useRouterState({ key: 'match-session' });

// Implicit any types don't provide type checking
const matchKey = someFunction(); // type is implicit
const [value2, setValue2] = useRouterState({ key: matchKey });
```

#### ✅ Correct

```typescript
// Type-safe constant for static keys
export const MATCH_DIALOG_KEY = 'match-session' as const;
const [value, setValue] = useRouterState({ key: MATCH_DIALOG_KEY });

// Type-safe dynamic key generation
type ValidPrefix = 'match' | 'tournament' | 'session';
function generateKey(prefix: ValidPrefix, id: string): string {
  return `${prefix}-${id}`;
}
const [value2, setValue2] = useRouterState({
  key: generateKey('match', userId)
});

// Type-safe prop usage
interface DialogProps {
  routerKey: string; // Consider using more specific types like `ValidPrefix`
}
function Dialog({ routerKey }: DialogProps) {
  const [value, setValue] = useRouterState({ key: routerKey });
}
```

## Options

This rule has no options.

## When Not To Use It

You might consider disabling this rule in test files or in cases where you need to quickly prototype with string literals.

## Further Reading

- [URL-based State Management Best Practices](https://example.com)
- [Type Safety in React Applications](https://example.com)
