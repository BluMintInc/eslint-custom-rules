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
  // A block body delegating to a callback no hook produced proves nothing about
  // stability: a prop is a fresh reference each render, and the wrapper is what
  // stabilizes it. Recognizing the non-destructured hook shape must not widen
  // to every bare identifier a block body happens to call.
  {
    code: `import { useCallback } from 'react';

function C({ onDone }) {
  const handle = useCallback(() => {
    return onDone();
  }, [onDone]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // A module-level function is not a hook result either, whichever body the
  // wrapper is spelled with.
  {
    code: `import { useCallback } from 'react';

function doThing() {}

function C() {
  const handle = useCallback(() => {
    doThing();
  }, []);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // A hook-named call whose result is never a callback is still only tracked as
  // a value, so calling a plain local binding stays untouched.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const local = () => signIn;
  const handle = useCallback(() => {
    return local();
  }, [local]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Sequencing a second call around a non-destructured hook result is work the
  // delegate alone does not do.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => {
    signIn();
    setOpen(true);
  }, [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Supplying an argument makes the wrapper carry the call shape, so it is not
  // interchangeable with the delegate.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C({ username }) {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => {
    return signIn(username);
  }, [signIn, username]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Suppressing the event is behaviour the hand-off cannot preserve, on a
  // non-destructured hook result like on any other.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback((e) => {
    e.preventDefault();
    signIn();
  }, [signIn]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // The suppression carve-out is decided before the statement count, so a lone
  // suppression call sourced from a hook is exempt on its own merits rather
  // than because a second statement happens to sit beside it.
  {
    code: `import { useCallback } from 'react';
import { useEventThing } from 'src/hooks/useEventThing';

function C() {
  const preventDefault = useEventThing();
  const handle = useCallback(() => {
    preventDefault();
  }, [preventDefault]);
  return <button onClick={handle}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // The suppression carve-out is a claim about what the wrapper does, and a
  // concise body does exactly what the block spelling does.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { preventDefault } = useEventHandlers();
  const h = useCallback(() => preventDefault(), [preventDefault]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Returning the suppression call rather than calling it for effect changes
  // nothing about the behaviour the hand-off would drop.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { preventDefault } = useEventHandlers();
  const h = useCallback(() => { return preventDefault(); }, [preventDefault]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // The third spelling of the same wrapper, pinned beside the other two so the
  // carve-out cannot regress to recognizing one statement kind.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { preventDefault } = useEventHandlers();
  const h = useCallback(() => { preventDefault(); }, [preventDefault]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // A function-expression wrapper delivers the suppression call just as a block
  // arrow does.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { stopPropagation } = useEventHandlers();
  const h = useCallback(function () { return stopPropagation(); }, [stopPropagation]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // A receiver sourced from a hook is the shape the concise arm otherwise
  // reports as a member wrapper, so the carve-out has to reach it too.
  {
    code: `import { useCallback } from 'react';

function C() {
  const evt = useEventHandlers();
  const h = useCallback(() => evt.preventDefault(), [evt]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const evt = useEventHandlers();
  const h = useCallback(() => { return evt.stopPropagation(); }, [evt]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const evt = useEventHandlers();
  const h = useCallback(() => { evt.stopImmediatePropagation(); }, [evt]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // Each suppression method carries the same weight, whichever body spells it.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { stopImmediatePropagation } = useEventHandlers();
  const h = useCallback(() => stopImmediatePropagation(), [stopImmediatePropagation]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  // An optional call still runs whenever the method is present, so reading
  // through the chain keeps the carve-out from depending on the `?.` spelling.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { preventDefault } = useEventHandlers();
  const h = useCallback(() => preventDefault?.(), [preventDefault]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const evt = useEventHandlers();
  const h = useCallback(() => { return evt?.preventDefault?.(); }, [evt]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
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
  // A block body delegating to a non-destructured hook result is the same
  // wrapper as the concise spelling, so the two must agree.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => { return signIn(); }, [signIn]);
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
  // The expression-statement spelling of the same block body.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(() => {
    signIn();
  }, [signIn]);
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
  // A function-expression wrapper around the same delegate.
  {
    code: `import { useCallback } from 'react';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function C() {
  const signIn = useMyCustomThing();
  const handle = useCallback(function () {
    return signIn();
  }, [signIn]);
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
  // A hook named in memoizedHookNames reaches the same block-bodied shape, so
  // the recognition does not depend on assumeAllUseAreMemoized.
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const submit = useSomething();
  const handle = useCallback(() => {
    return submit();
  }, [submit]);
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useSomething'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('submit')],
    output: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const submit = useSomething();
  const handle = submit;
  return <button onClick={handle}/>;
}`,
  },
  // The useLatestCallback spelling of the block-bodied shape.
  {
    code: `import useLatestCallback from 'use-latest-callback';
import { useSomething } from 'x';

function C() {
  const submit = useSomething();
  const handle = useLatestCallback(() => {
    return submit();
  });
  return <button onClick={handle}/>;
}`,
    options: [{ memoizedHookNames: ['useSomething'] }] as [
      { memoizedHookNames: string[] },
    ],
    errors: [redundantError('submit', 'useLatestCallback')],
    output: `import useLatestCallback from 'use-latest-callback';
import { useSomething } from 'x';

function C() {
  const submit = useSomething();
  const handle = submit;
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
  // The controls for the suppression carve-out: the same three body spellings
  // over the same destructured hook prop, differing only in the callee's name.
  // Without these the carve-out could be widened into a blanket exemption on
  // any of the three arms and the valid fixtures would still pass.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = useCallback(() => submit(), [submit]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('submit')],
    output: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = submit;
  return <button onClick={h}/>;
}`,
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = useCallback(() => { return submit(); }, [submit]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('submit')],
    output: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = submit;
  return <button onClick={h}/>;
}`,
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = useCallback(() => { submit(); }, [submit]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('submit')],
    output: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = submit;
  return <button onClick={h}/>;
}`,
  },
  {
    code: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = useCallback(function () { return submit(); }, [submit]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('submit')],
    output: `import { useCallback } from 'react';

function C() {
  const { submit } = useEventHandlers();
  const h = submit;
  return <button onClick={h}/>;
}`,
  },
  // The suppression names are matched exactly, so a callee that merely reads
  // like one of them is still a redundant delegate.
  {
    code: `import { useCallback } from 'react';

function C() {
  const { preventDefaultAction } = useEventHandlers();
  const h = useCallback(() => preventDefaultAction(), [preventDefaultAction]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('preventDefaultAction')],
    output: `import { useCallback } from 'react';

function C() {
  const { preventDefaultAction } = useEventHandlers();
  const h = preventDefaultAction;
  return <button onClick={h}/>;
}`,
  },
  // A non-suppression member on a hook result reports in the concise spelling
  // just as it does in the block spelling.
  {
    code: `import { useCallback } from 'react';

function C() {
  const evt = useEventHandlers();
  const h = useCallback(() => evt.submit(), [evt]);
  return <button onClick={h}/>;
}`,
    options: [{ assumeAllUseAreMemoized: true }] as [
      { assumeAllUseAreMemoized: boolean },
    ],
    errors: [redundantError('evt.submit')],
    output: null,
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
      // A locally declared arrow is a fresh function on every render, so the
      // wrapper is what gives it a stable identity: collapsing it changes
      // behaviour. Nothing memoizes `fn`, so nothing is proven.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const fn = () => doThing();
  const outer = useCallback(fn, [fn]);
  return outer;
};`,
      },
      // A prop callback carries no stability guarantee either.
      {
        code: `import { useCallback } from 'react';
const C = ({ onDone }) => {
  const outer = useCallback(onDone, [onDone]);
  return outer;
};`,
      },
      // The binding is resolved through scope analysis, so the memoized `inner`
      // of one component does not vouch for the `inner` prop of the next. A
      // name-keyed lookup reports this, deleting the only thing stabilizing a
      // prop.
      {
        code: `import { useCallback } from 'react';
const A = () => {
  const inner = useCallback(() => doThing(), []);
  return inner;
};
const B = ({ inner }) => {
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
      },
      // A parameter shadows the memoized binding of the same name inside the
      // wrapper, and a parameter is a different value on every call.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback((inner) => inner(), []);
  return [inner, outer];
};`,
      },
      // A rebindable declaration breaks the proof: the value read at the wrapper
      // need not be the one the memoizing call produced.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  let inner = useCallback(() => doThing(), []);
  inner = somethingElse;
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
      },
      // A self-referential wrapper reads the binding it is initializing, so the
      // remedy would emit \`const inner = inner\`.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => inner(), []);
  return inner;
};`,
      },
      // useMemo memoizes any value; a factory whose result is a call is not
      // provably a callback.
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const value = useMemo(() => compute(), []);
  const outer = useCallback(value, [value]);
  return outer;
};`,
      },
      // A factory assembling its result across statements is not provable
      // either, even though this one does return a function.
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const inner = useMemo(() => {
    const fn = () => doThing();
    return fn;
  }, []);
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
      },
      // A conditional factory result is unproven for the same reason.
      {
        code: `import { useCallback, useMemo } from 'react';
const C = ({ flag, a, b }) => {
  const inner = useMemo(() => (flag ? a : b), [flag, a, b]);
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
      },
      // A non-memoizing initializer proves nothing, whatever it returns.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = memoize(() => doThing());
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
      },
      // Supplying an argument makes the wrapper non-redundant; the carve-out
      // holds for locally proven callbacks exactly as it does for configured
      // hooks.
      {
        code: `import { useCallback } from 'react';
const C = ({ userId }) => {
  const inner = useCallback((id) => doThing(id), []);
  const outer = useCallback(() => inner(userId), [inner, userId]);
  return outer;
};`,
      },
      // ...as does sequencing a second call the delegate does not perform.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(() => {
    track('click');
    inner();
  }, [inner]);
  return outer;
};`,
      },
      // ...as does suppressing the event.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback((e) => {
    e.preventDefault();
    inner();
  }, [inner]);
  return outer;
};`,
      },
      // ...as does transforming the parameters.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback((value) => doThing(value), []);
  const outer = useCallback((e) => inner(e.target.value), [inner]);
  return outer;
};`,
      },
    ],
    invalid: [
      // Locally visible memoization needs no configuration: the memoizing call
      // sits in the same file, so these fire under the default options — the
      // shape the recommended config actually ships.
      {
        code: `
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(inner, [inner]);
  return outer;
};
`,
        errors: [{ messageId: 'redundantWrapper' as const }],
        output: `
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};
`,
      },
      // The trivial-arrow spelling of the same redundancy.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(() => inner(), [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // Block body returning the delegate.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(() => {
    return inner();
  }, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // Block body calling the delegate for effect.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(() => {
    inner();
  }, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // Function-expression wrappers collapse the same way.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useCallback(function () {
    return inner();
  }, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // The namespaced spelling of both the source and the wrapper.
      {
        code: `import React from 'react';
const C = () => {
  const inner = React.useCallback(() => doThing(), []);
  const outer = React.useCallback(inner, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import React from 'react';
const C = () => {
  const inner = React.useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // useCallback wrapping a local useLatestCallback result.
      {
        code: `import { useCallback } from 'react';
import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useLatestCallback(() => doThing());
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useLatestCallback(() => doThing());
  const outer = inner;
  return outer;
};`,
      },
      // useLatestCallback wrapping a local useLatestCallback result: the
      // spelling this config's own fixer writes, on both sides.
      {
        code: `import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useLatestCallback(() => doThing());
  const outer = useLatestCallback(() => inner());
  return outer;
};`,
        errors: [redundantError('inner', 'useLatestCallback')],
        output: `import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useLatestCallback(() => doThing());
  const outer = inner;
  return outer;
};`,
      },
      // useLatestCallback wrapping a local useCallback result.
      {
        code: `import { useCallback } from 'react';
