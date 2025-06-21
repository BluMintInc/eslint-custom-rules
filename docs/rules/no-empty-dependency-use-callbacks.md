# Enforce extracting useCallback with empty dependencies and useLatestCallback with static functions to utility functions (`@blumintinc/blumint/no-empty-dependency-use-callbacks`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

## Rule Details

This rule addresses the anti-pattern of using `useCallback` with zero dependencies (`[]`) or `useLatestCallback` with static functions when a utility function would be more appropriate. When `useCallback` has an empty dependency array, the callback function never changes between renders, making it functionally equivalent to a static utility function. Similarly, when `useLatestCallback` is used with a function that doesn't depend on component state or props, it provides no benefit over a static utility function. Both patterns still incur the overhead of the hook machinery and create unnecessary function references.

This rule is important for BluMint's codebase because it promotes better performance patterns and cleaner code organization. By encouraging developers to extract zero-dependency callbacks into utility functions, we reduce unnecessary hook overhead, improve code reusability, and make the component's actual dependencies clearer.

## Examples

### ❌ Incorrect

```tsx
const MyComponent = () => {
  const [count, setCount] = useState(0);

  // This useCallback has no dependencies - should be a utility function
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  }, []); // Empty dependency array

  // This useLatestCallback wraps a static function - should be a utility function
  const validateEmail = useLatestCallback((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }); // No component dependencies

  return (
    <div>
      <p>Count: {count}</p>
      <p>Price: {formatCurrency(29.99)}</p>
      <p>Valid email: {validateEmail('test@example.com') ? 'Yes' : 'No'}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};
```

### ✅ Correct

```tsx
// Extract to utility functions outside component
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const MyComponent = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <p>Price: {formatCurrency(29.99)}</p>
      <p>Valid email: {validateEmail('test@example.com') ? 'Yes' : 'No'}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};
```

```tsx
// Valid: useCallback with dependencies
const MyComponent = () => {
  const [count, setCount] = useState(0);
  const handleClick = useCallback(() => {
    setCount(count + 1);
  }, [count]);
  return <button onClick={handleClick}>Click</button>;
};
```

```tsx
// Valid: useCallback that returns JSX
const MyComponent = () => {
  const renderItem = useCallback((item) => {
    return <div key={item.id}>{item.name}</div>;
  }, []);
  return <List renderItem={renderItem} />;
};
```

```tsx
// Valid: useCallback that references component scope
const MyComponent = () => {
  const componentId = useId();
  const logEvent = useCallback((eventType) => {
    analytics.track(eventType, { componentId });
  }, []);
  return <button onClick={() => logEvent('click')}>Click</button>;
};
```

## Options

This rule accepts an options object with the following properties:

### `allowMemoizedComponents`

- Type: `boolean`
- Default: `false`

When `true`, allows `useCallback` with empty dependencies when the callback is passed to memoized components for performance optimization.

### `allowTestFiles`

- Type: `boolean`
- Default: `true`

When `true`, the rule is less strict in test files (files matching `*.test.ts`, `*.spec.ts`, or in `__tests__/` directories).

### `allowUseLatestCallback`

- Type: `boolean`
- Default: `true`

When `true`, allows `useLatestCallback` even with static functions, as it serves a specific purpose of always calling the latest version of a function.

## Config

```json
{
  "rules": {
    "@blumintinc/blumint/no-empty-dependency-use-callbacks": [
      "error",
      {
        "allowMemoizedComponents": false,
        "allowTestFiles": true,
        "allowUseLatestCallback": true
      }
    ]
  }
}
```
