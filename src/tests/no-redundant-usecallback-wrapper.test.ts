import { Linter, Rule } from 'eslint';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { noRedundantUseCallbackWrapper } from '../rules/no-redundant-usecallback-wrapper';
import { useLatestCallback } from '../rules/use-latest-callback';

// The wrapper defaults to `useCallback` because most fixtures use that
// spelling; the ones asserting the useLatestCallback spelling name it, which is
// what proves the report identifies the wrapper it actually found rather than
// describing a `useCallback` that is not in the code.
const redundantMessage = (callbackName: string, wrapper = 'useCallback') =>
  `${wrapper} is wrapping memoized callback "${callbackName}", adding a redundant memoization layer without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.`;

const redundantError = (callbackName: string, wrapper?: string) => ({
  message: redundantMessage(callbackName, wrapper),
});

const valid = [
  // Substantial logic: allowed
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => {
    track('x');
    signIn();
    setS(true);
  }, [signIn, track, setS]);
  return <button onClick={handle}/>;
}`,
  },
  // Parameter transformation: allowed
  {
    code: `import { useCallback } from 'react';
import { useUser } from 'x';

function C({ userId }) {
  const { updateUser } = useUser();
  const onSubmit = useCallback((e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    updateUser(userId, Object.fromEntries(data));
  }, [updateUser, userId]);
  return <form onSubmit={onSubmit}/>;
}`,
  },
  // Multiple dependencies with argument usage: allowed
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const [u] = React.useState('name');
  const handle = useCallback(() => {
    signIn(u);
  }, [signIn, u]);
  return <button onClick={handle}/>;
}`,
  },
  // Wrapper calling non-hook function: allowed (not tracked)
  {
    code: `import { useCallback } from 'react';

function C() {
  const fn = () => {};
  const h = useCallback(() => fn(), [fn]);
  return <button onClick={h}/>;
}`,
  },
  // JSX-returning callbacks (not our target) still valid
  {
    code: `import { useCallback } from 'react';

function C({ items }) {
  const render = useCallback((item) => <div>{item}</div>, []);
  return <ul>{items.map(render)}</ul>;
}`,
  },
  // Wrapper with preventDefault but parameter transformation: allowed
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';
function C(){
  const { act } = useSomething();
  const onSubmit = useCallback((e) => {
    e.preventDefault();
    act(e.target.value);
  }, [act]);
  return <form onSubmit={onSubmit}/>;
}`,
  },
  // Member-expression wrapper auto-fix disabled: rule still flags but no output expected here, so treat as valid if not configured hooks
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';
function C() {
  const svc = useSomething();
  const click = useCallback(() => svc.handle(), [svc]);
  return <button onClick={click}/>;
}`,
    // No options => hook not recognized
  },
  // Wrapper supplying extra argument should be allowed
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';
function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => signIn('u'), [signIn]);
  return <button onClick={handle}/>;
}`,
  },
  // assumeAllUseAreMemoized: false leaves an unlisted use* hook untracked. Same
  // code is reported once the flag is on (see the invalid section), so the flag
  // is what drives the report, not the fixture.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: false }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // The assumption is scoped to the `use` prefix, not to any call result: a
  // plain factory call returns no stability guarantee, so the wrapper stays.
  {
    code: `import { useCallback } from 'react';
import { getSomething } from 'src/hooks/getSomething';

