import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { noRedundantUseCallbackWrapper } from '../rules/no-redundant-usecallback-wrapper';

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
    errors: [{ messageId: 'redundantWrapper' as const }],
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
    errors: [{ messageId: 'redundantWrapper' as const }],
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
    errors: [{ messageId: 'redundantWrapper' as const }],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const onClick = signIn;
  return <button onClick={onClick}/>;
}`,
  },
  // Member on hook object: const a = useX(); useCallback(() => a.do(), [a])
  {
    code: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const svc = useSomething();
  const click = useCallback(() => svc.handle(), [svc]);
  return <button onClick={click}/>;
}`,
    errors: [{ messageId: 'redundantWrapper' as const }],
    output: `import { useCallback } from 'react';
import { useSomething } from 'x';

function C() {
  const svc = useSomething();
  const click = svc.handle;
  return <button onClick={click}/>;
}`,
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
      { memoizedHookNames: string[] }
    ],
    errors: [{ messageId: 'redundantWrapper' as const }],
    output: `import { useCallback } from 'react';
function useAuthSubmit(){ return { signIn: () => {} } }
function C(){
  const { signIn } = useAuthSubmit();
  const handle = signIn;
  return <button onClick={handle}/>;
}`,
  },
  // Wrapper calling memoized with extra args (report, no fix)
  {
    code: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C() {
  const { signIn } = useAuthSubmit();
  const handle = useCallback(() => signIn('u'), [signIn]);
  return <button onClick={handle}/>;
}`,
    errors: [{ messageId: 'redundantWrapper' as const }],
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
    errors: [{ messageId: 'redundantWrapper' as const }],
    output: `import { useCallback } from 'react';
import { useAuthSubmit } from 'src/contexts/AuthSubmitContext';

function C(){
  const ctx = useAuthSubmit();
  const h = ctx.signIn;
  return <button onClick={h}/>;
}`,
  },
];

ruleTesterJsx.run('no-redundant-usecallback-wrapper (jsx)', noRedundantUseCallbackWrapper, {
  valid,
  invalid,
});

ruleTesterTs.run('no-redundant-usecallback-wrapper (ts)', noRedundantUseCallbackWrapper, {
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
});

