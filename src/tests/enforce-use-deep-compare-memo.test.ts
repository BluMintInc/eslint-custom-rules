import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceUseDeepCompareMemo } from '../rules/enforce-use-deep-compare-memo';

ruleTesterJsx.run('enforce-use-deep-compare-memo', enforceUseDeepCompareMemo, {
  valid: [
    // Valid: Empty dependency array
    {
      code: `
        const Component = () => {
          const value = useMemo(() => ({ foo: 'bar' }), []);
          return <div>{value.foo}</div>;
        };
      `,
    },
    // Valid: Only primitives in dependency array (but this is actually invalid since count and name could be objects)
    // Removing this test case as it's not a good example
    // Valid: Already memoized dependencies (simplified test)
    {
      code: `
        const Component = () => {
          const memoizedConfig = useMemo(() => ({ foo: 'bar' }), []);
          const formattedData = useMemo(() => ({
            name: memoizedConfig.foo.toUpperCase(),
          }), [memoizedConfig]);
          return <div>{formattedData.name}</div>;
        };
      `,
    },
    // Valid: useCallback memoized function
    {
      code: `
        const Component = ({ onSubmit }) => {
          const handleSubmit = useCallback(onSubmit, [onSubmit]);
          const config = useMemo(() => ({ onSubmit: handleSubmit }), [handleSubmit]);
          return <form onSubmit={config.onSubmit} />;
        };
      `,
    },
    // Valid: useMemo returns JSX
    {
      code: `
        const Component = ({ config }) => {
          const element = useMemo(() => (
            <ExpensiveComponent config={config} />
          ), [config]);
          return element;
        };
      `,
    },
    // Valid: useMemo returns JSX fragment
    {
      code: `
        const Component = ({ items }) => {
          const elements = useMemo(() => (
            <>
              {items.map(item => <div key={item.id}>{item.name}</div>)}
            </>
          ), [items]);
          return elements;
        };
      `,
    },
    // Valid: useMemo with block statement returning JSX
    {
      code: `
        const Component = ({ config }) => {
          const element = useMemo(() => {
            return <ExpensiveComponent config={config} />;
          }, [config]);
          return element;
        };
      `,
    },
    // Valid: Primitive function calls
    {
      code: `
        const Component = ({ value }) => {
          const result = useMemo(() => ({
            stringValue: String(value),
            numberValue: Number(value),
          }), [String(value), Number(value)]);
          return <div>{result.stringValue}</div>;
        };
      `,
    },
    // Valid: Primitive method calls
    {
      code: `
        const Component = ({ text }) => {
          const result = useMemo(() => ({
            length: text.length,
            upper: text.toUpperCase(),
          }), [text.length, text.toUpperCase()]);
          return <div>{result.upper}</div>;
        };
      `,
    },
    // Valid: useState memoized value
    {
      code: `
        const Component = () => {
          const [state, setState] = useState({ foo: 'bar' });
          const derived = useMemo(() => ({
            processed: state.foo.toUpperCase(),
          }), [state]);
          return <div>{derived.processed}</div>;
        };
      `,
    },
    // Valid: useRef memoized value
    {
      code: `
        const Component = () => {
          const ref = useRef({ current: null });
          const value = useMemo(() => ({
            hasRef: !!ref.current,
          }), [ref]);
          return <div>{value.hasRef}</div>;
        };
      `,
    },
    // Valid: useReducer memoized value
    {
      code: `
        const Component = () => {
          const [state, dispatch] = useReducer(reducer, initialState);
          const derived = useMemo(() => ({
            count: state.count * 2,
          }), [state]);
          return <div>{derived.count}</div>;
        };
      `,
    },
    // Valid: Literal values only (simplified)
    {
      code: `
        const Component = () => {
          const value = useMemo(() => ({
            data: 'literal',
          }), [42, 'string', true]);
          return <div>{value.data}</div>;
        };
      `,
    },
    // Valid: Template literals
    {
      code: `
        const Component = ({ name }) => {
          const value = useMemo(() => ({
            greeting: \`Hello \${name}\`,
          }), [\`Hello \${name}\`]);
          return <div>{value.greeting}</div>;
        };
      `,
    },
    // Valid: Binary expressions with primitives
    {
      code: `
        const Component = ({ a, b }) => {
          const value = useMemo(() => ({
            sum: a + b,
          }), [a + b, a * b]);
          return <div>{value.sum}</div>;
        };
      `,
    },
    // Valid: Logical expressions with primitives
    {
      code: `
        const Component = ({ enabled, visible }) => {
          const value = useMemo(() => ({
            show: enabled && visible,
          }), [enabled && visible, enabled || visible]);
          return <div>{value.show}</div>;
        };
      `,
    },
    // Valid: Conditional expressions with primitives
    {
      code: `
        const Component = ({ count }) => {
          const value = useMemo(() => ({
            label: count > 0 ? 'positive' : 'zero or negative',
          }), [count > 0 ? 'positive' : 'zero or negative']);
          return <div>{value.label}</div>;
        };
      `,
    },
    // Valid: typeof expressions
    {
      code: `
        const Component = ({ value }) => {
          const result = useMemo(() => ({
            type: typeof value,
          }), [typeof value]);
          return <div>{result.type}</div>;
        };
      `,
    },
    // Valid: Unary expressions
    {
      code: `
        const Component = ({ count }) => {
          const result = useMemo(() => ({
            negative: -count,
          }), [-count, +count, !count]);
          return <div>{result.negative}</div>;
        };
      `,
    },
  ],
  invalid: [
    // Invalid: Object in dependency array
    {
      code: `
        const Component = ({ userConfig }) => {
          const formattedData = useMemo(() => ({
            name: userConfig.name.toUpperCase(),
          }), [userConfig]);
          return <div>{formattedData.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ userConfig }) => {
          const formattedData = useDeepCompareMemo(() => ({
            name: userConfig.name.toUpperCase(),
          }), [userConfig]);
          return <div>{formattedData.name}</div>;
        };
      `,
    },
    // Invalid: Array in dependency array
    {
      code: `
        const Component = ({ items }) => {
          const processedItems = useMemo(() =>
            items.map(item => item.name.toUpperCase())
          , [items]);
          return <div>{processedItems.join(', ')}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const processedItems = useDeepCompareMemo(() =>
            items.map(item => item.name.toUpperCase()), [items]);
          return <div>{processedItems.join(', ')}</div>;
        };
      `,
    },
    // Invalid: Function in dependency array
    {
      code: `
        const Component = ({ onSubmit }) => {
          const config = useMemo(() => ({
            handler: onSubmit,
          }), [onSubmit]);
          return <form onSubmit={config.handler} />;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ onSubmit }) => {
          const config = useDeepCompareMemo(() => ({
            handler: onSubmit,
          }), [onSubmit]);
          return <form onSubmit={config.handler} />;
        };
      `,
    },
    // Invalid: Object expression in dependency array
    {
      code: `
        const Component = () => {
          const config = { foo: 'bar' };
          const result = useMemo(() => ({
            processed: config.foo.toUpperCase(),
          }), [{ foo: 'bar' }]);
          return <div>{result.processed}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = () => {
          const config = { foo: 'bar' };
          const result = useDeepCompareMemo(() => ({
            processed: config.foo.toUpperCase(),
          }), [{ foo: 'bar' }]);
          return <div>{result.processed}</div>;
        };
      `,
    },
    // Invalid: Array expression in dependency array
    {
      code: `
        const Component = () => {
          const result = useMemo(() => ({
            length: [1, 2, 3].length,
          }), [[1, 2, 3]]);
          return <div>{result.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = () => {
          const result = useDeepCompareMemo(() => ({
            length: [1, 2, 3].length,
          }), [[1, 2, 3]]);
          return <div>{result.length}</div>;
        };
      `,
    },
    // Invalid: Arrow function in dependency array
    {
      code: `
        const Component = () => {
          const handler = () => console.log('clicked');
          const config = useMemo(() => ({
            onClick: handler,
          }), [() => console.log('clicked')]);
          return <button onClick={config.onClick} />;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = () => {
          const handler = () => console.log('clicked');
          const config = useDeepCompareMemo(() => ({
            onClick: handler,
          }), [() => console.log('clicked')]);
          return <button onClick={config.onClick} />;
        };
      `,
    },
    // Invalid: Function expression in dependency array
    {
      code: `
        const Component = () => {
          const config = useMemo(() => ({
            handler: function() { console.log('clicked'); },
          }), [function() { console.log('clicked'); }]);
          return <button onClick={config.handler} />;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = () => {
          const config = useDeepCompareMemo(() => ({
            handler: function() { console.log('clicked'); },
          }), [function() { console.log('clicked'); }]);
          return <button onClick={config.handler} />;
        };
      `,
    },
    // Invalid: New expression in dependency array
    {
      code: `
        const Component = () => {
          const result = useMemo(() => ({
            date: new Date().toISOString(),
          }), [new Date()]);
          return <div>{result.date}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = () => {
          const result = useDeepCompareMemo(() => ({
            date: new Date().toISOString(),
          }), [new Date()]);
          return <div>{result.date}</div>;
        };
      `,
    },
    // Invalid: Member expression in dependency array
    {
      code: `
        const Component = ({ user }) => {
          const result = useMemo(() => ({
            name: user.profile.name,
          }), [user.profile]);
          return <div>{result.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ user }) => {
          const result = useDeepCompareMemo(() => ({
            name: user.profile.name,
          }), [user.profile]);
          return <div>{result.name}</div>;
        };
      `,
    },
    // Invalid: Function call returning non-primitive
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            filtered: data.filter(item => item.active),
          }), [data.filter(item => item.active)]);
          return <div>{result.filtered.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            filtered: data.filter(item => item.active),
          }), [data.filter(item => item.active)]);
          return <div>{result.filtered.length}</div>;
        };
      `,
    },
    // Invalid: Mixed primitives and non-primitives
    {
      code: `
        const Component = ({ count, config }) => {
          const result = useMemo(() => ({
            data: { count, ...config },
          }), [count, config]);
          return <div>{result.data.count}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ count, config }) => {
          const result = useDeepCompareMemo(() => ({
            data: { count, ...config },
          }), [count, config]);
          return <div>{result.data.count}</div>;
        };
      `,
    },
    // Invalid: Multiple non-primitive dependencies
    {
      code: `
        const Component = ({ user, settings }) => {
          const result = useMemo(() => ({
            profile: { ...user, ...settings },
          }), [user, settings]);
          return <div>{result.profile.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ user, settings }) => {
          const result = useDeepCompareMemo(() => ({
            profile: { ...user, ...settings },
          }), [user, settings]);
          return <div>{result.profile.name}</div>;
        };
      `,
    },
    // Invalid: useMemo with TypeScript generics
    {
      code: `
        const Component = ({ config }) => {
          const result = useMemo<{ processed: string }>(() => ({
            processed: config.value.toUpperCase(),
          }), [config]);
          return <div>{result.processed}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ config }) => {
          const result = useDeepCompareMemo<{ processed: string }>(() => ({
            processed: config.value.toUpperCase(),
          }), [config]);
          return <div>{result.processed}</div>;
        };
      `,
    },
    // Invalid: Complex object structure
    {
      code: `
        const Component = ({ userConfig }) => {
          const formattedData = useMemo(() => {
            return {
              name: userConfig.name.toUpperCase(),
              status: getStatusLabel(userConfig.status),
              lastActive: formatDate(userConfig.lastLogin)
            };
          }, [userConfig]);
          return <div>{formattedData.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ userConfig }) => {
          const formattedData = useDeepCompareMemo(() => {
            return {
              name: userConfig.name.toUpperCase(),
              status: getStatusLabel(userConfig.status),
              lastActive: formatDate(userConfig.lastLogin)
            };
          }, [userConfig]);
          return <div>{formattedData.name}</div>;
        };
      `,
    },
    // Invalid: Nested object access
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            value: data.nested.deep.value,
          }), [data.nested.deep]);
          return <div>{result.value}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            value: data.nested.deep.value,
          }), [data.nested.deep]);
          return <div>{result.value}</div>;
        };
      `,
    },
    // Invalid: Array method calls
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            mapped: items.map(x => x.id),
          }), [items.map(x => x.id)]);
          return <div>{result.mapped.join(',')}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            mapped: items.map(x => x.id),
          }), [items.map(x => x.id)]);
          return <div>{result.mapped.join(',')}</div>;
        };
      `,
    },
  ],
});
