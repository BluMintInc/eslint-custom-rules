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
        }, []);
        return <button onClick={handleClick}>Click me</button>;
      }`,
      errors: [{ messageId: 'useLatestCallback' }],
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
    // Edge case: useCallback returning JSX (should be replaced at the import level)
    {
      code: `import { useCallback } from 'react';

      function MyComponent({ items }) {
        const renderItem = useCallback((item) => <div key={item.id}>{item.name}</div>, []);
        return <div>{items.map(renderItem)}</div>;
      }`,
      output: `import useLatestCallback from 'use-latest-callback';


      function MyComponent({ items }) {
        const renderItem = useCallback((item) => <div key={item.id}>{item.name}</div>, []);
        return <div>{items.map(renderItem)}</div>;
      }`,
      errors: [{ messageId: 'useLatestCallback' }],
    },
    // Edge case: useCallback with block body returning JSX (should be replaced at the import level)
    {
      code: `import { useCallback } from 'react';

      function MyComponent({ items }) {
        const renderItem = useCallback((item) => {
          return <div key={item.id}>{item.name}</div>;
        }, []);
        return <div>{items.map(renderItem)}</div>;
      }`,
      output: `import useLatestCallback from 'use-latest-callback';


      function MyComponent({ items }) {
        const renderItem = useCallback((item) => {
          return <div key={item.id}>{item.name}</div>;
        }, []);
        return <div>{items.map(renderItem)}</div>;
      }`,
      errors: [{ messageId: 'useLatestCallback' }],
    },
  ],
});
