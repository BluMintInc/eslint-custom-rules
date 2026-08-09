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

Memoization that is visible in the same file needs no configuration. A `const` initialized from `useCallback`, `useLatestCallback`, or a `useMemo` whose factory hands back a function literal holds a callback this rule can prove is already stable, so re-wrapping it is reported under the default options. The binding is resolved through scope analysis rather than matched by name, so the memoized `handleSelect` of one component never vouches for the `handleSelect` prop of another. `useMemo` memoizes any value, so its result counts as a memoized *callback* only when the factory demonstrably produces a function — a factory returning a call result, a conditional, or a value assembled across several statements proves nothing and is left alone.

Everything else needs `memoizedHookNames` (or `assumeAllUseAreMemoized`): the stability of a callback a hook or context hands out is knowledge this rule cannot read out of the file it is linting.

`useLatestCallback` counts as a memoization wrapper too, and is reported on exactly the same terms. It is the spelling [`use-latest-callback`](use-latest-callback.md) — enabled in the same `recommended` config, and fixable — rewrites every `useCallback(fn, deps)` into, so a wrapper around an already stable callback survives that rewrite unchanged: `useLatestCallback(() => signIn())` still allocates a fresh arrow on every render around a callback the hook already keeps stable. The local binding is resolved from the `use-latest-callback` module rather than matched by name, because that rule's fixer names its import with `freeImportName` and emits `useLatestCallback2` when `useLatestCallback` is already taken. Both the default and named specifier forms are recognized, under any local alias.

Example message:
`useCallback is wrapping memoized callback "signIn", adding a redundant memoization layer without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.`

The leading word is the wrapper actually found, so a report on the other spelling opens with `useLatestCallback` (or whatever local name the import bound).

Flags cases like:

```tsx
import { useCallback } from 'react';

function SignInButton() {
  const signIn = useCallback(() => submitCredentials(), []);
  const handleSignIn = useCallback(() => signIn(), [signIn]); // ✖ redundant wrapper around an already memoized callback
  return <LoadingButton onClick={handleSignIn}>Sign In</LoadingButton>;
}
```

Use the memoized function directly:

```tsx
import { useCallback } from 'react';

function SignInButton() {
  const signIn = useCallback(() => submitCredentials(), []);
  return <LoadingButton onClick={signIn}>Sign In</LoadingButton>;
}
```

A callback the file receives ready-made carries no such proof, so the same wrapper around a context callback is reported only once the hook is declared memoizing:

```tsx
// eslint-options: {"memoizedHookNames": ["useAuthSubmit"]}
import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function SignInButton() {
  const { signIn } = useAuthSubmit();
  const handleSignIn = useCallback(() => signIn(), [signIn]); // ✖ redundant wrapper around memoized callback
  return <LoadingButton onClick={handleSignIn}>Sign In</LoadingButton>;
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

The examples naming `useAuthSubmit`/`useUserContext` declare `assumeAllUseAreMemoized: true` for the same reason the invalid ones below do: nothing in those files proves those hooks return memoized callbacks, so without the option the rule would never reach the logic they exist to demonstrate. Each wrapper there is allowed *despite* the callback being recognized as memoized. The examples built on `useCallback`/`useMemo` need no options, because the memoization is in the source.

```tsx
// A locally declared arrow is a fresh function on every render, so the wrapper
// is what gives it a stable identity
const fn = () => doThing();
const outer = useCallback(fn, [fn]);
```

```tsx
// Bindings are resolved through scope analysis, so a memoized `inner` elsewhere
// in the file does not vouch for this prop
function Row({ inner }) {
  const outer = useCallback(inner, [inner]);
  return <Button onClick={outer} />;
}
```

```tsx
// useMemo memoizes any value; a factory whose result is a call is not provably
// a callback
const value = useMemo(() => compute(), []);
const outer = useCallback(value, [value]);
```

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
// The suppression call is what the wrapper is for, whichever body spells it
const { preventDefault } = useEventHandlers();
const onClick = useCallback(() => preventDefault(), [preventDefault]);
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

These need no options: each callback is memoized by a call in the same file.

```tsx
// ✖ Re-wrapping a callback useCallback already memoized
const inner = useCallback(() => doThing(), []);
const outer = useCallback(inner, [inner]);
```

```tsx
// ✖ The same redundancy in the forwarding spelling
const inner = useCallback(() => doThing(), []);
const outer = useCallback(() => inner(), [inner]);
```

```tsx
// ✖ A useMemo factory that hands back a function produces a memoized callback
const inner = useMemo(() => () => doThing(), []);
const outer = useCallback(inner, [inner]);
```

```tsx
// ✖ Both spellings of the wrapper, on both sides
import useLatestCallback from 'use-latest-callback';

