import { Linter, Rule } from 'eslint';
import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterJsx } from '../utils/ruleTester';
import { useLatestCallback } from '../rules/use-latest-callback';
import { noArrayLengthInDeps } from '../rules/no-array-length-in-deps';
import { verticallyGroupRelatedFunctions } from '../rules/vertically-group-related-functions';

type RuleError = TSESLint.TestCaseError<'useLatestCallback'>;

const expectedMessage = (
  currentHook = 'useCallback',
  recommendedHook = 'useLatestCallback',
) =>
  `Replace ${currentHook} with ${recommendedHook} from "use-latest-callback" so the callback keeps a stable reference while still reading the latest props/state. useCallback recreates functions whenever dependencies change, which can trigger needless renders and stale closures. Drop the dependency array when switching to ${recommendedHook}.`;

const errors = (
  currentHook = 'useCallback',
  recommendedHook = 'useLatestCallback',
  count = 2,
) =>
  Array.from({ length: count }, () => ({
    message: expectedMessage(currentHook, recommendedHook),
  })) as unknown as RuleError[];

ruleTesterJsx.run('use-latest-callback', useLatestCallback, {
  valid: [
    // Already using useLatestCallback
    {
      code: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
    },
    // Using useLatestCallback with a different name
    {
      code: `import { useLatestCallback as useStableCallback } from 'use-latest-callback';

function MyComponent() {
  const handleClick = useStableCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
    },
    // Using other React hooks, not useCallback
    {
      code: `import { useState, useEffect } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    console.log('Count changed:', count);
  }, [count]);
  return <button onClick={() => setCount(count + 1)}>Increment</button>;
}`,
    },
    // JSX-returning callback with implicit return (should NOT be flagged)
    {
      code: `import { useCallback } from 'react';

function MyComponent({ items }) {
  const renderItem = useCallback((item) => <div key={item.id}>{item.name}</div>, []);
  return <div>{items.map(renderItem)}</div>;
}`,
    },
    // JSX-returning callback with block body (should NOT be flagged)
    {
      code: `import { useCallback } from 'react';

function MyComponent({ items }) {
  const renderItem = useCallback((item) => {
    return <div key={item.id}>{item.name}</div>;
  }, []);
  return <div>{items.map(renderItem)}</div>;
}`,
    },
    // JSX Fragment returning callback (should NOT be flagged)
    {
      code: `import { useCallback } from 'react';

function MyComponent({ items }) {
  const renderItems = useCallback(() => (
    <>
      {items.map(item => <div key={item.id}>{item.name}</div>)}
    </>
  ), [items]);
  return <div>{renderItems()}</div>;
}`,
    },
    // Complex JSX with conditional rendering (should NOT be flagged)
    {
      code: `import { useCallback } from 'react';

function MyComponent({ items, showTitle }) {
  const renderContent = useCallback(() => {
    if (showTitle) {
      return <h1>Items</h1>;
    }
    return <div>No title</div>;
  }, [showTitle]);
  return <div>{renderContent()}</div>;
}`,
    },
    // JSX with multiple return statements (should NOT be flagged)
    {
      code: `import { useCallback } from 'react';

function MyComponent({ type }) {
  const renderByType = useCallback((item) => {
    if (type === 'card') {
      return <div className="card">{item.name}</div>;
    }
    return <span>{item.name}</span>;
  }, [type]);
  return <div>{renderByType({ name: 'test' })}</div>;
}`,
    },
    // No useCallback import at all
    {
      code: `import { useState } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);
  return <div>{count}</div>;
}`,
    },
    // useCallback from a different package (should NOT be flagged)
    {
      code: `import { useCallback } from 'some-other-package';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
    },
    // File with no React imports
    {
      code: `function regularFunction() {
  return 'hello';
}`,
    },
    // -----------------------------------------------------------------------
    // Issue #1711: the callback's identity is load-bearing. useLatestCallback
    // returns a permanently stable reference, so a hook keyed on the callback
    // stops seeing it change and its effect fires once, ever. These sites are
    // exempt from the rule entirely — no compliant remedy exists, since the
    // useMemo rewrite is converted back by
    // prefer-usecallback-over-usememo-for-functions.
    // -----------------------------------------------------------------------
    // valid after the fix — callback identity is consumed by another hook
    {
      code: `
    import { useCallback } from 'react';
    import { useFirestore } from './useFirestore';
    export const useTokenHits = (ids) => {
      const handler = useCallback((snap) => snap.filter((h) => ids.includes(h.id)), [ids]);
      return useFirestore(handler, []);
    };
  `,
    },
    // The result sits in another hook's dependency array.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    fetchOne(id);
  }, [id]);

  useEffect(() => {
    handler();
  }, [handler]);
};`,
    },
    // Alongside other dependencies in that array.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = (id, other) => {
  const handler = useCallback(() => {
    fetchOne(id);
  }, [id]);

  useEffect(() => {
    handler();
  }, [other, handler]);
};`,
    },
    // A useMemo dependency array keys a computed value on the identity.
    {
      code: `import { useCallback, useMemo } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    return read(id);
  }, [id]);

  return useMemo(() => ({ handler }), [handler]);
};`,
    },
    // A third-party comparison hook counts the same way.
    {
      code: `import { useCallback } from 'react';
import useDeepCompareEffect from 'use-deep-compare-effect';

export const useThing = (query) => {
  const handler = useCallback(() => {
    run(query);
  }, [query]);

  useDeepCompareEffect(() => {
    handler();
  }, [handler]);
};`,
    },
    // Another useCallback's dependency array: that call may itself be blocked
    // from conversion (a JSX-returning callback), leaving it keyed on a frozen
    // reference.
    {
      code: `import { useCallback } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    return read(id);
  }, [id]);

  const render = useCallback(() => <Row onSelect={handler} />, [handler]);

  return render;
};`,
    },
    // A custom hook takes the callback as an argument — it is free to list that
    // argument in a dependency array of its own, as useFirestore does.
    {
      code: `import { useCallback } from 'react';
import { useSubscription } from './useSubscription';

export const useThing = (topic) => {
  const handler = useCallback((message) => {
    receive(topic, message);
  }, [topic]);

  useSubscription(handler);
};`,
    },
    // The hook reached through a member expression, where the property carries
    // the name the convention applies to.
    {
      code: `import { useCallback } from 'react';
import { api } from './api';

export const useThing = (topic) => {
  const handler = useCallback((message) => {
    receive(topic, message);
  }, [topic]);

  api.useSubscription(handler);
};`,
    },
    // A deeper member path resolves to the same property name.
    {
      code: `import { useCallback } from 'react';
import { lib } from './lib';

export const useThing = (topic) => {
  const handler = useCallback((message) => {
    receive(topic, message);
  }, [topic]);

  lib.hooks.useSubscription(handler);
};`,
    },
    // A call with no dependency array at all is rebuilt on every render, so its
    // identity is exactly what the consuming hook is keyed on.
    {
      code: `import { useCallback } from 'react';
import { useFirestore } from './useFirestore';

export const useThing = (ids) => {
  const handler = useCallback((snap) => {
    return snap.filter((hit) => ids.includes(hit.id));
  });

  return useFirestore(handler, []);
};`,
    },
    // A dependency array spelled as a value this file cannot read may hold
    // anything, so the identity is treated as changing.
    {
      code: `import { useCallback } from 'react';
import { useFirestore } from './useFirestore';

export const useThing = (ids, deps) => {
  const handler = useCallback((snap) => {
    return snap.filter((hit) => ids.includes(hit.id));
  }, deps);

  return useFirestore(handler, []);
};`,
    },
    // A type assertion passes the identity through unchanged.
    {
      code: `import { useCallback } from 'react';
import { useFirestore } from './useFirestore';

export const useThing = (ids: string[]) => {
  const handler = useCallback((snap: Snap) => {
    return snap.filter((hit) => ids.includes(hit.id));
  }, [ids]) as FirestoreHandler;

  return useFirestore(handler, []);
};`,
    },
    // The call handed straight to the hook, with no binding in between.
    {
      code: `import { useCallback } from 'react';
import { useFirestore } from './useFirestore';

export const useThing = (ids) => {
  return useFirestore(
    useCallback((snap) => snap.filter((hit) => ids.includes(hit.id)), [ids]),
    [],
  );
};`,
    },
    // Reached through the React namespace, which changes nothing about the
    // identity the consuming hook holds.
    {
      code: `import React from 'react';
import { useFirestore } from './useFirestore';

export const useThing = (ids) => {
  const handler = React.useCallback((snap) => {
    return snap.filter((hit) => ids.includes(hit.id));
  }, [ids]);

  return useFirestore(handler, []);
};`,
    },
    // -----------------------------------------------------------------------
    // Issue #1711 (recurrence): a ref callback is the second consumer of
    // callback identity. React re-runs a ref callback when the identity it is
    // given changes, and that is a ref's only re-registration trigger — no
    // dependency array exists anywhere in the source to read. A pinned
    // reference registers once and publishes the first render's values forever,
    // as silently as a frozen dependency does.
    // -----------------------------------------------------------------------
    // The reported repro: the slot registers its density once, so a widened
    // column keeps reporting the collapsed one.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density, slotId }) => {
  const attach = useCallback((element) => {
    attachSlot(slotId, element, density);
  }, [slotId, density]);

  return <div ref={attach} />;
};`,
    },
    // A component's ref prop re-registers on the same trigger a host element's
    // does.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }) => {
  const attach = useCallback((element) => {
    measure(element, density);
  }, [density]);

  return <Panel ref={attach} />;
};`,
    },
    // A type assertion passes the identity the ref receives through unchanged.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }: Props) => {
  const attach = useCallback((element: HTMLDivElement | null) => {
    measure(element, density);
  }, [density]) as React.RefCallback<HTMLDivElement>;

  return <div ref={attach} />;
};`,
    },
    // The call written straight into the ref, with no binding in between.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }) => {
  return (
    <div ref={useCallback((element) => measure(element, density), [density])} />
  );
};`,
    },
    // One consumer that compares the identity is enough: the other reads cannot
    // make the ref tolerate a frozen reference.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }) => {
  const attach = useCallback((element) => {
    measure(element, density);
  }, [density]);

  report(attach);
  return <div ref={attach} onLoad={attach} />;
};`,
    },
  ],
  invalid: [
    // Basic case: useCallback with empty dependency array
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback with dependencies
    {
      code: `import { useCallback } from 'react';

