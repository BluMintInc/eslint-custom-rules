# no-redundant-usecallback-wrapper

Prevent wrapping already memoized callbacks from hooks/contexts with an extra `useCallback`.

### Why

- Reduces unnecessary function allocations
- Avoids type mismatches from wrapper signatures
- Improves readability by passing stable callbacks directly

### Rule Details

Flags cases like:

```tsx
import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  const handleSignIn = useCallback(() => signIn(), [signIn]); // ✖ redundant
  return <LoadingButton onClick={handleSignIn}>Sign In</LoadingButton>;
}
```

Use the memoized function directly:

```tsx
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  return <LoadingButton onClick={signIn}>Sign In</LoadingButton>;
}
```

### Options

```json
{
  "@blumintinc/blumint/no-redundant-usecallback-wrapper": [
    "error",
    {
      "memoizedHookNames": ["useAuthSubmit", "useLoadingWrapper", "useSomething"],
      "assumeAllUseAreMemoized": false
    }
  ]
}
```

- `memoizedHookNames`: additional hook names to treat as returning memoized/stable callbacks.
- `assumeAllUseAreMemoized` (default `false`): when `true`, treat any callee starting with `use` as memoized/stable. Leave `false` to opt-in only via `memoizedHookNames`.

### Valid

```tsx
const { signIn } = useAuthSubmit();
return <Button onClick={signIn} />;
```

```tsx
const { updateUser } = useUserContext();
const onSubmit = useCallback((e) => {
  e.preventDefault();
  const form = new FormData(e.target as HTMLFormElement);
  updateUser(userId, Object.fromEntries(form));
}, [updateUser, userId]);
```

```tsx
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => {
  track('sign_in');
  signIn();
  setOpen(true);
}, [signIn, track, setOpen]);
```

```tsx
// Transforming arguments; multiple dependencies
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => signIn(username), [signIn, username]);
```

### Invalid

```tsx
// ✖ Redundant direct wrapper
const { signIn } = useAuthSubmit();
const onClick = useCallback(signIn, [signIn]);
```

```tsx
// ✖ Redundant trivial wrapper
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => signIn(), [signIn]);
```

```tsx
// ✖ Redundant trivial wrapper on object ref
const svc = useSomething();
const onClick = useCallback(() => svc.handle(), [svc]);
```

### Fixes

Where safe, the rule auto-fixes to pass the memoized function directly (removing `useCallback`).

- If the wrapper simply returns an identifier function (e.g., `signIn`) with no arguments, it auto-fixes to that identifier.
- If the wrapper targets a member function (e.g., `svc.handle()`), it reports without an auto-fix to avoid breaking `this` binding.
- If the wrapper supplies any arguments (literals, closures, or derived values), it is treated as non-redundant and not reported unless it is purely parameter passthrough.

### Edge Cases Handled

- Identifies callbacks destructured from hook results
- Allows substantial logic in wrappers
- Allows wrappers that transform parameters or supply arguments
- Detects object member calls from hook results and avoids unsafe auto-fixes