const inner = useLatestCallback(() => doThing());
const outer = useLatestCallback(() => inner());
```

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
// ✖ A hook that returns the callback itself, wrapped the same way
const submit = useSomething();
const onClick = useCallback(() => submit(), [submit]);
```

```tsx
// eslint-options: {"assumeAllUseAreMemoized": true}
// ✖ The same wrapper spelled with a block body
const submit = useSomething();
const onClick = useCallback(() => {
  return submit();
}, [submit]);
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

### The import the collapse orphans

Collapsing the last wrapper in a file deletes the last reference to the binding
that named it, so the same fix drops the specifier it just orphaned. Without
that, `--fix` turns a clean file into one that fails
`@typescript-eslint/no-unused-vars` and `noUnusedLocals`, and since the fix
resolves the report, nothing re-reports the debt.

```tsx
import { useCallback, useMemo } from 'react';

const Row = () => {
  const inner = useMemo(() => () => doThing(), []);
  const outer = useCallback(inner, [inner]); // ✖ collapses to `inner`
  return outer;
};
```

`--fix` yields `import { useMemo } from 'react';` — the sibling specifier on the
same declaration survives, because only the orphaned one is removed.

Only what the rewrite genuinely deletes counts:

- The delegate is **moved**, not deleted, so its own binding stays referenced.
- The wrapper's callee and the dependency array **are** deleted, so a binding
  read only from there — an import used solely as a dependency — is unbound by
  the same edit.
- A surviving reference anywhere else keeps the import. Scope analysis is the
  sole oracle, which is what makes the implicit `React` reference of a JSX
  pragma count as a use.

The rewrites of a file are batched into **one** fix. Judged one call at a time,
a file with two collapsible wrappers never sees either as the binding's last
use, and a fix emitted separately from the unbinding cannot assume its sibling
lands. A suppressed report is excluded from the batch, since its rewrite never
happens and its reference still counts.

The whole fix declines — leaving the report standing without a fixer — when a
binding would be left unreferenced yet cannot be unbound safely: a local
variable, a `require` destructuring, or an import declaration carrying a comment
among its specifiers.

## Edge Cases Handled

- Identifies callbacks destructured from hook results, and callbacks a hook returns directly.
- Answers alike whichever body the wrapper's function is spelled with: a concise arrow, a block body returning the delegate, a block body calling it, or a function expression.
- Reports re-wrapping of a callback memoized in the same file (`useCallback`, `useLatestCallback`, or a `useMemo` yielding a function literal) without any configuration, since that memoization is proven in-source.
- Resolves such a binding through scope analysis, so a shadowing parameter or a same-named prop in another component is not mistaken for the memoized one.
- Leaves a `let` binding alone: it can be reassigned, so the value read at the wrapper need not be the one the memoizing call produced.
- Leaves a wrapper that reads the binding it is initializing alone, rather than collapsing it to `const x = x`.
- Allows substantial logic in wrappers.
- Allows wrappers that transform parameters or supply arguments.
- Allows wrappers that call `preventDefault`, `stopPropagation` or `stopImmediatePropagation`: passing the memoized callback directly drops the suppression call and hands the event to a callback that took no arguments, so the wrapper is doing work. The carve-out is decided from the call, so it reaches every body spelling — `() => preventDefault()`, `() => { return e.preventDefault(); }` and `() => { e.preventDefault(); }` alike — and reads through an optional call.
- Allows a wrapper whose body sequences a second statement: the memoized callback alone does not perform it, so collapsing the wrapper would drop it.
- Detects object member calls from hook results and avoids unsafe auto-fixes.
- Treats `useLatestCallback` as a memoization wrapper alongside `useCallback` and `React.useCallback`, resolving the local binding from the `use-latest-callback` module so aliases such as `useLatestCallback2` are recognized. Every carve-out above applies to that spelling unchanged.