function MyComponent({ id, onAction }) {
  const handleClick = useCallback(() => {
    console.log('Clicked', id);
    onAction(id);
  }, [id, onAction]);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ id, onAction }) {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked', id);
    onAction(id);
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback with other React imports
    {
      code: `import { useCallback, useState, useEffect } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);
  const handleClick = useCallback(() => {
    setCount(count + 1);
  }, [count]);
  useEffect(() => {
    console.log('Count changed:', count);
  }, [count]);
  return <button onClick={handleClick}>Increment</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState, useEffect } from 'react';

function MyComponent() {
  const [count, setCount] = useState(0);
  const handleClick = useLatestCallback(() => {
    setCount(count + 1);
  });
  useEffect(() => {
    console.log('Count changed:', count);
  }, [count]);
  return <button onClick={handleClick}>Increment</button>;
}`,
      errors: errors(),
    },
    // useCallback with renamed import
    {
      code: `import { useCallback as useStableCallback } from 'react';

function MyComponent() {
  const handleClick = useStableCallback(() => {
    console.log('Clicked');
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useStableCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useStableCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors('useStableCallback', 'useStableCallback'),
    },
    // useCallback with existing useLatestCallback import
    {
      code: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';

function MyComponent() {
  const handleClick1 = useLatestCallback(() => {
    console.log('Clicked 1');
  });
  const handleClick2 = useCallback(() => {
    console.log('Clicked 2');
  }, []);
  return (
    <>
      <button onClick={handleClick1}>Button 1</button>
      <button onClick={handleClick2}>Button 2</button>
    </>
  );
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick1 = useLatestCallback(() => {
    console.log('Clicked 1');
  });
  const handleClick2 = useLatestCallback(() => {
    console.log('Clicked 2');
  });
  return (
    <>
      <button onClick={handleClick1}>Button 1</button>
      <button onClick={handleClick2}>Button 2</button>
    </>
  );
}`,
      errors: errors(),
    },
    // Arrow function with implicit return (not JSX)
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const getValue = useCallback(() => 42, []);
  return <div>{getValue()}</div>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const getValue = useLatestCallback(() => 42);
  return <div>{getValue()}</div>;
}`,
      errors: errors(),
    },
    // Async function
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const fetchData = useCallback(async () => {
    const response = await fetch('/api/data');
    return response.json();
  }, []);
  return <button onClick={fetchData}>Fetch data</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const fetchData = useLatestCallback(async () => {
    const response = await fetch('/api/data');
    return response.json();
  });
  return <button onClick={fetchData}>Fetch data</button>;
}`,
      errors: errors(),
    },
    // useCallback without dependency array
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // Multiple useCallback calls in same file
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);
  const handleSubmit = useCallback(() => {
    console.log('Submitted');
  }, []);
  const handleReset = useCallback(() => {
    console.log('Reset');
  }, []);
  return (
    <form>
      <button onClick={handleClick}>Click</button>
      <button onClick={handleSubmit}>Submit</button>
      <button onClick={handleReset}>Reset</button>
    </form>
  );
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  const handleSubmit = useLatestCallback(() => {
    console.log('Submitted');
  });
  const handleReset = useLatestCallback(() => {
    console.log('Reset');
  });
  return (
    <form>
      <button onClick={handleClick}>Click</button>
      <button onClick={handleSubmit}>Submit</button>
      <button onClick={handleReset}>Reset</button>
    </form>
  );
}`,
      errors: errors('useCallback', 'useLatestCallback', 4),
    },
    // useCallback with complex dependency array
    {
      code: `import { useCallback } from 'react';

function MyComponent({ user, settings, ...props }) {
  const handleAction = useCallback(() => {
    console.log(user.id, settings.theme, props.data);
  }, [user.id, settings.theme, props.data]);
  return <button onClick={handleAction}>Action</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ user, settings, ...props }) {
  const handleAction = useLatestCallback(() => {
    console.log(user.id, settings.theme, props.data);
  });
  return <button onClick={handleAction}>Action</button>;
}`,
      errors: errors(),
    },
    // useCallback with destructured parameters
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleEvent = useCallback(({ target, currentTarget }) => {
    console.log(target.value, currentTarget.dataset.id);
  }, []);
  return <input onChange={handleEvent} />;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleEvent = useLatestCallback(({ target, currentTarget }) => {
    console.log(target.value, currentTarget.dataset.id);
  });
  return <input onChange={handleEvent} />;
}`,
      errors: errors(),
    },
    // useCallback with default parameters
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleClick = useCallback((event, customData = 'default') => {
    console.log(event.type, customData);
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback((event, customData = 'default') => {
    console.log(event.type, customData);
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback in custom hook
    {
      code: `import { useCallback } from 'react';

function useCustomHook(value) {
  const memoizedCallback = useCallback(() => {
    return value * 2;
  }, [value]);
  return memoizedCallback;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function useCustomHook(value) {
  const memoizedCallback = useLatestCallback(() => {
    return value * 2;
  });
  return memoizedCallback;
}`,
      errors: errors(),
    },
    // useCallback with conditional logic inside
    {
      code: `import { useCallback } from 'react';

function MyComponent({ isEnabled }) {
  const handleClick = useCallback(() => {
    if (isEnabled) {
      console.log('Action performed');
    } else {
      console.log('Action disabled');
    }
  }, [isEnabled]);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ isEnabled }) {
  const handleClick = useLatestCallback(() => {
    if (isEnabled) {
      console.log('Action performed');
    } else {
      console.log('Action disabled');
    }
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback with try/catch block
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleAsyncAction = useCallback(async () => {
    try {
      const result = await fetch('/api/data');
      console.log(await result.json());
    } catch (error) {
      console.error('Failed to fetch:', error);
    }
  }, []);
  return <button onClick={handleAsyncAction}>Fetch</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleAsyncAction = useLatestCallback(async () => {
    try {
      const result = await fetch('/api/data');
      console.log(await result.json());
    } catch (error) {
      console.error('Failed to fetch:', error);
    }
  });
  return <button onClick={handleAsyncAction}>Fetch</button>;
}`,
      errors: errors(),
    },
    // useCallback with nested functions
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleComplexAction = useCallback(() => {
    const helper = (x) => x * 2;
    const result = helper(5);
    console.log(result);
  }, []);
  return <button onClick={handleComplexAction}>Complex Action</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleComplexAction = useLatestCallback(() => {
    const helper = (x) => x * 2;
    const result = helper(5);
    console.log(result);
  });
  return <button onClick={handleComplexAction}>Complex Action</button>;
}`,
      errors: errors(),
    },
    // useCallback returning a promise
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const getPromise = useCallback(() => {
    return Promise.resolve('data');
  }, []);
  return <button onClick={() => getPromise().then(console.log)}>Get Promise</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const getPromise = useLatestCallback(() => {
    return Promise.resolve('data');
  });
  return <button onClick={() => getPromise().then(console.log)}>Get Promise</button>;
}`,
      errors: errors(),
    },
    // useCallback with spread operator in dependencies
    {
      code: `import { useCallback } from 'react';

function MyComponent({ items }) {
  const handleAction = useCallback(() => {
    console.log(items.length);
  }, [...items]);
  return <button onClick={handleAction}>Action</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ items }) {
  const handleAction = useLatestCallback(() => {
    console.log(items.length);
  });
  return <button onClick={handleAction}>Action</button>;
}`,
      errors: errors(),
    },
    // useCallback with object dependencies
    {
      code: `import { useCallback } from 'react';

function MyComponent({ config }) {
  const handleAction = useCallback(() => {
    console.log(config.apiUrl);
  }, [config]);
  return <button onClick={handleAction}>Action</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ config }) {
  const handleAction = useLatestCallback(() => {
    console.log(config.apiUrl);
  });
  return <button onClick={handleAction}>Action</button>;
}`,
      errors: errors(),
    },
    // useCallback with function expression instead of arrow function
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleClick = useCallback(function(event) {
    console.log('Clicked', event.target);
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleClick = useLatestCallback(function(event) {
    console.log('Clicked', event.target);
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback with TypeScript types
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleTyped = useCallback((value: string, other: number) => {
    console.log(value, other);
  }, []);
  return <button onClick={() => handleTyped('test', 123)}>Typed</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleTyped = useLatestCallback((value: string, other: number) => {
    console.log(value, other);
  });
  return <button onClick={() => handleTyped('test', 123)}>Typed</button>;
}`,
      errors: errors(),
    },
    // useCallback with comments in import. Only the specifier's own tokens and
    // its separating comma are spliced out, so the rest of the import keeps its
    // formatting and every comment in it survives (issue #1446). The comment
    // that described `useCallback` is left behind rather than guessed at,
    // because a trailing comment can be a directive governing the NEXT line.
    {
      code: `import {
  useCallback, // For memoizing callbacks
  useState
} from 'react';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  // For memoizing callbacks
  useState
} from 'react';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // useCallback with multiline function body
    {
      code: `import { useCallback } from 'react';

function MyComponent({ data }) {
  const processData = useCallback(() => {
    const step1 = data.filter(item => item.active);
    const step2 = step1.map(item => ({
      ...item,
      processed: true
    }));
    const step3 = step2.sort((a, b) => a.name.localeCompare(b.name));
    return step3;
  }, [data]);
  return <div>{processData().length} items</div>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent({ data }) {
  const processData = useLatestCallback(() => {
    const step1 = data.filter(item => item.active);
    const step2 = step1.map(item => ({
      ...item,
      processed: true
    }));
    const step3 = step2.sort((a, b) => a.name.localeCompare(b.name));
    return step3;
  });
  return <div>{processData().length} items</div>;
}`,
      errors: errors(),
    },
    // useCallback with rest parameters
    {
      code: `import { useCallback } from 'react';

function MyComponent() {
  const handleMultiple = useCallback((...args) => {
    console.log('Arguments:', args);
  }, []);
  return <button onClick={() => handleMultiple(1, 2, 3)}>Multiple Args</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function MyComponent() {
  const handleMultiple = useLatestCallback((...args) => {
    console.log('Arguments:', args);
  });
  return <button onClick={() => handleMultiple(1, 2, 3)}>Multiple Args</button>;
}`,
      errors: errors(),
    },
    // TypeScript file without JSX (should be flagged)
    {
      code: `import { useCallback } from 'react';

function useCustomHook() {
  const callback = useCallback(() => {
    return 'not jsx';
  }, []);
  return callback;
}`,
      output: `import useLatestCallback from 'use-latest-callback';

function useCustomHook() {
  const callback = useLatestCallback(() => {
    return 'not jsx';
  });
  return callback;
}`,
      errors: errors(),
    },
    // Mixed JSX + non-JSX: the react import must survive because the
    // JSX-returning call is deliberately left alone and still references it.
    {
      code: `import { useCallback } from 'react';
const A = () => {
  const render = useCallback(() => <div />, []);
  const onClick = useCallback(() => { doThing(); }, []);
  return render;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const render = useCallback(() => <div />, []);
  const onClick = useLatestCallback(() => { doThing(); });
  return render;
};`,
      errors: errors(),
    },
    // Aliased mixed file: the react alias stays bound for the JSX call, so the
    // converted call must target the new import's own name instead of `uc`.
    {
      code: `import { useCallback as uc, useMemo } from 'react';
const A = () => {
  const r = uc(() => <div />, []);
  const o = uc(() => { go(); }, []);
  const m = useMemo(() => 1, []);
  return <div onClick={o}>{r}{m}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback as uc, useMemo } from 'react';
const A = () => {
  const r = uc(() => <div />, []);
  const o = useLatestCallback(() => { go(); });
  const m = useMemo(() => 1, []);
  return <div onClick={o}>{r}{m}</div>;
};`,
      errors: errors('uc', 'useLatestCallback'),
    },
    // Aliased mixed file with no other specifiers: the whole react import is
    // still preserved because the alias backs the surviving JSX call.
    {
      code: `import { useCallback as uc } from 'react';
const A = () => {
  const r = uc(() => <div />, []);
  const o = uc(() => { go(); }, []);
  return <div onClick={o}>{r}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback as uc } from 'react';
const A = () => {
  const r = uc(() => <div />, []);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{r}</div>;
};`,
      errors: errors('uc', 'useLatestCallback'),
    },
    // The preferred import name is already taken, so the new import gets a
    // suffixed name and the converted call follows it.
    {
      code: `import { useCallback as uc } from 'react';
const useLatestCallback = 'taken';
const A = () => {
  const r = uc(() => <div />, []);
  const o = uc(() => { go(); }, []);
  return <div onClick={o}>{r}{useLatestCallback}</div>;
};`,
      output: `import useLatestCallback2 from 'use-latest-callback';
import { useCallback as uc } from 'react';
const useLatestCallback = 'taken';
const A = () => {
  const r = uc(() => <div />, []);
  const o = useLatestCallback2(() => { go(); });
  return <div onClick={o}>{r}{useLatestCallback}</div>;
};`,
      errors: errors('uc', 'useLatestCallback2'),
    },
    // Mixed file that already imports useLatestCallback: no duplicate import is
    // added and the react import is left alone for the JSX call.
    {
      code: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const render = useCallback(() => <div />, []);
  const onClick = useCallback(() => { go(); }, []);
  return render;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const render = useCallback(() => <div />, []);
  const onClick = useLatestCallback(() => { go(); });
  return render;
};`,
      errors: errors('useCallback', 'useLatestCallback', 1),
    },
    // Mixed file that imports useLatestCallback under an alias: converted calls
    // reuse that alias rather than introducing a second import.
    {
      code: `import { useLatestCallback as stable } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{r}</div>;
};`,
      output: `import { useLatestCallback as stable } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = stable(() => { go(); });
  return <div onClick={o}>{r}</div>;
};`,
      errors: errors('useCallback', 'stable', 1),
    },
    // A non-call reference to the binding counts as surviving usage, so the
    // react import is preserved even though every call is converted.
    {
      code: `import { useCallback } from 'react';
const h = useCallback;
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(h)}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const h = useCallback;
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{String(h)}</div>;
};`,
      errors: errors(),
    },
    // An argument-less call is never converted, so it also keeps the import.
    {
      code: `import { useCallback } from 'react';
