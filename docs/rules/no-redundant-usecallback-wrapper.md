# Prevent wrapping already memoized/stable callbacks from hooks/contexts in an extra useCallback() (`@blumintinc/blumint/no-redundant-usecallback-wrapper`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Prevent wrapping already memoized callbacks from hooks/contexts with an extra `useCallback`.

## Why

- Hook/context callbacks are already referentially stable; wrapping them in `useCallback` adds a second dependency array without improving stability and can drift from the hook's own deps.
- Redundant wrappers hide the fact that the hook returns a stable function, forcing readers to reason about two dependency lists and a wrapper signature that does nothing.
- Removing the wrapper keeps React's dependency tracking focused on the original callback and avoids extra allocations and needless code.

## Rule Details

The rule reports `useCallback` when it only forwards a callback that was already memoized by a hook/context (identifier or member) without adding logic or changing arguments. Wrappers that transform parameters, add side effects, or pass additional arguments are allowed.

Example message:
`useCallback is wrapping memoized callback "signIn", adding a redundant dependency array without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.`

Flags cases like:

```tsx
import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  const handleSignIn = useCallback(() => signIn(), [signIn]); // ✖ redundant wrapper around memoized callback
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
