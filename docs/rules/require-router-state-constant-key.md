# require-router-state-constant-key

Enforces the use of constant variables with `as const` assertion for the `key` parameter in `useRouterState` hook calls.

## Rule Details

This rule aims to prevent typos and make router state keys more maintainable by ensuring they are defined as constants. This is particularly important because our app uses URL parameters as the primary global state management solution, and typos in these keys could lead to silent failures or unexpected behavior.

## Examples

### ❌ Incorrect

```ts
// Direct string literals are error-prone and hard to refactor
const [value, setValue] = useRouterState({ key: 'match-session' });

// Variables without type assertion don't guarantee immutability
const matchKey = 'match-session';
const [value2, setValue2] = useRouterState({ key: matchKey });

// Objects without type assertion
const TOURNAMENT_KEYS = {
  MATCH_DIALOG: 'match-session',
};
const [value3, setValue3] = useRouterState({ key: TOURNAMENT_KEYS.MATCH_DIALOG });
```

### ✅ Correct

```ts
// Constant with type assertion ensures immutability and enables refactoring
const MATCH_DIALOG_KEY = 'match-session' as const;
const [value, setValue] = useRouterState({ key: MATCH_DIALOG_KEY });

// Multiple related constants can be grouped
const TOURNAMENT_KEYS = {
  MATCH_DIALOG: 'match-session',
  SESSION_DIALOG: 'session-dialog',
  MATCH_ENTRY: 'match-entry',
} as const;
const [value2, setValue2] = useRouterState({ key: TOURNAMENT_KEYS.MATCH_DIALOG });

// Dynamic keys with template literals are allowed
const [value3, setValue3] = useRouterState({ key: `${prefix}-${id}` });

// Logical expressions with constants are allowed
const DEFAULT_KEY = 'default' as const;
const [value4, setValue4] = useRouterState({ key: providedKey || DEFAULT_KEY });
```

## When Not To Use It

If you don't use the `useRouterState` hook in your codebase or if you prefer a more flexible approach to managing router state keys.

## Further Reading

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [URL-based state management](https://reactrouter.com/web/guides/quick-start)