const A = () => {
  const bare = useCallback();
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{bare}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const bare = useCallback();
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{bare}</div>;
};`,
      errors: errors(),
    },
    // A type-position reference keeps the react import too.
    {
      code: `import { useCallback } from 'react';
type CB = typeof useCallback;
const A = (cb: CB) => {
  const o = useCallback(() => { go(cb); }, []);
  return <div onClick={o} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
type CB = typeof useCallback;
const A = (cb: CB) => {
  const o = useLatestCallback(() => { go(cb); });
  return <div onClick={o} />;
};`,
      errors: errors(),
    },
    // Default React import beside the named specifier: the whole react import
    // is preserved when the named binding still has a JSX-returning call.
    {
      code: `import React, { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = useCallback(() => { go(); }, []);
  return React.createElement('div', null, r, o);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React, { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = useLatestCallback(() => { go(); });
  return React.createElement('div', null, r, o);
};`,
      errors: errors(),
    },
    // Mixed React.useCallback member calls never touched the react import and
    // still do not.
    {
      code: `import React from 'react';
const A = () => {
  const r = React.useCallback(() => <div />, []);
  const o = React.useCallback(() => { go(); }, []);
  return <div onClick={o}>{r}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';
const A = () => {
  const r = React.useCallback(() => <div />, []);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{r}</div>;
};`,
      errors: errors(),
    },
    // Type parameters survive the rewrite in a mixed file.
    {
      code: `import { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = useCallback<() => void>(() => { go(); }, []);
  return <div onClick={o}>{r}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const r = useCallback(() => <div />, []);
  const o = useLatestCallback<() => void>(() => { go(); });
  return <div onClick={o}>{r}</div>;
};`,
      errors: errors(),
    },
    // The declaration that binds useCallback owns the rewrite even when another
    // react import precedes it.
    {
      code: `import { useState } from 'react';
import { useCallback } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import { useState } from 'react';
import useLatestCallback from 'use-latest-callback';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // Every reference converted: the react import is still fully rewritten.
    {
      code: `import { useCallback, useMemo } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  const m = useMemo(() => 1, []);
  return <div onClick={o}>{m}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useMemo } from 'react';
const A = () => {
  const o = useLatestCallback(() => { go(); });
  const m = useMemo(() => 1, []);
  return <div onClick={o}>{m}</div>;
};`,
      errors: errors(),
    },
    // A useCallback nested inside another convertible useCallback cannot join
    // the atomic fix (the outer rewrite re-emits its original text), so its
    // conversion is blocked for this pass: the react import MUST survive so a
    // later pass can still convert it (issue #1400 acceptance criterion).
    {
      code: `import { useCallback } from 'react';
const A = () => {
  const outer = useCallback(() => {
    const inner = useCallback(() => { go(); }, []);
    return inner;
  }, []);
  return <div onClick={outer} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const outer = useLatestCallback(() => {
    const inner = useCallback(() => { go(); }, []);
    return inner;
  });
  return <div onClick={outer} />;
};`,
      errors: errors('useCallback', 'useLatestCallback', 3),
    },

    // -----------------------------------------------------------------------
    // A colliding `useLatestCallback` binding withholds the edit (issue #1428).
    // The violation is still reported; only the automated fix is skipped.
    // -----------------------------------------------------------------------
    // Module-scope const: the inserted import would be a second declaration.
    {
      code: `import { useCallback } from 'react';
const useLatestCallback = 1;
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{useLatestCallback}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Module-scope let.
    {
      code: `import { useCallback } from 'react';
let useLatestCallback;
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{useLatestCallback}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Function declaration.
    {
      code: `import { useCallback } from 'react';
function useLatestCallback(fn) { return fn; }
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: null,
      errors: errors(),
    },
    // Class declaration.
    {
      code: `import { useCallback } from 'react';
class useLatestCallback {}
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: null,
      errors: errors(),
    },
    // Named import from a different module.
    {
      code: `import { useLatestCallback } from 'other-package';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallback)}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Default import from a different module.
    {
      code: `import useLatestCallback from 'other-package';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallback)}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Namespace import of the hook module bound to the name: the namespace
    // object is not callable, so the rewritten call cannot reach the hook.
    {
      code: `import * as useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallback)}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Reverse alias from the hook module: the name is bound to another export.
    {
      code: `import { getLatestCallback as useLatestCallback } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallback)}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Alias from a different module.
    {
      code: `import { stable as useLatestCallback } from 'other-package';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallback)}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Type-only declaration: the name is taken in the type space, so adding a
    // value import of it is a duplicate identifier.
    {
      code: `import type { useLatestCallback } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: null,
      errors: errors(),
    },
    // Inline type specifier: erases at compile time, so it cannot carry the
    // call, and it still takes the name.
    {
      code: `import { type useLatestCallback } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: null,
      errors: errors(),
    },
    // Shadowing parameter: the rewritten call would silently bind to it with no
    // compile error at all.
    {
      code: `import { useCallback } from 'react';
const A = (useLatestCallback) => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{useLatestCallback}</div>;
};`,
      output: null,
      errors: errors(),
    },
    // Block-scoped shadow covering the fix site.
    {
      code: `import { useCallback } from 'react';
const A = () => {
  {
    const useLatestCallback = 1;
    const o = useCallback(() => { go(); }, []);
    return <div onClick={o}>{useLatestCallback}</div>;
  }
};`,
      output: null,
      errors: errors(),
    },
    // Shadow at the fix site even though the hook is correctly imported: the
    // rewritten call would reach the shadow, not the import.
    {
      code: `import useLatestCallback from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const useLatestCallback = 1;
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{useLatestCallback}</div>;
};`,
      output: null,
      errors: errors(),
    },

    // -----------------------------------------------------------------------
    // No collision: the edit must still land, byte for byte.
    // -----------------------------------------------------------------------
    // A similarly named binding is not the hook's name and must not decline.
    {
      code: `import { useCallback } from 'react';
const useLatestCallbackRef = { current: null };
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(useLatestCallbackRef)}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const useLatestCallbackRef = { current: null };
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{String(useLatestCallbackRef)}</div>;
};`,
      errors: errors(),
    },
    // A binding in a scope that does not cover the fix site only shadows the
    // inserted import inside its own function, so the edit is safe.
    {
      code: `import { useCallback } from 'react';
const B = () => {
  const useLatestCallback = 1;
  return useLatestCallback;
};
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{B()}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const B = () => {
  const useLatestCallback = 1;
  return useLatestCallback;
};
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{B()}</div>;
};`,
      errors: errors(),
    },
    // The hook import is reused even when it trails the fix site in source
    // order, because import state is read off the program body.
    {
      code: `import { useCallback } from 'react';
const A = (go) => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};
import useLatestCallback from 'use-latest-callback';`,
      output: `const A = (go) => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o} />;
};
import useLatestCallback from 'use-latest-callback';`,
      errors: errors(),
    },
    // A side-effect-only import binds nothing, so the fix adds its own
    // declaration rather than trying to extend it.
    {
      code: `import 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: `import 'use-latest-callback';
import useLatestCallback from 'use-latest-callback';
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o} />;
};`,
      errors: errors(),
    },
    // A namespace import under another name does not bind a callable hook, so
    // the fix adds a default import of its own.
    {
      code: `import * as latest from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{String(latest)}</div>;
};`,
      output: `import * as latest from 'use-latest-callback';
import useLatestCallback from 'use-latest-callback';
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{String(latest)}</div>;
};`,
      errors: errors(),
    },
    // A type-only import of some other export leaves the hook's name free.
    {
      code: `import type { LatestCallback } from 'use-latest-callback';
import { useCallback } from 'react';
const A = (cb: LatestCallback) => {
  const o = useCallback(() => { go(cb); }, []);
  return <div onClick={o} />;
};`,
      output: `import type { LatestCallback } from 'use-latest-callback';
import useLatestCallback from 'use-latest-callback';
const A = (cb: LatestCallback) => {
  const o = useLatestCallback(() => { go(cb); });
  return <div onClick={o} />;
};`,
      errors: errors(),
    },
    // An aliased hook import is reused under its own name, so the hook's
    // canonical name being free is irrelevant.
    {
      code: `import { useLatestCallback as stable } from 'use-latest-callback';
import { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: `import { useLatestCallback as stable } from 'use-latest-callback';
const A = () => {
  const o = stable(() => { go(); });
  return <div onClick={o} />;
};`,
      errors: errors('useCallback', 'stable'),
    },

    // -----------------------------------------------------------------------
    // Comments in the react import survive the specifier removal (issue #1446).
    // A directive comment decides which rules report on the file, so dropping
    // one silently changes the file's suppressions.
    // -----------------------------------------------------------------------
    // An eslint directive above a specifier that SURVIVES must stay put.
    {
      code: `import {
  useCallback, // For memoizing callbacks
  // eslint-disable-next-line no-console
  useState
} from 'react';

function MyComponent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  // For memoizing callbacks
  // eslint-disable-next-line no-console
  useState
} from 'react';