function C() {
  const signIn = getSomething();
  const handle = useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // preventDefault() is the reason the wrapper exists, so the wrapper is not
  // redundant: handing `signIn` to React directly drops the call and hands the
  // event to a callback that takes no arguments. The rule's remedy ("pass the
  // hook callback directly") cannot preserve either behaviour.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e.preventDefault();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // stopPropagation() suppresses bubbling the same way, and the hand-off loses
  // it just as completely.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e.stopPropagation();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // stopImmediatePropagation() likewise.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e.stopImmediatePropagation();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // The delegate call being an expression statement rather than a return makes
  // no difference: the suppression call still disappears with the wrapper.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e.preventDefault();
    signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // A destructured event parameter reaches preventDefault through an alias.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(({ nativeEvent: evt }) => {
    evt.preventDefault();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // Destructuring the method itself off the event leaves a bare call, which is
  // the same load-bearing statement without a receiver.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(({ preventDefault }) => {
    preventDefault();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // The receiver need not be a parameter. A captured event is suppressed just
  // as effectively, and collapsing the wrapper deletes the call either way.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C({ pendingEvent }) {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    pendingEvent.preventDefault();
    return signIn();
  }, [signIn, pendingEvent]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // Nor need the receiver be a plain identifier.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e.nativeEvent.stopPropagation();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // An optionally invoked suppression call still runs whenever the method is
  // present, so the wrapper still carries behaviour.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    e?.preventDefault?.();
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // Statement order does not make the suppression call droppable.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => {
    signIn();
    e.stopPropagation();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // The same body written as a sequence expression carries the same behaviour.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback((e) => (e.preventDefault(), signIn()), [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // A suppression call inside a member wrapper is equally load-bearing, and
  // member wrappers are reported (without a fix) when nothing else intervenes.
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const svc = useSomething();
  const onClick = useCallback((e) => {
    e.preventDefault();
    return svc.handle();
  }, [svc]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useSomething'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // A wrapper that sequences a second call is not redundant: the delegate alone
  // does not perform it, so collapsing the wrapper would drop it.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    signIn();
    setOpen(true);
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // The same holds when the delegate is returned rather than called for effect.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    track('click');
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // A trailing statement after the delegate is unreachable but still text the
  // fix would delete, so the wrapper stays untouched.
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    return signIn();
    console.log('unreachable');
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // Recognizing useLatestCallback is not a blanket amnesty on the wrapper: the
  // callback here comes from props, not from a hook, so nothing guarantees its
  // stability and the wrapper is the only thing providing it. This differs from
  // the invalid fixtures below by exactly one thing — where the callback comes
  // from — so it fails if the new spelling is treated as reportable on sight.
  {
    code: `import useLatestCallback from 'use-latest-callback';

function C({ onDone }) {
  const handle = useLatestCallback(() => onDone());
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // A wrapper closing over props and state is doing real work regardless of the
  // spelling of the wrapper.
  {
    code: `import useLatestCallback from 'use-latest-callback';

function C({ userId, onDone }) {
  const [count, setCount] = React.useState(0);
  const handle = useLatestCallback(() => {
    setCount(count + 1);
    onDone(userId);
  });
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Every carve-out the useCallback spelling gets applies to this spelling too:
  // supplying an argument makes the wrapper non-redundant.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C({ username }) {
  const { signIn } = useAuthSubmit();
  const handle = useLatestCallback(() => signIn(username));
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // ...as does suppressing the event, which the hand-off cannot preserve.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback((e) => {
    e.preventDefault();
    return signIn();
  });
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
  // ...as does sequencing a second call the delegate does not perform.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback(() => {
    signIn();
    setOpen(true);
  });
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
  },
];

