import { Linter, Rule } from 'eslint';
import { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterJsx } from '../utils/ruleTester';
import { useLatestCallback } from '../rules/use-latest-callback';
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
    // useCallback with comments in import
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
import { useState } from 'react';

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
