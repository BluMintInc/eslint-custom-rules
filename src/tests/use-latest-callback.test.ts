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
      output: `
const A = (go) => {
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
