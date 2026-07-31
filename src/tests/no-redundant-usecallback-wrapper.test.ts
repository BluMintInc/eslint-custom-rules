import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { noRedundantUseCallbackWrapper } from '../rules/no-redundant-usecallback-wrapper';

const redundantMessage = (callbackName: string) =>
  `useCallback is wrapping memoized callback "${callbackName}", adding a redundant dependency array without improving stability. Pass the hook/context callback directly so React keeps the original stable reference and avoids wrapper allocations and dependency drift.`;

const redundantError = (callbackName: string) => ({
  message: redundantMessage(callbackName),
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
  // Block body with preventDefault then call: no args => auto-fix
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
    errors: [redundantError('signIn')],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
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