const invalid = [
  // Direct pass-through of memoized function identifier
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(signIn, [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Arrow returning call to memoized function, no args: auto-fix
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Block body whose single statement returns the memoized callback: auto-fix
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
  // Block body whose single statement calls the memoized callback: auto-fix
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(() => {
    signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
  // Function expression wrappers collapse like arrow wrappers do
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useCallback(function () {
    return signIn();
  }, [signIn]);
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
  // Block body returning a hook object member: report only (no fix)
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const svc = useSomething();
  const click = useCallback(() => {
    return svc.handle();
  }, [svc]);
  return <button onClick={click}/>;
}`,
    options: [{ memoizedHookNames: ['useSomething'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('svc.handle')],
    output: null,
  },
  // Member on hook object: const a = useX(); useCallback(() => a.do(), [a])
  // Recognize hook via options; report only (no fix)
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const svc = useSomething();
  const click = useCallback(() => svc.handle(), [svc]);
  return <button onClick={click}/>;
}`,
    options: [{ memoizedHookNames: ['useSomething'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('svc.handle')],
  },
  // Redundant wrapper with known memoized hook list (custom hook name)
  {
    code: `import { useCallback } from 'react';
function useAuthSubmit(){ return { signIn: () => {} } }
function C(){
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
function useAuthSubmit(){ return { signIn: () => {} } }
function C(){
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Direct identifier from object destructuring: useCallback(signIn)
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C(){
  const ctx = useAuthSubmit();
  const h = useCallback(ctx.signIn, [ctx.signIn]);
  return <button onClick={h}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('ctx.signIn')],
  },
  // React.useCallback, no-arg wrapper: auto-fix
  {
    code: `import React from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = React.useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import React from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // React.useCallback, direct identifier: auto-fix
  {
    code: `import React from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = React.useCallback(signIn, [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn')],
    output: `import React from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // assumeAllUseAreMemoized: true treats every `use`-prefixed call as a source
  // of stable references, so a hook absent from memoizedHookNames is tracked.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => signIn(), [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Same assumption applied to the direct pass-through form.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(signIn, [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Namespaced hook call: the assumption reads the member property name, so
  // `hooks.useMyCustomThing()` is tracked too. Member callbacks are reported
  // without a fix — rebinding `svc.handle` would drop its `this`.
  {
    code: `import { useCallback } from 'react';
import * as hooks from 'src/hooks';

function C() {
  const svc = hooks.useMyCustomThing();
  const click = useCallback(() => svc.handle(), [svc]);
  return <button onClick={click}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('svc.handle')],
    output: null,
  },
  // useLatestCallback is the same wrapper under a different name, and the same
  // redundancy: `use-latest-callback` is 'error' in this config and fixable, so
  // its `--fix` renames every useCallback into this spelling while leaving the
  // wrapper byte-for-byte intact, and the config mandating it means the spelling
  // is also written by hand.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useLatestCallback(() => signIn());
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'useLatestCallback')],
    output: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Block body, useLatestCallback spelling.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback(() => {
    return signIn();
  });
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'useLatestCallback')],
    output: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
  // Direct pass-through of an already stable identifier.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useLatestCallback(signIn);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'useLatestCallback')],
    output: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Direct pass-through of a member on the hook result: reported without a fix,
  // exactly as the useCallback spelling is.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const ctx = useAuthSubmit();
  const handle = useLatestCallback(ctx.signIn);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('ctx.signIn', 'useLatestCallback')],
    output: null,
  },
  // A namespaced hook receiver feeding the new spelling.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import * as hooks from 'src/hooks';

function C() {
  const svc = hooks.useMyCustomThing();
  const click = useLatestCallback(() => svc.handle());
  return <button onClick={click}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('svc.handle', 'useLatestCallback')],
    output: null,
  },
  // The module's sole export is the hook, so its DEFAULT specifier binds it
  // under whatever local name the file chose. `use-latest-callback`'s fixer
  // picks that name with freeImportName and emits `useLatestCallback2` when the
  // plain name is taken, so the alias is authored by the sibling fixer itself —
  // matching the bare name would miss every file it collides in.
  {
    code: `import useLatestCallback2 from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

const useLatestCallback = 'not the hook';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useLatestCallback2(() => signIn());
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'useLatestCallback2')],
    output: `import useLatestCallback2 from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

const useLatestCallback = 'not the hook';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // An arbitrary alias of the default export resolves the same way.
  {
    code: `import stableCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = stableCallback(() => signIn());
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'stableCallback')],
    output: `import stableCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // The named-specifier form of the same hook.
  {
    code: `import { useLatestCallback as stable } from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = stable(() => signIn());
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'stable')],
    output: `import { useLatestCallback as stable } from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Function-expression wrappers collapse under the new spelling too.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = useLatestCallback(function () {
    signIn();
  });
  return <button onClick={onClick}/>;
}`,
    options: [{ memoizedHookNames: ['useAuthSubmit'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('signIn', 'useLatestCallback')],
    output: `import useLatestCallback from 'use-latest-callback';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
];

ruleTesterJsx.run(
  'no-redundant-usecallback-wrapper (jsx)',
  noRedundantUseCallbackWrapper,
  { valid, invalid } as any,
);

ruleTesterTs.run(
  'no-redundant-usecallback-wrapper (ts)',
  noRedundantUseCallbackWrapper,
  {
    valid: [
      // using assertion instead of wrapper
      {
        code: `import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';
type Click = React.MouseEventHandler<HTMLButtonElement>;
function C(){
  const { signIn } = useAuthSubmit();
  const x = signIn as unknown as Click;
  return x as any;
}`,
      },
    ],
    invalid: [],
  },
);

/**
 * `use-latest-callback` is 'error' in the same recommended config and fixable,
 * so its `--fix` rewrites `useCallback(fn, deps)` into `useLatestCallback(fn)`.
 * The redundant wrapper survives that rewrite byte-for-byte, so a rule matching
 * only the literal name `useCallback` goes blind on its own config's output.
 *
 * Every `RuleTester` case above runs one rule at a time and is structurally
 * incapable of seeing that, which is why this composition is asserted directly.
 */
describe('composition with use-latest-callback', () => {
  const OPTIONS = { memoizedHookNames: ['useAuthSubmit'] };

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/no-redundant-usecallback-wrapper',
      noRedundantUseCallbackWrapper as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/use-latest-callback',
      useLatestCallback as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const baseConfig = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
  };

  const SOURCE = `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

export function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => signIn(), [signIn]);
  return handle;
}`;

  it('reports the wrapper the sibling fixer renames out of view', () => {
    const linter = makeLinter();
    const { output } = linter.verifyAndFix(
      SOURCE,
      {
        ...baseConfig,
        rules: { 'test/use-latest-callback': 'error' as const },
      },
      'C.tsx',
    );

    // Without this the assertion below is vacuous: an unrun sibling fixer
    // leaves the `useCallback` spelling, which the rule always reported.
    expect(output).toContain('useLatestCallback(() => signIn())');
    expect(output).not.toContain('useCallback(');

    const messages = linter.verify(
      output,
      {
        ...baseConfig,
        rules: {
          'test/no-redundant-usecallback-wrapper': ['error', OPTIONS] as const,
        },
      },
      'C.tsx',
    );

    expect(messages.map((message) => message.messageId)).toEqual([
      'redundantWrapper',
    ]);
  });

  it('collapses the wrapper when both rules fix, and the result settles', () => {
    const linter = makeLinter();
    const config = {
      ...baseConfig,
      rules: {
        'test/use-latest-callback': 'error' as const,
        'test/no-redundant-usecallback-wrapper': ['error', OPTIONS] as const,
      },
    };
    const { output } = linter.verifyAndFix(SOURCE, config, 'C.tsx');

    expect(output).toContain('const handle = signIn;');
    expect(linter.verify(output, config, 'C.tsx')).toEqual([]);
  });

  it('leaves a wrapper the sibling produced around an unstable callback', () => {
    const linter = makeLinter();
    const source = `import { useCallback } from 'react';

export function C({ onDone }) {
  const handle = useCallback(() => onDone(), [onDone]);
  return handle;
}`;
    const config = {
      ...baseConfig,
      rules: {
        'test/use-latest-callback': 'error' as const,
        'test/no-redundant-usecallback-wrapper': ['error', OPTIONS] as const,
      },
    };
    const { output } = linter.verifyAndFix(source, config, 'C.tsx');

    // The wrapper is what makes a prop callback stable, so recognizing the new
    // spelling must not collapse it.
    expect(output).toContain('useLatestCallback(() => onDone())');
  });
});
