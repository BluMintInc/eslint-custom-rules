# Prevent redundant wrapping of already-memoized callback functions in React's useCallback or similar memoization hooks. When functions from custom hooks or contexts are already stabilized, wrapping them again creates unnecessary overhead with no additional performance benefits (`@blumintinc/blumint/no-redundant-callback-wrapping`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule prevents redundant wrapping of already-memoized callback functions in React's `useCallback` or similar memoization hooks. When functions from custom hooks or contexts are already stabilized with hooks like `useCallback`, `useDeepCompareCallback`, or similar mechanisms, wrapping them again in another `useCallback` creates unnecessary overhead with no additional performance benefits.

This pattern often occurs when developers try to adapt event handler signatures or follow habits of wrapping all callbacks. In the BluMint codebase, it's especially problematic when using UI components with event handlers that expect a different signature than our memoized functions, leading to both type errors and redundant function allocations.

## Examples

### ❌ Incorrect

```javascript
import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit(); // signIn is already memoized in AuthSubmitContext

  // Redundant wrapper causes type issues and unnecessary overhead
  const handleSignIn = useCallback(() => {
    signIn();
  }, [signIn]);

  return <LoadingButton onClick={handleSignIn}>Sign In</LoadingButton>;
}
```

```javascript
// Redundant useMemo wrapping
function Component() {
  const { calculate } = useCalculator();
  const memoizedCalculate = useMemo(() => () => calculate(), [calculate]);
  return <button onClick={memoizedCalculate}>Calculate</button>;
}
```

### ✅ Correct

```javascript
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit(); // signIn is already memoized in AuthSubmitContext

  // Pass the memoized function directly, let TypeScript handle any type coercion
  return <LoadingButton onClick={signIn}>Sign In</LoadingButton>;
}
```

```javascript
// Valid: Function with substantial additional logic
function SignInButton() {
  const { signIn } = useAuthSubmit();
  const handleSignIn = useCallback(() => {
    trackEvent('sign_in_attempt');
    signIn();
    setSomeLocalState(true);
  }, [signIn, trackEvent, setSomeLocalState]);
  return <button onClick={handleSignIn}>Sign In</button>;
}
```

```javascript
// Valid: Parameter transformation
function UserForm() {
  const { updateUser } = useUserContext();
  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    updateUser(userId, Object.fromEntries(formData));
  }, [updateUser, userId]);
  return <form onSubmit={handleSubmit}></form>;
}
```

```javascript
// Valid: Multiple dependencies with arguments
function SignInButton() {
  const { signIn } = useAuthSubmit();
  const [username, setUsername] = useState('');
  const handleSignInWithUsername = useCallback(() => {
    signIn(username);
  }, [signIn, username]);
  return <button onClick={handleSignInWithUsername}>Sign In</button>;
}
```

## Options

This rule accepts an options object with the following properties:

### `hookPatterns`

An array of patterns to identify hook functions that return memoized functions. Supports glob-like patterns with `*`.

- **Type**: `string[]`
- **Default**: `['use*']`

### `allowedWrapperPatterns`

An array of patterns to identify memoization wrapper functions that should be checked for redundancy.

- **Type**: `string[]`
- **Default**: `['useCallback', 'useMemo', 'useDeepCompareCallback', 'useDeepCompareMemo']`

## Config

```json
{
  "rules": {
    "@blumintinc/blumint/no-redundant-callback-wrapping": [
      "error",
      {
        "hookPatterns": ["use*", "createCustomHook*"],
        "allowedWrapperPatterns": ["useCallback", "useMemo", "useCustomMemo"]
      }
    ]
  }
}
```

## When Not To Use It

You might want to disable this rule if:

- You have a codebase where explicit wrapping is preferred for consistency
- You're working with legacy code that relies on specific wrapping patterns
- You need to maintain compatibility with older React patterns

## Benefits

This rule improves code quality and performance by:

1. Reducing unnecessary function allocations in the render cycle
2. Preventing type mismatches that occur when wrapping callback functions with different signatures
3. Making code more readable by eliminating unnecessary callback layers
4. Aligning with React's performance optimization best practices