function MyComponent() {
  const handleClick = useLatestCallback(() => {
    console.log('Clicked');
  });
  return <button onClick={handleClick}>Click me</button>;
}`,
      errors: errors(),
    },
    // A trailing comment on a surviving specifier stays on its own line.
    {
      code: `import {
  useCallback,
  useState, // keep this note
  useEffect
} from 'react';
const A = () => {
  const [s] = useState(0);
  useEffect(() => {}, []);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  useState, // keep this note
  useEffect
} from 'react';
const A = () => {
  const [s] = useState(0);
  useEffect(() => {}, []);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // A block comment between specifiers survives.
    {
      code: `import { useCallback, /* keep */ useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { /* keep */ useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // A block comment glued to the REMOVED specifier is kept too: the comma is
    // dropped on its own so the surviving list stays syntactically valid.
    {
      code: `import { useCallback /* gone soon */, useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { /* gone soon */ useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // The removed specifier is last in the list: the comma BEFORE it goes with
    // it, and the surviving specifier's trailing comment is untouched.
    {
      code: `import {
  useState, // keep this note
  useCallback
} from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  useState // keep this note
} from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // The removed specifier is last on a single line: no comment involved.
    {
      code: `import { useState, useCallback } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // A directive above the removed specifier when it is the ONLY specifier:
    // the whole declaration goes, comments included, because nothing it could
    // govern remains.
    {
      code: `import {
  // eslint-disable-next-line no-shadow
  useCallback
} from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o} />;
};`,
      errors: errors(),
    },
    // A default specifier survives while the braced group empties out: the
    // group and its separating comma are spliced away.
    {
      code: `import React, { useCallback } from 'react';
const A = () => {
  const o = useCallback(() => { go(); }, []);
  return React.createElement('div', { onClick: o });
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';
const A = () => {
  const o = useLatestCallback(() => { go(); });
  return React.createElement('div', { onClick: o });
};`,
      errors: errors(),
    },
    // An inline type specifier survives verbatim beside the removal.
    {
      code: `import { useCallback, type FC } from 'react';
const A: FC = () => {
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { type FC } from 'react';
const A: FC = () => {
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o} />;
};`,
      errors: errors(),
    },
    // A comment right after the opening brace belongs to no specifier and stays.
    {
      code: `import { /* head */ useCallback, useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { /* head */ useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // A JSDoc block above a surviving specifier keeps its indentation.
    {
      code: `import {
  useCallback,
  /**
   * Local state.
   */
  useState
} from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  /**
   * Local state.
   */
  useState
} from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // Two specifiers of the same binding are both spliced out: each claims a
    // different comma, so the fixes never overlap.
    {
      code: `import { useCallback, useCallback as uc, useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  const p = uc(() => { go(); }, []);
  return <div onClick={o}>{s}{String(p)}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  const p = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}{String(p)}</div>;
};`,
      errors: [
        { message: expectedMessage('useCallback') },
        { message: expectedMessage('useCallback') },
        { message: expectedMessage('uc') },
      ] as unknown as RuleError[],
    },
    // The same pair trailing the list: each takes the comma before it.
    {
      code: `import { useState, useCallback, useCallback as uc } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  const p = uc(() => { go(); }, []);
  return <div onClick={o}>{s}{String(p)}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  const p = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}{String(p)}</div>;
};`,
      errors: [
        { message: expectedMessage('useCallback') },
        { message: expectedMessage('useCallback') },
        { message: expectedMessage('uc') },
      ] as unknown as RuleError[],
    },
    // A trailing comma in the list is left where it is: still valid syntax.
    {
      code: `import { useState, useCallback, } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState, } from 'react';
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // The react import keeps its own quote style and layout: only the removed
    // specifier's tokens are touched.
    {
      code: `import {
  useCallback,
  useState,
} from "react";
const A = () => {
  const [s] = useState(0);
  const o = useCallback(() => { go(); }, []);
  return <div onClick={o}>{s}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import {
  useState,
} from "react";
const A = () => {
  const [s] = useState(0);
  const o = useLatestCallback(() => { go(); });
  return <div onClick={o}>{s}</div>;
};`,
      errors: errors(),
    },
    // Collapsing the multi-line call form removes one nesting level, so the
    // callback body has to shed that level too or it ends up over-indented.
    {
      code: `import { useCallback } from 'react';
const A = ({ height }) => {
  const dimension = useCallback(
    ({ width }) => {
      if (width > 0) {
        return height;
      }
      return 0;
    },
    [height],
  );
  return <div>{dimension}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = ({ height }) => {
  const dimension = useLatestCallback(({ width }) => {
    if (width > 0) {
      return height;
    }
    return 0;
  });
  return <div>{dimension}</div>;
};`,
      errors: errors(),
    },
    // The same collapse at a deeper nesting depth: the shift is relative to the
    // call's own line, not to a fixed column.
    {
      code: `import { useCallback } from 'react';
const A = ({ items }) => {
  if (items) {
    const map = useCallback(
      (item) => {
        return items.map((i) => {
          return i + item;
        });
      },
      [items],
    );
    return <div>{map}</div>;
  }
  return null;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = ({ items }) => {
  if (items) {
    const map = useLatestCallback((item) => {
      return items.map((i) => {
        return i + item;
      });
    });
    return <div>{map}</div>;
  }
  return null;
};`,
      errors: errors(),
    },
    // A callback that already starts on the call's line loses no nesting level,
    // so its body must be reproduced verbatim.
    {
      code: `import { useCallback } from 'react';
const A = ({ items }) => {
  if (items) {
    const map = useCallback((item) => {
      return items.map((i) => {
        return i + item;
      });
    }, [items]);
    return <div>{map}</div>;
  }
  return null;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = ({ items }) => {
  if (items) {
    const map = useLatestCallback((item) => {
      return items.map((i) => {
        return i + item;
      });
    });
    return <div>{map}</div>;
  }
  return null;
};`,
      errors: errors(),
    },
    // Whitespace inside a template literal is string data, not formatting, so
    // the collapse must leave every line of it byte-identical.
    {
      code: `import { useCallback } from 'react';
const A = ({ name }) => {
  const build = useCallback(
    (title) => {
      const message = \`
      Hello \${name}
        \${title}
\`;
      return message;
    },
    [name],
  );
  return <div>{build}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = ({ name }) => {
  const build = useLatestCallback((title) => {
    const message = \`
      Hello \${name}
        \${title}
\`;
    return message;
  });
  return <div>{build}</div>;
};`,
      errors: errors(),
    },
    // A tab-indented file sheds one tab, not two spaces.
    {
      code: `import { useCallback } from 'react';
const A = ({ height }) => {
\tconst dimension = useCallback(
\t\t({ width }) => {
\t\t\tif (width > 0) {
\t\t\t\treturn height;
\t\t\t}
\t\t\treturn 0;
\t\t},
\t\t[height],
\t);
\treturn <div>{dimension}</div>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
const A = ({ height }) => {
\tconst dimension = useLatestCallback(({ width }) => {
\t\tif (width > 0) {
\t\t\treturn height;
\t\t}
\t\treturn 0;
\t});
\treturn <div>{dimension}</div>;
};`,
      errors: errors(),
    },

    // -----------------------------------------------------------------------
    // The collapsed call is only emitted while it fits the print width; past it
    // the broken-open call form is preserved (issue #1579). Every `output` below
    // is a fixed point of Prettier at width 80 unless the case says otherwise.
    // -----------------------------------------------------------------------
    // The issue's own reproduction: 106 columns when collapsed.
    {
      code: `import { useCallback } from 'react';

export const useVisibilityObserver = (onChange: (i: number) => void) => {
  const updateIntersectionState = useCallback(
    (index: number, entry: IntersectionObserverEntry) => {
      onChange(index);
      return entry.isIntersecting;
    },
    [onChange],
  );
  return updateIntersectionState;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useVisibilityObserver = (onChange: (i: number) => void) => {
  const updateIntersectionState = useLatestCallback(
    (index: number, entry: IntersectionObserverEntry) => {
      onChange(index);
      return entry.isIntersecting;
    },
  );
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // One column under the width: still collapsed (79 columns).
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const update = useCallback(
    (ppppppppppppppppppppppppppppp: number) => {
      onChange(ppppppppppppppppppppppppppppp);
    },
    [onChange],
  );
  return update;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const update = useLatestCallback((ppppppppppppppppppppppppppppp: number) => {
    onChange(ppppppppppppppppppppppppppppp);
  });
  return update;
};`,
      errors: errors(),
    },
    // Exactly at the width: still collapsed (80 columns).
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const update = useCallback(
    (pppppppppppppppppppppppppppppp: number) => {
      onChange(pppppppppppppppppppppppppppppp);
    },
    [onChange],
  );
  return update;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const update = useLatestCallback((pppppppppppppppppppppppppppppp: number) => {
    onChange(pppppppppppppppppppppppppppppp);
  });
  return update;
};`,
      errors: errors(),
    },
    // One column over the width: broken open (81 columns collapsed).
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const update = useCallback(
    (ppppppppppppppppppppppppppppppp: number) => {
      onChange(ppppppppppppppppppppppppppppppp);
    },
    [onChange],
  );
  return update;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const update = useLatestCallback(
    (ppppppppppppppppppppppppppppppp: number) => {
      onChange(ppppppppppppppppppppppppppppppp);
    },
  );
  return update;
};`,
      errors: errors(),
    },
    // A raised printWidth keeps a 103-column call collapsed.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useCallback(
    (index: number, entry: IntersectionObserverEntry) => {
      onChange(index);
    },
    [onChange],
  );
  return updateIntersectionState;
};`,
      options: [{ printWidth: 120 }],
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useLatestCallback((index: number, entry: IntersectionObserverEntry) => {
    onChange(index);
  });
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // A lowered printWidth breaks open a call that fits comfortably at 80.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const onPress = useCallback(() => {
    go();
  }, []);
  return onPress;
};`,
      options: [{ printWidth: 40 }],
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const onPress = useLatestCallback(
    () => {
      go();
    },
  );
  return onPress;
};`,
      errors: errors(),
    },
    // A hugged call that only overruns the width because the hook's name is six
    // characters longer than useCallback's. The template literal's interior
    // lines are string DATA, so they must not move with the body around them.
    {
      code: `import { useCallback } from 'react';

export const useThing = (name: string) => {
  const buildTheLocalizedGreetingMessage = useCallback((title: string) => {
    const message = \`
      Hello \${name}
        \${title}
\`;
    return message;
  }, [name]);
  return buildTheLocalizedGreetingMessage;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (name: string) => {
  const buildTheLocalizedGreetingMessage = useLatestCallback(
    (title: string) => {
      const message = \`
      Hello \${name}
        \${title}
\`;
      return message;
    },
  );
  return buildTheLocalizedGreetingMessage;
};`,
      errors: errors(),
    },
    // The same guard in the other direction: a call already broken open at the
    // target depth is reproduced byte for byte, template included.
    {
      code: `import { useCallback } from 'react';

export const useThing = (name: string) => {
  const buildTheLocalizedGreetingMessage = useCallback(
    (title: string, subtitle: string) => {
      const message = \`
      Hello \${name}
        \${title}
\`;
      return message;
    },
    [name],
  );
  return buildTheLocalizedGreetingMessage;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (name: string) => {
  const buildTheLocalizedGreetingMessage = useLatestCallback(
    (title: string, subtitle: string) => {
      const message = \`
      Hello \${name}
        \${title}
\`;
      return message;
    },
  );
  return buildTheLocalizedGreetingMessage;
};`,
      errors: errors(),
    },
    // Type parameters ride the callee's line, as Prettier puts them.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const update = useCallback<(index: number, entry: Entry) => void>(
    (index: number, entry: Entry) => {
      onChange(index);
    },
    [onChange],
  );
  return update;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const update = useLatestCallback<(index: number, entry: Entry) => void>(
    (index: number, entry: Entry) => {
      onChange(index);
    },
  );
  return update;
};`,
      errors: errors(),
    },
    // A source written without a trailing comma keeps that style: the emitted
    // list follows the formatter setting the rewritten call already showed.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useCallback(
    (index: number, entry: IntersectionObserverEntry) => {
      onChange(index);
    },
    [onChange]
  );
  return updateIntersectionState;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useLatestCallback(
    (index: number, entry: IntersectionObserverEntry) => {
      onChange(index);
    }
  );
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // A function expression WITH parameters is hugged onto the call line with
    // its parameter list broken one per line, which is Prettier's own answer
    // here: the head through the parameter list's `(` measures 62 columns, so
    // the callback stays hugged and only the parameters move (issue #2047).
    // Collapsed, this line would run to 112 columns.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useCallback(
    function (index: number, entry: IntersectionObserverEntry) {
      onChange(index);
    },
    [onChange],
  );
  return updateIntersectionState;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useLatestCallback(function (
    index: number,
    entry: IntersectionObserverEntry,
  ) {
    onChange(index);
  });
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // The issue's own minimal reproduction: one ordinary React event parameter
    // already overruns the width when collapsed (85 columns). The head through
    // the parameter list's `(` measures 41, so the callback stays hugged.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const cb = useCallback(
    function (event: React.PointerEvent<HTMLDivElement>) {
      go();
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const cb = useLatestCallback(function (
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    go();
  });
  return cb;
};`,
      errors: errors(),
    },
    // A NAMED function expression: the name rides the hugged head, exactly
    // where Prettier puts it (105 columns collapsed).
    {
      code: `import { useCallback } from 'react';

export const useScroll = (onScroll: (t: number) => void) => {
  const handleScroll = useCallback(
    function onScrollHandler(event: React.UIEvent<HTMLDivElement>) {
      onScroll(event.currentTarget.scrollTop);
    },
    [onScroll],
  );
  return handleScroll;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useScroll = (onScroll: (t: number) => void) => {
  const handleScroll = useLatestCallback(function onScrollHandler(
    event: React.UIEvent<HTMLDivElement>,
  ) {
    onScroll(event.currentTarget.scrollTop);
  });
  return handleScroll;
};`,
      errors: errors(),
    },
    // A rest parameter has to stay last, so the broken list ends without the
    // trailing comma the setting otherwise asks for.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: (...a: number[]) => void) => {
  const cb = useCallback(
    function (firstArgument: number, ...remainingArgumentValues: number[]) {
      go(firstArgument, ...remainingArgumentValues);
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: (...a: number[]) => void) => {
  const cb = useLatestCallback(function (
    firstArgument: number,
    ...remainingArgumentValues: number[]
  ) {
    go(firstArgument, ...remainingArgumentValues);
  });
  return cb;
};`,
      errors: errors(),
    },
    // The hug/break-open threshold, lower side: the head through the parameter
    // list's `(` measures exactly 80, so Prettier hugs and so does the fix.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const handler = useCallback(
    function handleTheDeferredNavigationRequest(event: PointerEvent) {
      go();
    },
    [go],
  );
  return handler;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const handler = useLatestCallback(function handleTheDeferredNavigationRequest(
    event: PointerEvent,
  ) {
    go();
  });
  return handler;
};`,
      errors: errors(),
    },
    // The same threshold, upper side: one more character in the function's name
    // puts the hugged head at 81, and Prettier breaks the argument list open
    // instead. Paired with the case above, this pins the boundary in both
    // directions rather than only the wrapping one.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const handler = useCallback(
    function handleTheDeferredNavigationRequests(event: PointerEvent) {
      go();
    },
    [go],
  );
  return handler;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const handler = useLatestCallback(
    function handleTheDeferredNavigationRequests(event: PointerEvent) {
      go();
    },
  );
  return handler;
};`,
      errors: errors(),
    },
    // The shape agora ships in EditableWrapperBigInt.tsx: a named function
    // expression whose head already spans lines. Its hugged head measures 84,
    // so the call breaks open and the callback's own layout survives verbatim.
    {
      code: `import { useCallback } from 'react';

export const useWrap = (ViewComponent: any, value: bigint) => {
  const BigIntViewComponent = useCallback(
    function BigIntViewComponentWrapper(
      viewProps: Readonly<ViewComponentPropsBase<string>>,
    ) {
      return use(ViewComponent, viewProps, value);
    },
    [ViewComponent, value],
  );
  return BigIntViewComponent;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useWrap = (ViewComponent: any, value: bigint) => {
  const BigIntViewComponent = useLatestCallback(
    function BigIntViewComponentWrapper(
      viewProps: Readonly<ViewComponentPropsBase<string>>,
    ) {
      return use(ViewComponent, viewProps, value);
    },
  );
  return BigIntViewComponent;
};`,
      errors: errors(),
    },
    // A comment written alongside a parameter rides the line the parameter
    // moves to. Per-parameter node text would re-emit the parameter and drop
    // the comment, so the emitted list is sliced between the separators.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const cb = useCallback(
    function (/* the pointer event */ event: React.PointerEvent<HTMLElement>) {
      go();
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const cb = useLatestCallback(function (
    /* the pointer event */ event: React.PointerEvent<HTMLElement>,
  ) {
    go();
  });
  return cb;
};`,
      errors: errors(),
    },
    // A sole destructuring parameter is the one shape Prettier breaks
    // differently: it opens the pattern's own braces and leaves the parameter
    // list intact. The one-per-line spelling measures within the width yet is
    // rewritten straight back, so it is not authored — the call breaks open,
    // which at least emits no line past the width.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useCallback(
    function ({ alpha, bravo, charlie, delta }: SubmissionProps) {
      go();
    },
    [go],
  );
  return handleTheFormSubmission;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useLatestCallback(
    function ({ alpha, bravo, charlie, delta }: SubmissionProps) {
      go();
    },
  );
  return handleTheFormSubmission;
};`,
      errors: errors(),
    },
    // A second parameter alongside the pattern puts the list back on the
    // one-per-line path, because Prettier breaks the list rather than the
    // pattern as soon as the pattern is not alone.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useCallback(
    function ({ alpha, bravo }: SubmissionProps, index: number) {
      go();
    },
    [go],
  );
  return handleTheFormSubmission;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useLatestCallback(function (
    { alpha, bravo }: SubmissionProps,
    index: number,
  ) {
    go();
  });
  return handleTheFormSubmission;
};`,
      errors: errors(),
    },
    // A default turns the pattern into an AssignmentPattern, which is no longer
    // the sole-pattern shape Prettier expands in place, so the list breaks one
    // per line again. This pins the carve-out's own boundary.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useCallback(
    function ({ alpha, bravo, charlie }: SubmissionProps = {} as any) {
      go();
    },
    [go],
  );
  return handleTheFormSubmission;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const handleTheFormSubmission = useLatestCallback(function (
    { alpha, bravo, charlie }: SubmissionProps = {} as any,
  ) {
    go();
  });
  return handleTheFormSubmission;
};`,
      errors: errors(),
    },
    // The hugged head is read from the source rather than rebuilt, so an
    // `async` keyword rides it where Prettier puts it.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => Promise<void>) => {
  const cb = useCallback(
    async function (event: React.PointerEvent<HTMLDivElement>) {
      await go();
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => Promise<void>) => {
  const cb = useLatestCallback(async function (
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    await go();
  });
  return cb;
};`,
      errors: errors(),
    },
    // The callback's own type parameters ride the hugged head too, which is why
    // the head is sliced through the parameter list's `(` rather than assembled
    // from the `function` keyword and a name.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const cb = useCallback(
    function <T extends HTMLElement>(event: React.PointerEvent<T>, extra: T) {
      go();
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const cb = useLatestCallback(function <T extends HTMLElement>(
    event: React.PointerEvent<T>,
    extra: T,
  ) {
    go();
  });
  return cb;
};`,
      errors: errors(),
    },
    // The collapse direction: a parameterised function expression that fits is
    // left on one line. Wrapping unconditionally would be the opposite bug,
    // since Prettier collapses a short broken-open list straight back.
    {
      code: `import { useCallback } from 'react';

export const useThing = (go: () => void) => {
  const cb = useCallback(
    function (event: MouseEvent) {
      go();
    },
    [go],
  );
  return cb;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (go: () => void) => {
  const cb = useLatestCallback(function (event: MouseEvent) {
    go();
  });
  return cb;
};`,
      errors: errors(),
    },
    // A raised printWidth moves the threshold with it: the same 112-column call
    // the default breaks stays collapsed at 120.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useCallback(
    function (index: number, entry: IntersectionObserverEntry) {
      onChange(index);
    },
    [onChange],
  );
  return updateIntersectionState;
};`,
      options: [{ printWidth: 120 }],
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
  const updateIntersectionState = useLatestCallback(function (index: number, entry: IntersectionObserverEntry) {
    onChange(index);
  });
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // A parameter-less function expression has no parameter list to break, so
    // Prettier breaks the call open and so does the fix.
    {
      code: `import { useCallback } from 'react';

export const useSomethingWithAnExtremelyDescriptiveName = (go: () => void) => {
  const handleTheDeferredNavigationRequest = useCallback(
    function performNavigation() {
      go();
    },
    [go],
  );
  return handleTheDeferredNavigationRequest;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useSomethingWithAnExtremelyDescriptiveName = (go: () => void) => {
  const handleTheDeferredNavigationRequest = useLatestCallback(
    function performNavigation() {
      go();
    },
  );
  return handleTheDeferredNavigationRequest;
};`,
      errors: errors(),
    },
    // Four levels of nesting: the closing paren lands at the statement's own
    // indentation, not at a fixed column.
    {
      code: `import { useCallback } from 'react';

export const useDeep = (onChange: (i: number) => void, enabled: boolean) => {
  if (enabled) {
    if (onChange) {
      const update = useCallback(
        (index: number, entry: IntersectionObserverEntry) => {
          onChange(index);
        },
        [onChange],
      );
      return update;
    }
  }
  return undefined;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useDeep = (onChange: (i: number) => void, enabled: boolean) => {
  if (enabled) {
    if (onChange) {
      const update = useLatestCallback(
        (index: number, entry: IntersectionObserverEntry) => {
          onChange(index);
        },
      );
      return update;
    }
  }
  return undefined;
};`,
      errors: errors(),
    },
    // A tab-indented file breaks open with a tab step, taken from the file.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
\tconst updateIntersectionState = useCallback(
\t\t(index: number, entry: IntersectionObserverEntry) => {
\t\t\tonChange(index);
\t\t},
\t\t[onChange],
\t);
\treturn updateIntersectionState;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
\tconst updateIntersectionState = useLatestCallback(
\t\t(index: number, entry: IntersectionObserverEntry) => {
\t\t\tonChange(index);
\t\t},
\t);
\treturn updateIntersectionState;
};`,
      errors: errors(),
    },
    // Indent characters that disagree give no delta that can be applied without
    // corrupting the layout, so the call falls back to the collapsed form with
    // the callback reproduced exactly as the author wrote it.
    {
      code: `import { useCallback } from 'react';

export const useThing = (onChange: (i: number) => void) => {
\t const updateIntersectionState = useCallback(
        (index: number, entry: IntersectionObserverEntry) => {
          onChange(index);
        },
        [onChange],
      );
  return updateIntersectionState;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (onChange: (i: number) => void) => {
\t const updateIntersectionState = useLatestCallback((index: number, entry: IntersectionObserverEntry) => {
          onChange(index);
        });
  return updateIntersectionState;
};`,
      errors: errors(),
    },
    // A realistic hook: two calls in one atomic fix, one past the width and one
    // comfortably under it, each getting the shape Prettier would give it.
    {
      code: `import { useCallback, useState } from 'react';

export const useBatch = (onFlush: (rows: readonly string[]) => void) => {
  const [rows, setRows] = useState([] as readonly string[]);

  const appendRow = useCallback(
    (row: string, options: { deduplicate: boolean }) => {
      setRows((previous) => {
        return options.deduplicate && previous.includes(row)
          ? previous
          : [...previous, row];
      });
    },
    [],
  );

  const flush = useCallback(() => {
    onFlush(rows);
    setRows([]);
  }, [onFlush, rows]);

  return { appendRow, flush };
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';

export const useBatch = (onFlush: (rows: readonly string[]) => void) => {
  const [rows, setRows] = useState([] as readonly string[]);

  const appendRow = useLatestCallback(
    (row: string, options: { deduplicate: boolean }) => {
      setRows((previous) => {
        return options.deduplicate && previous.includes(row)
          ? previous
          : [...previous, row];
      });
    },
  );

  const flush = useLatestCallback(() => {
    onFlush(rows);
    setRows([]);
  });

  return { appendRow, flush };
};`,
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // Issue #1652: the dependency array holds the only read of `listHash`, the
    // binding `no-array-length-in-deps` hoists for it. Deleting the array would
    // strand that declaration (and the imports feeding it) with nothing using
    // it, so the violation reports with no fix attached.
    {
      code: `import { useCallback, useMemo } from 'react';
import { stableHash } from 'functions/src/util/hash/stableHash';

export const useThing = ({ items }: { items: string[] }) => {
  const list = useList({ items });
  const listHash = useMemo(() => stableHash(list), [list]);

  const handle = useCallback(() => {
    save(list);
  }, [listHash]);

  return handle;
};`,
      output: null,
      errors: errors(),
    },
    // The batch is atomic, so one orphaned binding withholds the whole change
    // set — including the sibling call that would convert cleanly on its own.
    {
      code: `import { useCallback, useMemo } from 'react';

export const useThing = (rows: string[]) => {
  const rowsHash = useMemo(() => hash(rows), [rows]);

  const first = useCallback(() => {
    send(rows);
  }, [rowsHash]);

  const second = useCallback(() => {
    send(rows);
  }, [rows]);

  return { first, second };
};`,
      output: null,
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // A binding declared in an enclosing function, not the callback's own, is
    // orphaned just the same.
    {
      code: `import { useCallback } from 'react';

export const makeHook = (source: string[]) => {
  const sizeKey = source.length;

  return () => {
    const handle = useCallback(() => {
      go();
    }, [sizeKey]);
    return handle;
  };
};`,
      output: null,
      errors: errors(),
    },
    // Resolution, not name matching: the orphaned `seed` is the inner one, while
    // a module-scope binding of the same name keeps its own readers.
    {
      code: `import { useCallback } from 'react';

const seed = createSeed();

export const useThing = () => {
  const seed = deriveSeed();

  const handle = useCallback(() => {
    go();
  }, [seed]);

  return handle;
};

export const report = () => log(seed);`,
      output: null,
      errors: errors(),
    },
    // Only reads keep a binding alive: an assignment that survives inside the
    // callback still leaves `attempts` written but never read.
    {
      code: `import { useCallback } from 'react';

export const useThing = (initial: number) => {
  let attempts = initial;

  const reset = useCallback(() => {
    attempts = 0;
  }, [attempts]);

  return reset;
};`,
      output: null,
      errors: errors(),
    },
    // No over-yield: a dependency the callback body reads too survives the fix.
    {
      code: `import { useCallback } from 'react';

export const useThing = (rows: string[]) => {
  const total = rows.length;

  const report = useCallback(() => {
    send(total);
  }, [total]);

  return report;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (rows: string[]) => {
  const total = rows.length;

  const report = useLatestCallback(() => {
    send(total);
  });

  return report;
};`,
      errors: errors(),
    },
    // A dependency read by another hook, outside the deleted array, survives.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = () => {
  const view = useView();

  const handle = useCallback(() => {
    go();
  }, [view]);

  useEffect(() => {
    track(view);
  }, [view]);

  return handle;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useEffect } from 'react';

export const useThing = () => {
  const view = useView();

  const handle = useLatestCallback(() => {
    go();
  });

  useEffect(() => {
    track(view);
  }, [view]);

  return handle;
};`,
      errors: errors(),
    },
    // An UNEXPORTED module-scope binding read only by the deleted array is dead
    // once the array goes, and this rule cannot delete a `const` — so the whole
    // fix is withheld and the author drops the declaration with the array. The
    // fixture used to assert the conversion shipped, on the reasoning that a
    // module-scope binding "can be exported or read from another file"; a
    // binding that is neither exported nor re-exported cannot (issue #1898).
    {
      code: `import { useCallback } from 'react';

const OPTIONS = { retries: 3 };

export const useThing = () => {
  const handle = useCallback(() => {
    go();
  }, [OPTIONS]);

  return handle;
};`,
      output: null,
      errors: errors(),
    },
    // An EXPORTED module-scope binding has a consumer no edit to this file can
    // reach, so the array goes and the declaration stays.
    {
      code: `import { useCallback } from 'react';

export const OPTIONS = { retries: 3 };

export const useThing = () => {
  const handle = useCallback(() => {
    go();
  }, [OPTIONS]);

  return handle;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const OPTIONS = { retries: 3 };

export const useThing = () => {
  const handle = useLatestCallback(() => {
    go();
  });

  return handle;
};`,
      errors: errors(),
    },
    // An imported binding IS this rule's to retire: the import goes with the
    // array that held its last read, in the same fix.
    {
      code: `import { useCallback } from 'react';
import { CONFIG } from './config';

export const useThing = () => {
  const handle = useCallback(() => {
    go();
  }, [CONFIG]);

  return handle;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = () => {
  const handle = useLatestCallback(() => {
    go();
  });

  return handle;
};`,
      errors: errors(),
    },
    // A dependency resolving past a shadow reaches the module-scope binding, so
    // the inner binding of that name does not keep it alive and the fix is
    // withheld.
    {
      code: `import { useCallback } from 'react';

const scale = 2;

export const useThing = () => {
  const handle = useCallback(() => {
    go();
  }, [scale]);

  const nested = () => {
    const scale = 1;
    return scale;
  };

  return { handle, nested };
};`,
      output: null,
      errors: errors(),
    },
    // An empty dependency array deletes no reference at all.
    {
      code: `import { useCallback } from 'react';

export const useThing = () => {
  const limit = useLimit();

  const handle = useCallback(() => {
    send(limit);
  }, []);

  return handle;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = () => {
  const limit = useLimit();

  const handle = useLatestCallback(() => {
    send(limit);
  });

  return handle;
};`,
      errors: errors(),
    },
    // Neither does a call written without a dependency array.
    {
      code: `import { useCallback } from 'react';

export const useThing = () => {
  const limit = useLimit();

  const handle = useCallback(() => {
    send(limit);
  });

  return handle;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = () => {
  const limit = useLimit();

  const handle = useLatestCallback(() => {
    send(limit);
  });

  return handle;
};`,
      errors: errors(),
    },

    // -----------------------------------------------------------------------
    // The other side of the issue #1711 carve-out: sites whose identity nothing
    // keys on still convert. Narrowing further than these shapes would hand the
    // rule's whole purpose to an exemption.
    // -----------------------------------------------------------------------
    // An empty dependency array pins the identity already, so handing the
    // result to a custom hook changes nothing the hook can observe.
    {
      code: `import { useCallback } from 'react';
import { useFirestore } from './useFirestore';

export const useThing = () => {
  const handler = useCallback((snap) => {
    return snap.length;
  }, []);

  return useFirestore(handler, []);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useFirestore } from './useFirestore';

export const useThing = () => {
  const handler = useLatestCallback((snap) => {
    return snap.length;
  });

  return useFirestore(handler, []);
};`,
      errors: errors(),
    },
    // The same for an empty-deps result listed in another hook's dependencies.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = () => {
  const handler = useCallback(() => {
    save();
  }, []);

  useEffect(() => {
    handler();
  }, [handler]);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useEffect } from 'react';

export const useThing = () => {
  const handler = useLatestCallback(() => {
    save();
  });

  useEffect(() => {
    handler();
  }, [handler]);
};`,
      errors: errors(),
    },
    // A JSX prop reads the callback, it does not compare it: React invokes what
    // the stable wrapper holds, which is always the latest closure.
    {
      code: `import { useCallback } from 'react';

export const Thing = ({ id }) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  return <button onClick={handler}>Save</button>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Thing = ({ id }) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  return <button onClick={handler}>Save</button>;
};`,
      errors: errors(),
    },
    // Direct invocation reads the callback through the same wrapper.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  useEffect(() => {
    handler();
  }, []);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useEffect } from 'react';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  useEffect(() => {
    handler();
  }, []);
};`,
      errors: errors(),
    },
    // A plain function holds the callback to call it later, and keys nothing on
    // which reference it received.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(handler, 0);
    return () => clearTimeout(timer);
  }, []);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useEffect } from 'react';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  useEffect(() => {
    const timer = setTimeout(handler, 0);
    return () => clearTimeout(timer);
  }, []);
};`,
      errors: errors(),
    },
    // A dependency-array-shaped argument to a plain function is not a hook's
    // dependency array: the convention is what identifies one.
    {
      code: `import { useCallback } from 'react';
