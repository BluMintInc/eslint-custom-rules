import { ruleTesterJsx } from '../utils/ruleTester';
import { useLatestCallback } from '../rules/use-latest-callback';

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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
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
      errors: [
        { messageId: 'useLatestCallback' },
        { messageId: 'useLatestCallback' },
      ],
    },
  ],
});