import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = useLatestCallback(inner);
  return outer;
};`,
        errors: [redundantError('inner', 'useLatestCallback')],
        output: `import { useCallback } from 'react';
import useLatestCallback from 'use-latest-callback';
const C = () => {
  const inner = useCallback(() => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // The memoization source is resolved from the module, so the alias
      // use-latest-callback's own fixer emits is recognized as one.
      {
        code: `import { useCallback } from 'react';
import stableCallback from 'use-latest-callback';
const C = () => {
  const inner = stableCallback(() => doThing());
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback } from 'react';
import stableCallback from 'use-latest-callback';
const C = () => {
  const inner = stableCallback(() => doThing());
  const outer = inner;
  return outer;
};`,
      },
      // useMemo produces a memoized callback when its factory hands back a
      // function literal.
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const inner = useMemo(() => () => doThing(), []);
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback, useMemo } from 'react';
const C = () => {
  const inner = useMemo(() => () => doThing(), []);
  const outer = inner;
  return outer;
};`,
      },
      // ...including through a block body whose single statement returns one.
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const inner = useMemo(() => {
    return function () {
      doThing();
    };
  }, []);
  const outer = useCallback(() => inner(), [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback, useMemo } from 'react';
const C = () => {
  const inner = useMemo(() => {
    return function () {
      doThing();
    };
  }, []);
  const outer = inner;
  return outer;
};`,
      },
      // A cast carries no runtime value, so annotating the produced callback
      // does not hide it.
      {
        code: `import { useCallback, useMemo } from 'react';
type Handler = () => void;
const C = () => {
  const inner = useMemo(() => (() => doThing()) as Handler, []);
  const outer = useCallback(inner, [inner]);
  return outer;
};`,
        errors: [redundantError('inner')],
        output: `import { useCallback, useMemo } from 'react';
type Handler = () => void;
const C = () => {
  const inner = useMemo(() => (() => doThing()) as Handler, []);
  const outer = inner;
  return outer;
};`,
      },
      // A chain of wrappers reports each redundant layer.
      {
        code: `import { useCallback } from 'react';
const C = () => {
  const first = useCallback(() => doThing(), []);
  const second = useCallback(first, [first]);
  const third = useCallback(() => second(), [second]);
  return third;
};`,
        errors: [redundantError('first'), redundantError('second')],
        output: `import { useCallback } from 'react';
const C = () => {
  const first = useCallback(() => doThing(), []);
  const second = first;
  const third = second;
  return third;
};`,
      },
    ],
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