import { register } from './register';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  register(handler, [handler]);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { register } from './register';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  register(handler, [handler]);
};`,
      errors: errors(),
    },
    // `useful` is not a hook: the convention needs the capital that starts the
    // noun, and a rule that dropped it would exempt half the standard library.
    {
      code: `import { useCallback } from 'react';
import { useful, user } from './helpers';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  useful(handler);
  user.subscribe(handler);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useful, user } from './helpers';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  useful(handler);
  user.subscribe(handler);
};`,
      errors: errors(),
    },
    // An object handed to a hook is rebuilt every render, so the hook cannot be
    // keyed on the callback through it. The carve-out stays at the argument the
    // hook actually receives.
    {
      code: `import { useCallback } from 'react';
import { useOptions } from './useOptions';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  useOptions({ onDone: handler });
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useOptions } from './useOptions';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  useOptions({ onDone: handler });
};`,
      errors: errors(),
    },
    // Returning the callback keeps reporting: the consumer sits outside this
    // file, so nothing here shows the identity is compared. The carve-out is
    // scoped to consumption this file can actually read, and reporting is the
    // direction that preserves the rule (issue #1711).
    {
      code: `import { useCallback } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  return { handler };
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  return { handler };
};`,
      errors: errors(),
    },
    // Nothing reads the result at all.
    {
      code: `import { useCallback } from 'react';

