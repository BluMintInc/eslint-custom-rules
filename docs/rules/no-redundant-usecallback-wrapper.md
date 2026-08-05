# Prevent wrapping already memoized/stable callbacks from hooks/contexts in an extra useCallback() (`@blumintinc/blumint/no-redundant-usecallback-wrapper`)

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

`useLatestCallback` counts as a memoization wrapper too, and is reported on exactly the same terms. It is the spelling [`use-latest-callback`](use-latest-callback.md) — enabled in the same `recommended` config, and fixable — rewrites every `useCallback(fn, deps)` into, so a wrapper around an already stable callback survives that rewrite unchanged: `useLatestCallback(() => signIn())` still allocates a fresh arrow on every render around a callback the hook already keeps stable. The local binding is resolved from the `use-latest-callback` module rather than matched by name, because that rule's fixer names its import with `freeImportName` and emits `useLatestCallback2` when `useLatestCallback` is already taken. Both the default and named specifier forms are recognized, under any local alias.

Example message:
`useCallback is wrapping memoized callback "signIn", adding a redundant memoization layer without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.`

The leading word is the wrapper actually found, so a report on the other spelling opens with `useLatestCallback` (or whatever local name the import bound).

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

These declare `assumeAllUseAreMemoized: true` for the same reason the invalid examples below do: under the default options the rule does not recognize `useAuthSubmit`/`useUserContext` as returning memoized callbacks at all, so it would never reach the logic these examples exist to demonstrate. Each wrapper here is allowed *despite* the callback being recognized as memoized.

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
const { signIn } = useAuthSubmit();
return <Button onClick={signIn} />;
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
const { updateUser } = useUserContext();
const onSubmit = useCallback((e) => {
  e.preventDefault();
  const form = new FormData(e.target as HTMLFormElement);
  updateUser(userId, Object.fromEntries(form));
}, [updateUser, userId]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => {
  track('sign_in');
  signIn();
  setOpen(true);
}, [signIn, track, setOpen]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// Transforming arguments; multiple dependencies
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => signIn(username), [signIn, username]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// Suppressing the event is behaviour the hand-off cannot preserve
const { signIn } = useAuthSubmit();
const onClick = useCallback((e) => {
  e.preventDefault();
  return signIn();
}, [signIn]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// Recognizing useLatestCallback is not an amnesty on the wrapper: this callback
// comes from props, so the wrapper is the only thing making it stable
import useLatestCallback from 'use-latest-callback';

function Row({ onDone }) {
  const onClick = useLatestCallback(() => onDone());
  return <Button onClick={onClick} />;
}
```

## Invalid

`useAuthSubmit` and `useSomething` are only treated as returning memoized callbacks once the rule is told so. Each example below therefore declares `assumeAllUseAreMemoized: true`; naming the hooks in `memoizedHookNames` produces the same reports.

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ Redundant direct wrapper
const { signIn } = useAuthSubmit();
const onClick = useCallback(signIn, [signIn]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ Redundant trivial wrapper
const { signIn } = useAuthSubmit();
const onClick = useCallback(() => signIn(), [signIn]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ Redundant trivial wrapper on object ref
const svc = useSomething();
const onClick = useCallback(() => svc.handle(), [svc]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ Same redundant wrapper under the useLatestCallback spelling
import useLatestCallback from 'use-latest-callback';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback(() => signIn());
  return <Button onClick={onClick} />;
}
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ The alias use-latest-callback's own fixer emits under a name collision
import useLatestCallback2 from 'use-latest-callback';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback2(signIn);
  return <Button onClick={onClick} />;
}
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
- Allows wrappers that call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`: passing the memoized callback directly drops the suppression call and hands the event to a callback that took no arguments, so the wrapper is doing work.
- Allows a wrapper whose body sequences a second statement: the memoized callback alone does not perform it, so collapsing the wrapper would drop it.
- Detects object member calls from hook results and avoids unsafe auto-fixes.
- Treats `useLatestCallback` as a memoization wrapper alongside `useCallback` and `React.useCallback`, resolving the local binding from the `use-latest-callback` module so aliases such as `useLatestCallback2` are recognized. Every carve-out above applies to that spelling unchanged.