/**
 * Whether a wrapper is redundant is a question about the delegate it calls, not
 * about how the author spelled the arrow's body. The rule answers it in three
 * separate branches — concise body, block body with `return`, block body with a
 * bare call — and each branch carries its own copy of the delegate test, so a
 * set consulted by one and forgotten by another leaves a shape that reports
 * under one spelling and passes under the next.
 *
 * A per-shape fixture pins one branch at a time and cannot see that. This
 * matrix asserts the branches agree, which is the property the per-shape
 * fixtures assume.
 *
 * The event-suppression carve-out is a delegate test like any other and belongs
 * in the matrix for the same reason: the wrapper is load-bearing because of what
 * it calls, so a branch that grants the exemption while another withholds it
 * reports a wrapper whose prescribed remedy does not exist.
 */
describe('arrow-body spelling parity', () => {
  const OPTIONS = { assumeAllUseAreMemoized: true };

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

  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: {
      'test/no-redundant-usecallback-wrapper': ['error', OPTIONS] as const,
    },
  };

  type Shape = {
    label: string;
    /** Bindings the delegate expression reads. */
    setup: string;
    /** Component parameters, for shapes whose delegate is a prop. */
    params?: string;
    /** The call the wrapper delegates to. */
    delegate: string;
    reports: boolean;
  };

  const SHAPES: Shape[] = [
    {
      label: 'non-destructured hook result',
      setup: 'const signIn = useMyCustomThing();',
      delegate: 'signIn()',
      reports: true,
    },
    {
      label: 'destructured hook prop',
      setup: 'const { signIn } = useMyCustomThing();',
      delegate: 'signIn()',
      reports: true,
    },
    {
      label: 'member on a hook result',
      setup: 'const svc = useMyCustomThing();',
      delegate: 'svc.handle()',
      reports: true,
    },
    {
      label: 'member on a namespaced hook result',
      setup: 'const svc = hooks.useMyCustomThing();',
      delegate: 'svc.handle()',
      reports: true,
    },
    {
      label: 'locally memoized callback',
      setup: 'const inner = useCallback(() => doThing(), []);',
      delegate: 'inner()',
      reports: true,
    },
    {
      label: 'callback memoized by useMemo',
      setup: 'const inner = useMemo(() => () => doThing(), []);',
      delegate: 'inner()',
      reports: true,
    },
    {
      label: 'prop callback',
      setup: '',
      params: '{ onDone }',
      delegate: 'onDone()',
      reports: false,
    },
    {
      label: 'locally declared arrow',
      setup: 'const fn = () => doThing();',
      delegate: 'fn()',
      reports: false,
    },
    {
      label: 'module-level function',
      setup: '',
      delegate: 'doThing()',
      reports: false,
    },
    {
      label: 'hook result invoked with an argument',
      setup: 'const signIn = useMyCustomThing();',
      params: '{ username }',
      delegate: 'signIn(username)',
      reports: false,
    },
    {
      label: 'member on a hook result invoked with an argument',
      setup: 'const svc = useMyCustomThing();',
      params: '{ username }',
      delegate: 'svc.handle(username)',
      reports: false,
    },
    {
      label: 'call on a value the hook result produced',
      setup:
        'const signIn = useMyCustomThing();\n  const local = () => signIn;',
      delegate: 'local()',
      reports: false,
    },
    {
      label: 'destructured suppression method',
      setup: 'const { preventDefault } = useMyCustomThing();',
      delegate: 'preventDefault()',
      reports: false,
    },
    {
      label: 'suppression method on a hook result',
      setup: 'const evt = useMyCustomThing();',
      delegate: 'evt.stopPropagation()',
      reports: false,
    },
    {
      label: 'optionally invoked suppression method',
      setup: 'const { stopImmediatePropagation } = useMyCustomThing();',
      delegate: 'stopImmediatePropagation?.()',
      reports: false,
    },
  ];

  const SPELLINGS: [string, (delegate: string) => string][] = [
    ['concise', (delegate) => `() => ${delegate}`],
    ['block return', (delegate) => `() => {\n    return ${delegate};\n  }`],
    ['block expression', (delegate) => `() => {\n    ${delegate};\n  }`],
    [
      'function expression',
      (delegate) => `function () {\n    return ${delegate};\n  }`,
    ],
  ];

  const sourceFor = (shape: Shape, wrapperArg: string) =>
    `import { useCallback, useMemo } from 'react';
import * as hooks from 'src/hooks';
import { useMyCustomThing } from 'src/hooks/useMyCustomThing';

function doThing() {}

function C(${shape.params ?? ''}) {
  ${shape.setup}
  const handle = useCallback(${wrapperArg}, []);
  return handle;
}`;

  const messagesFor = (shape: Shape, wrapperArg: string) => {
    const messages = linter.verify(
      sourceFor(shape, wrapperArg),
      config,
      'C.tsx',
    );
    expect(messages.filter((message) => message.fatal)).toEqual([]);
    return messages
      .filter(
        (message) => message.ruleId === 'test/no-redundant-usecallback-wrapper',
      )
      .map((message) => message.message)
      .sort();
  };

  let shapesReporting = 0;
  let shapesSilent = 0;

  for (const shape of SHAPES) {
    it(`answers alike for every arrow-body spelling: ${shape.label}`, () => {
      const [, firstSpelling] = SPELLINGS[0];
      const expected = messagesFor(shape, firstSpelling(shape.delegate));

      // The declared expectation is the anchor: agreeing on silence is also
      // agreement, so parity alone cannot tell a fixed rule from a dead one.
      expect(expected.length > 0).toBe(shape.reports);
      if (shape.reports) {
        shapesReporting++;
      } else {
        shapesSilent++;
      }

      for (const [spellingLabel, render] of SPELLINGS.slice(1)) {
        expect({
          spelling: spellingLabel,
          messages: messagesFor(shape, render(shape.delegate)),
        }).toEqual({ spelling: spellingLabel, messages: expected });
      }
    });
  }

  it('exercises both answers, so agreement is not agreement on nothing', () => {
    expect(shapesReporting).toBeGreaterThanOrEqual(6);
    expect(shapesSilent).toBeGreaterThanOrEqual(6);
    expect(shapesReporting + shapesSilent).toBe(SHAPES.length);
  });
});