export const useThing = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useThing = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });
};`,
      errors: errors(),
    },
    // The binding in the dependency array is a different one of the same name,
    // so name matching would exempt a site nothing keys on.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useOuter = (id) => {
  const handler = useCallback(() => {
    save(id);
  }, [id]);

  return <Row onSelect={handler} />;
};

export const useInner = () => {
  const handler = useThrottled();

  useEffect(() => {
    handler();
  }, [handler]);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useEffect } from 'react';

export const useOuter = (id) => {
  const handler = useLatestCallback(() => {
    save(id);
  });

  return <Row onSelect={handler} />;
};

export const useInner = () => {
  const handler = useThrottled();

  useEffect(() => {
    handler();
  }, [handler]);
};`,
      errors: errors(),
    },
    // An exempt call sitting beside a convertible one converts only the latter,
    // and the react import survives because the exempt call still needs it.
    {
      code: `import { useCallback, useEffect } from 'react';

export const useThing = (id) => {
  const subscribed = useCallback(() => {
    read(id);
  }, [id]);

  const pressed = useCallback(() => {
    save(id);
  }, [id]);

  useEffect(() => {
    subscribed();
  }, [subscribed]);

  return <button onClick={pressed}>Save</button>;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useCallback, useEffect } from 'react';

export const useThing = (id) => {
  const subscribed = useCallback(() => {
    read(id);
  }, [id]);

  const pressed = useLatestCallback(() => {
    save(id);
  });

  useEffect(() => {
    subscribed();
  }, [subscribed]);

  return <button onClick={pressed}>Save</button>;
};`,
      errors: errors(),
    },

    // -----------------------------------------------------------------------
    // The other side of the ref carve-out. `ref` is the one JSX attribute whose
    // value React compares between renders, so every neighbouring shape keeps
    // converting.
    // -----------------------------------------------------------------------
    // An empty dependency array pins the identity already, so the ref registers
    // exactly once either way.
    {
      code: `import { useCallback } from 'react';

export const Slot = () => {
  const attach = useCallback((element) => {
    measure(element);
  }, []);

  return <div ref={attach} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Slot = () => {
  const attach = useLatestCallback((element) => {
    measure(element);
  });

  return <div ref={attach} />;
};`,
      errors: errors(),
    },
    // `innerRef` is an ordinary prop: the component behind it decides what it
    // does with the value, which this file cannot read.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }) => {
  const attach = useCallback((element) => {
    measure(element, density);
  }, [density]);

  return <Panel innerRef={attach} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Slot = ({ density }) => {
  const attach = useLatestCallback((element) => {
    measure(element, density);
  });

  return <Panel innerRef={attach} />;
};`,
      errors: errors(),
    },
    // A property spelled `ref` on an object handed to a plain function reaches
    // no ref: the carve-out keys on the JSX attribute React itself registers.
    {
      code: `import { useCallback } from 'react';

