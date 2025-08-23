## no-redundant-usecallback-wrapper

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
      "memoizedHookNames": ["useAuthSubmit", "useLoadingWrapper", "useSomething"]
    }
  ]
}
```

- `memoizedHookNames`: additional hook names to treat as returning memoized/stable callbacks.
  By default, the rule treats any call starting with `use` as a hook.

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
When arguments are transformed, it reports without auto-fix.

### Edge Cases Handled

- Identifies callbacks destructured from hook results
- Allows substantial logic in wrappers
- Allows wrappers that transform parameters
- Detects object member calls from hook results

