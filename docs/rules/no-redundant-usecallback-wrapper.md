# Prevent wrapping already memoized/stable callbacks from hooks/contexts in an extra useCallback() (`@blumintinc/blumint/no-redundant-usecallback-wrapper`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💭 This rule does not require type information.

Prevent wrapping already memoized callbacks from hooks/contexts with an extra `useCallback`.

## Why

- Reduces unnecessary function allocations.
- Avoids type mismatches from wrapper signatures.
- Improves readability by passing stable callbacks directly.

## Rule Details

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

## Options

```json
{
  "@blumintinc/blumint/no-redundant-usecallback-wrapper": [
    "error",
    {
      "memoizedHookNames": ["useAuthSubmit", "useLoadingWrapper"],
      "assumeAllUseAreMemoized": false
    }
  ]
}
```

- `memoizedHookNames` (default `[]`): additional hook names to treat as returning memoized/stable callbacks.
- `assumeAllUseAreMemoized` (default `false`): when `true`, treat any callee starting with `use` as memoized/stable. Keep `false` to opt in via `memoizedHookNames`.

## Valid

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

## Invalid

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

## Fixes

Where safe, the rule removes the redundant `useCallback` wrapper and passes the memoized function directly.

- When the wrapper simply returns an identifier function (for example, `signIn`) with no arguments, the fixer replaces the wrapper with that identifier.
- Member calls (for example, `svc.handle()`) are reported without an auto-fix to avoid breaking `this` binding.
- Wrappers that supply any arguments—literals, closures, or derived values—are considered non-redundant and are not reported.

## Edge Cases Handled

- Identifies callbacks destructured from hook results.
- Allows substantial logic in wrappers.
- Allows wrappers that transform parameters or supply arguments.
- Detects object member calls from hook results and avoids unsafe auto-fixes.