export const useSlot = (density) => {
  const attach = useCallback((element) => {
    measure(element, density);
  }, [density]);

  register({ ref: attach });
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const useSlot = (density) => {
  const attach = useLatestCallback((element) => {
    measure(element, density);
  });

  register({ ref: attach });
};`,
      errors: errors(),
    },
    // A namespaced attribute whose local part reads `ref` is a different
    // attribute, and name matching alone would exempt it.
    {
      code: `import { useCallback } from 'react';

export const Slot = ({ density }) => {
  const attach = useCallback((element) => {
    measure(element, density);
  }, [density]);

  return <svg:a xlink:ref={attach} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Slot = ({ density }) => {
  const attach = useLatestCallback((element) => {
    measure(element, density);
  });

  return <svg:a xlink:ref={attach} />;
};`,
      errors: errors(),
    },

    // -----------------------------------------------------------------------
    // Converting `React.useCallback` strips the last read of the react default
    // import, so the import goes with it — in the same fix (issue #1898).
    // Whether it goes is decided by SCOPE ANALYSIS alone, never by a JSX or
    // `.tsx` test: the scope manager records the implicit `React` reference a
    // JSX pragma creates, and it is the same oracle `no-unused-vars` consults.
    // -----------------------------------------------------------------------
    // The reported repro: the only read of `React` is the callee being replaced.
    {
      code: `import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const inner = useLatestCallback(() => doThing());
  return inner;
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // `React` read elsewhere survives. An over-eager removal is the worse bug:
    // it unbinds a reference and breaks the file outright.
    {
      code: `import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return React.createElement('div', null, inner);
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';

export const Widget = () => {
  const inner = useLatestCallback(() => doThing());
  return React.createElement('div', null, inner);
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // A type-position read counts too.
    {
      code: `import React from 'react';

export const Widget = (): React.ReactElement | null => {
  const inner = React.useCallback(() => doThing(), []);
  void inner;
  return null;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';

export const Widget = (): React.ReactElement | null => {
  const inner = useLatestCallback(() => doThing());
  void inner;
  return null;
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // The JSX pragma side of the same question, in a `.tsx` file: JSX is a read
    // of `React` under the classic runtime, and the scope manager says so, so
    // the import stays without this rule ever inspecting the extension.
    {
      code: `import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return <div onClick={inner} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';

export const Widget = () => {
  const inner = useLatestCallback(() => doThing());
  return <div onClick={inner} />;
};`,
      filename: 'widget.tsx',
      errors: errors(),
    },
    // The other side, same file shape: told there is no pragma, the scope
    // manager records no reference and the import goes. A hand-written "does
    // this file contain JSX" guard would have kept it here and left a `React`
    // binding the automatic runtime never reads.
    {
      code: `import React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return <div onClick={inner} />;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const inner = useLatestCallback(() => doThing());
  return <div onClick={inner} />;
};`,
      filename: 'widget.tsx',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        jsxPragma: null,
      },
      errors: errors(),
    },
    // A namespace import binds the same way.
    {
      code: `import * as React from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const inner = useLatestCallback(() => doThing());
  return inner;
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // Two member calls in one file. Judged one call at a time neither rewrite
    // is the binding's last read, so the batch is what makes the import's
    // orphanhood visible at all.
    {
      code: `import React from 'react';

export const Widget = () => {
  const a = React.useCallback(() => doThing(), []);
  const b = React.useCallback(() => doOther(), []);
  return [a, b];
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const a = useLatestCallback(() => doThing());
  const b = useLatestCallback(() => doOther());
  return [a, b];
};`,
      filename: 'widget.ts',
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // A mixed default-and-named import loses both bindings at once, so the
    // declaration goes as a whole rather than one clause leaving the other
    // stranded.
    {
      code: `import React, { useCallback } from 'react';

export const Widget = () => {
  const a = useCallback(() => doThing(), []);
  const b = React.useCallback(() => doOther(), []);
  return [a, b];
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const a = useLatestCallback(() => doThing());
  const b = useLatestCallback(() => doOther());
  return [a, b];
};`,
      filename: 'widget.ts',
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // Two react declarations, one per spelling: both are unbound in the one fix.
    {
      code: `import React from 'react';
import { useCallback } from 'react';

export const Widget = () => {
  const a = useCallback(() => doThing(), []);
  const b = React.useCallback(() => doOther(), []);
  return [a, b];
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const a = useLatestCallback(() => doThing());
  const b = useLatestCallback(() => doOther());
  return [a, b];
};`,
      filename: 'widget.ts',
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // A mixed import whose member call returns JSX is not converted, so `React`
    // keeps a reader and only the named clause goes.
    {
      code: `import React, { useCallback } from 'react';

export const Widget = () => {
  const row = React.useCallback(() => React.createElement('div'), []);
  const b = useCallback(() => doOther(), []);
  return [row, b];
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import React from 'react';

export const Widget = () => {
  const row = React.useCallback(() => React.createElement('div'), []);
  const b = useLatestCallback(() => doOther());
  return [row, b];
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // Other specifiers of the react import keep their own readers.
    {
      code: `import React, { useState } from 'react';

export const Widget = () => {
  const [s] = useState(0);
  const inner = React.useCallback(() => doThing(s), []);
  return inner;
};`,
      output: `import useLatestCallback from 'use-latest-callback';
import { useState } from 'react';

export const Widget = () => {
  const [s] = useState(0);
  const inner = useLatestCallback(() => doThing(s));
  return inner;
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // Type parameters ride through the rewrite that retires the import.
    {
      code: `import React from 'react';

export const Widget = () => {
  const inner = React.useCallback<() => void>(() => doThing(), []);
  return inner;
};`,
      output: `import useLatestCallback from 'use-latest-callback';

export const Widget = () => {
  const inner = useLatestCallback<() => void>(() => doThing());
  return inner;
};`,
      filename: 'widget.ts',
      errors: errors(),
    },
    // A comment inside the declaration makes the unbinding unsafe — a comment
    // can be a directive, and which line it governs is not this rule's to
    // guess — so the WHOLE fix is withheld rather than shipping the orphan.
    {
      code: `import React /* the runtime */ from 'react';

export const Widget = () => {
  const inner = React.useCallback(() => doThing(), []);
  return inner;
};`,
      output: null,
      filename: 'widget.ts',
      errors: errors(),
    },
    // The same, with the comment among a mixed import's named specifiers.
    {
      code: `import React, {
  useCallback, // memoize
} from 'react';

export const Widget = () => {
  const a = useCallback(() => doThing(), []);
  const b = React.useCallback(() => doOther(), []);
  return [a, b];
};`,
      output: null,
      filename: 'widget.ts',
      errors: errors('useCallback', 'useLatestCallback', 3),
    },
    // A dependency array holding the last read of an UNEXPORTED module-scope
    // const withholds the member-call conversion too: no import removal can
    // retire a `const`.
    {
      code: `import React from 'react';

const LIMIT = 3;

export const Widget = () => {
  const a = React.useCallback(() => doThing(), [LIMIT]);
  return a;
};`,
      output: null,
      filename: 'widget.ts',
      errors: errors(),
    },
    // A suppressed report beside a live one. The whole change set rides on the
    // FIRST conversion's report, so suppressing it drops every edit — the
    // remaining report has no fixer and nothing is rewritten, which is the only
    // state in which the react import's surviving reference is still true.
    {
      code: `import React from 'react';

export const Widget = () => {
  // eslint-disable-next-line use-latest-callback
  const a = React.useCallback(() => doThing(), []);
  const b = React.useCallback(() => doOther(), []);
  return [a, b];
};`,
      output: null,
      filename: 'widget.ts',
      errors: errors(),
    },
  ],
});

// RuleTester asserts a single fix pass, but `eslint --fix` loops until stable
// and interleaves fixes from OTHER rules. When another rule's fix wins the
// call-site range, any separately-reported import rewrite would land alone and
// permanently strand `useCallback(...)` without an import (issue #1400). These
// cases assert the whole change set rides on one atomic fix and that the
// multi-rule interaction converges.
describe('use-latest-callback: atomic import+conversion fix (issue #1400)', () => {
  const parserConfig = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2018 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
  };

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/use-latest-callback',
      useLatestCallback as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/vertically-group-related-functions',
      verticallyGroupRelatedFunctions as unknown as Rule.RuleModule,
    );
    return linter;
  };

  // The issue #1400 reproduction: callers-first ordering moves the block that
  // holds the useCallback call, so the reorder fix overlaps the conversion.
  const reorderRepro = `import { useState, useCallback } from 'react';

function formatValue(n) {
  return String(n);
}

function renderLabel(n) {
  return formatValue(n);
}

export const useThing = () => {
  const [count, setCount] = useState(0);

  const onPress = useCallback(() => {
    setCount((prev) => {
      return prev + renderLabel(1).length;
    });
  }, []);

  return { onPress };
};
`;

  it('emits every edit on a single report so no partial fix can land', () => {
    const linter = createLinter();
    const messages = linter.verify(
      reorderRepro,
      {
        ...parserConfig,
        rules: { 'test/use-latest-callback': 'error' as const },
      },
      'useThing.ts',
    );
    expect(messages.length).toBeGreaterThan(0);
    const fixCarrying = messages.filter((message) => message.fix);
    expect(fixCarrying).toHaveLength(1);
    const fix = fixCarrying[0].fix as Linter.LintMessage['fix'] & object;
    // The one fix must contain BOTH halves of the change: the import rewrite
    // and the call-site conversion (\b keeps useLatestCallback( from matching).
    expect(fix.text).toContain(
      "import useLatestCallback from 'use-latest-callback';",
    );
    expect(fix.text).toContain('useLatestCallback(');
    expect(/\buseCallback\s*\(/.test(fix.text)).toBe(false);
    // The merged range spans from the react import through the call site, so a
    // conflict anywhere in between defers the WHOLE fix to the next pass.
    const covered = reorderRepro.slice(fix.range[0], fix.range[1]);
    expect(covered).toContain("from 'react'");
    expect(covered).toContain('useCallback(');
  });

  it('converges alongside vertically-group-related-functions without stranding useCallback', () => {
    const linter = createLinter();
    const { output, messages } = linter.verifyAndFix(
      reorderRepro,
      {
        ...parserConfig,
        rules: {
          'test/use-latest-callback': 'error' as const,
          'test/vertically-group-related-functions': 'error' as const,
        },
      },
      'useThing.ts',
    );
    const hasReactUseCallbackImport =
      /import[^;]*\buseCallback\b[^;]*from\s*'react'/.test(output);
    const strandedCalls =
      /\buseCallback\s*\(/.test(output) && !hasReactUseCallbackImport;
    expect(strandedCalls).toBe(false);
    // Full convergence: the call is converted AND the import is rewritten.
    expect(output).toContain(
      "import useLatestCallback from 'use-latest-callback';",
    );
    expect(/\buseCallback\b/.test(output)).toBe(false);
    expect(output).toContain('useLatestCallback(');
    expect(messages).toHaveLength(0);
  });

  it('converts multiple useCallback calls and the import in one atomic pass', () => {
    const multi = `import { useCallback } from 'react';
export const useThing = (go) => {
  const a = useCallback(() => { go(1); }, []);
  const b = useCallback(() => { go(2); }, []);
  const c = useCallback(() => { go(3); }, []);
  return { a, b, c };
};
`;
    const linter = createLinter();
    const config = {
      ...parserConfig,
      rules: { 'test/use-latest-callback': 'error' as const },
    };
    const messages = linter.verify(multi, config, 'useThing.ts');
    expect(messages.filter((message) => message.fix)).toHaveLength(1);

    const { output, messages: remaining } = linter.verifyAndFix(
      multi,
      config,
      'useThing.ts',
    );
    expect(output).toBe(`import useLatestCallback from 'use-latest-callback';
export const useThing = (go) => {
  const a = useLatestCallback(() => { go(1); });
  const b = useLatestCallback(() => { go(2); });
  const c = useLatestCallback(() => { go(3); });
  return { a, b, c };
};
`);
    expect(remaining).toHaveLength(0);
  });

  // A directive inside the react import governs which rules report on the file.
  // RuleTester only compares text, so this asserts the consequence directly: a
  // rule that the directive suppresses must NOT come back after --fix.
  it('keeps a directive that suppresses a report on a surviving specifier', () => {
    const withDirective = `import {
  useCallback,
  // eslint-disable-next-line no-unused-vars
  useState
} from 'react';
export const useThing = (go) => {
  const o = useCallback(() => { go(); }, []);
  return { o };
};
`;
    const linter = createLinter();
    const config = {
      ...parserConfig,
      rules: {
        'test/use-latest-callback': 'error' as const,
        'no-unused-vars': 'error' as const,
      },
    };
    // The directive suppresses the unused `useState` before the fix runs.
    expect(linter.verify(withDirective, config, 'useThing.ts')).toHaveLength(2);

    const { output, messages } = linter.verifyAndFix(
      withDirective,
      config,
      'useThing.ts',
    );
    expect(output).toContain('// eslint-disable-next-line no-unused-vars');
    expect(messages).toHaveLength(0);
  });

  it('keeps the useCallback import when a nested conversion is blocked, then converges', () => {
    const nested = `import { useCallback } from 'react';
export const useThing = (go) => {
  const outer = useCallback(() => {
    const inner = useCallback(() => { go(); }, []);
    return inner;
  }, []);
  return { outer };
};
`;
    const linter = createLinter();
    const config = {
      ...parserConfig,
      rules: { 'test/use-latest-callback': 'error' as const },
    };
    // Pass 1 leaves the react import in place because the blocked inner call
    // still references it; the fix loop then converts it against fresh text.
    const { output, messages } = linter.verifyAndFix(
      nested,
      config,
      'useThing.ts',
    );
    const hasReactUseCallbackImport =
      /import[^;]*\buseCallback\b[^;]*from\s*'react'/.test(output);
    const strandedCalls =
      /\buseCallback\s*\(/.test(output) && !hasReactUseCallbackImport;
    expect(strandedCalls).toBe(false);
    expect(output).toContain(
      "import useLatestCallback from 'use-latest-callback';",
    );
    expect(/\buseCallback\s*\(/.test(output)).toBe(false);
    expect(messages).toHaveLength(0);
  });
});

// `--fix` runs every enabled rule over one file, so this fix has to stay sound
// against text a sibling rule wrote. `no-array-length-in-deps` hoists
// `const listHash = useMemo(() => stableHash(list), [list])` and points the
// dependency at it, leaving the dependency array as that binding's only reader —
// which dropping the array would strand (issue #1652). RuleTester runs one rule
// for one pass and cannot stage that, so the interaction is driven directly.
describe('use-latest-callback: no orphaned bindings after --fix (issue #1652)', () => {
  const parserConfig = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
  };

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/use-latest-callback',
      useLatestCallback as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/no-array-length-in-deps',
      noArrayLengthInDeps as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const bothRules = {
    ...parserConfig,
    rules: {
      'test/use-latest-callback': 'error' as const,
      'test/no-array-length-in-deps': 'error' as const,
    },
  };

  // The property the issue states: a file that starts clean under
  // no-unused-vars must still be clean after --fix.
  const unusedVarsIn = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    return linter.verify(
      code,
      { ...parserConfig, rules: { 'no-unused-vars': 'error' as const } },
      'useThing.ts',
    );
  };

  // The effect calls `handle` without listing it: a site whose identity another
  // hook keys on is exempt from this rule entirely (issue #1711), so listing it
  // would silence the very report this test measures the fix of.
  const lengthDependency = `import { useEffect, useCallback } from 'react';

export const useThing = ({ items }: { items: string[] }) => {
  const { setThing } = useStore();
  const list = useList({ items });

  const handle = useCallback(async () => {
    if (!list) {
      return;
    }
    const only = list.length === 1;
    await setThing({ only });
  }, [list?.length, setThing]);

  useEffect(() => {
    handle();
  }, []);

  return handle;
};
`;

  it('withholds the conversion that would strand the hoisted useMemo', () => {
    expect(unusedVarsIn(lengthDependency)).toHaveLength(0);

    const { output, messages } = createLinter().verifyAndFix(
      lengthDependency,
      bothRules,
      'useThing.ts',
    );

    // The sibling's hoist lands, so the hazard is really staged.
    expect(output).toContain('const listHash = useMemo');
    expect(output).toContain('[listHash, setThing]');
    expect(unusedVarsIn(output)).toHaveLength(0);

    // The violation still stands; only its fix is withheld.
    expect(messages.length).toBeGreaterThan(0);
    expect(
      messages.every(
        (message) => message.ruleId === 'test/use-latest-callback',
      ),
    ).toBe(true);
    expect(messages.some((message) => message.fix)).toBe(false);
  });

  it('converts normally when the sibling rule hoists nothing', () => {
    const plainDependency = `import { useCallback } from 'react';

export const useThing = ({ items }: { items: string[] }) => {
  const { setThing } = useStore();
  const list = useList({ items });

  const handle = useCallback(async () => {
    await setThing({ list });
  }, [list, setThing]);

  return handle;
};
`;

    const { output, messages } = createLinter().verifyAndFix(
      plainDependency,
      bothRules,
      'useThing.ts',
    );

    expect(output).toContain(
      "import useLatestCallback from 'use-latest-callback';",
    );
    expect(/\buseCallback\b/.test(output)).toBe(false);
    expect(unusedVarsIn(output)).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });
});
