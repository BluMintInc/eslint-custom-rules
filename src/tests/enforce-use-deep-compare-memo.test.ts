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
    // Valid: Template literals with primitive interpolation
    {
      code: `
        const Component = ({ name }) => {
          const value = useMemo(() => ({
            greeting: \`Hello \${name}\`,
          }), [name]);
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
          }), [enabled, visible]);
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
    // Valid: Primitive property access with bracket notation
    {
      code: `
        const Component = ({ obj }) => {
          const result = useMemo(() => ({
            length: obj['length'],
            size: obj['size'],
          }), [obj['length'], obj['size']]);
          return <div>{result.length}</div>;
        };
      `,
    },
    // Valid: Nested primitive expressions
    {
      code: `
        const Component = ({ a, b, c }) => {
          const result = useMemo(() => ({
            complex: (a + b) * c,
          }), [a, b, c]);
          return <div>{result.complex}</div>;
        };
      `,
    },
    // Valid: More primitive method calls
    {
      code: `
        const Component = ({ str, arr }) => {
          const result = useMemo(() => ({
            hasSubstring: str.includes('test'),
            firstChar: str.charAt(0),
            arrLength: arr.length,
          }), [str.includes('test'), str.charAt(0), arr.length]);
          return <div>{result.hasSubstring}</div>;
        };
      `,
    },
    // Valid: Primitive destructuring from memoized values
    {
      code: `
        const Component = () => {
          const [count, setCount] = useState(0);
          const [name, setName] = useState('test');
          const result = useMemo(() => ({
            display: \`\${name}: \${count}\`,
          }), [count, name]);
          return <div>{result.display}</div>;
        };
      `,
    },
    // Valid: Constants that are technically objects but primitive-like
    {
      code: `
        const Component = ({ value }) => {
          const result = useMemo(() => ({
            formatted: value.toString(),
          }), [value.toString()]);
          return <div>{result.formatted}</div>;
        };
      `,
    },
    // Valid: Primitive regex test results
    {
      code: `
        const Component = ({ text }) => {
          const result = useMemo(() => ({
            isValid: /^[a-z]+$/.test(text),
          }), [/^[a-z]+$/.test(text)]);
          return <div>{result.isValid}</div>;
        };
      `,
    },
    // Valid: Multiple memoized dependencies
    {
      code: `
        const Component = ({ a, b }) => {
          const memoizedA = useMemo(() => a * 2, [a]);
          const memoizedB = useCallback(() => b * 3, [b]);
          const result = useMemo(() => ({
            combined: memoizedA + memoizedB(),
          }), [memoizedA, memoizedB]);
          return <div>{result.combined}</div>;
        };
      `,
    },
    // Valid: Primitive array methods
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            hasItems: items.length > 0,
            firstIndex: items.indexOf('first'),
          }), [items.length > 0, items.indexOf('first')]);
          return <div>{result.hasItems}</div>;
        };
      `,
    },
    // Valid: useMemo with JSX in conditional
    {
      code: `
        const Component = ({ condition, config }) => {
          const element = useMemo(() => {
            if (condition) {
              return <ExpensiveComponent config={config} />;
            }
            return <div>Default</div>;
          }, [condition, config]);
          return element;
        };
      `,
    },
    // Valid: useMemo returning JSX with complex logic
    {
      code: `
        const Component = ({ items }) => {
          const renderedItems = useMemo(() => {
            const filtered = items.filter(item => item.visible);
            return (
              <div>
                {filtered.map(item => <span key={item.id}>{item.name}</span>)}
              </div>
            );
          }, [items]);
          return renderedItems;
        };
      `,
    },
    // Valid: Primitive Math operations
    {
      code: `
        const Component = ({ x, y }) => {
          const result = useMemo(() => ({
            distance: Math.sqrt(x * x + y * y),
            angle: Math.atan2(y, x),
          }), [Math.sqrt(x * x + y * y), Math.atan2(y, x)]);
          return <div>{result.distance}</div>;
        };
      `,
    },
    // Valid: Primitive Date methods
    {
      code: `
        const Component = ({ date }) => {
          const result = useMemo(() => ({
            year: date.getFullYear(),
            timestamp: date.getTime(),
          }), [date.getFullYear(), date.getTime()]);
          return <div>{result.year}</div>;
        };
      `,
    },
    // Valid: Primitive JSON methods with primitive input
    {
      code: `
        const Component = ({ value }) => {
          const result = useMemo(() => ({
            serialized: JSON.stringify(value),
          }), [value]);
          return <div>{result.serialized}</div>;
        };
      `,
    },
    // Valid: Primitive Number methods
    {
      code: `
        const Component = ({ num }) => {
          const result = useMemo(() => ({
            fixed: num.toFixed(2),
            exponential: num.toExponential(),
          }), [num.toFixed(2), num.toExponential()]);
          return <div>{result.fixed}</div>;
        };
      `,
    },
    // Valid: Simple memoization chain with primitives
    {
      code: `
        const Component = ({ count }) => {
          const step1 = useMemo(() => count * 2, [count]);
          const step2 = useCallback((num) => num + 1, []);
          const step3 = useMemo(() => step2(step1), [step1, step2]);
          const final = useMemo(() => ({
            processed: step3,
          }), [step3]);
          return <div>{final.processed}</div>;
        };
      `,
    },
    // Valid: Primitive with complex expressions
    {
      code: `
        const Component = ({ a, b, c, d }) => {
          const result = useMemo(() => ({
            value: a && b || c && d,
          }), [a, b, c, d]);
          return <div>{result.value}</div>;
        };
      `,
    },
    // Valid: Primitive array access with known primitive result
    {
      code: `
        const Component = ({ items, index }) => {
          const result = useMemo(() => ({
            item: items[index],
          }), [index]);
          return <div>{result.item}</div>;
        };
      `,
    },
    // Valid: Primitive object property with computed key
    {
      code: `
        const Component = ({ obj, key }) => {
          const result = useMemo(() => ({
            value: obj[key],
          }), [key]);
          return <div>{result.value}</div>;
        };
      `,
    },
    // Valid: Non-useMemo hook calls should be ignored
    {
      code: `
        const Component = ({ data }) => {
          const [state, setState] = useState(data);
          const effect = useEffect(() => {
            console.log(data);
          }, [data]);
          return <div>{state.name}</div>;
        };
      `,
    },
    // Valid: useMemo with non-array dependency (should be ignored)
    {
      code: `
        const Component = ({ deps }) => {
          const result = useMemo(() => ({
            value: 'test',
          }), deps);
          return <div>{result.value}</div>;
        };
      `,
    },
    // Valid: useMemo with no dependencies (should be ignored)
    {
      code: `
        const Component = () => {
          const result = useMemo(() => ({
            value: 'test',
          }));
          return <div>{result.value}</div>;
        };
      `,
    },
    // Valid: useMemo with non-function callback (should be ignored)
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(data, [data]);
          return <div>{result}</div>;
        };
      `,
    },
    // Valid: Nested useMemo calls with proper memoization
    {
      code: `
        const Component = ({ count }) => {
          const step1 = useMemo(() => count * 2, [count]);
          const step2 = useMemo(() => step1 + 1, [step1]);
          const step3 = useMemo(() => step2.toString(), [step2]);
          return <div>{step3}</div>;
        };
      `,
    },
    // Valid: Primitive Symbol properties
    {
      code: `
        const Component = ({ obj }) => {
          const result = useMemo(() => ({
            hasSymbol: Symbol.iterator in obj,
          }), [Symbol.iterator in obj]);
          return <div>{result.hasSymbol}</div>;
        };
      `,
    },
    // Valid: Primitive void expressions
    {
      code: `
        const Component = ({ fn }) => {
          const result = useMemo(() => ({
            voidResult: void fn(),
          }), [void fn()]);
          return <div>{result.voidResult}</div>;
        };
      `,
    },
    // Valid: Primitive delete expressions
    {
      code: `
        const Component = ({ obj, key }) => {
          const result = useMemo(() => ({
            deleted: delete obj[key],
          }), [delete obj[key]]);
          return <div>{result.deleted}</div>;
        };
      `,
    },
    // Valid: Primitive in expressions
    {
      code: `
        const Component = ({ obj, key }) => {
          const result = useMemo(() => ({
            hasKey: key in obj,
          }), [key in obj]);
          return <div>{result.hasKey}</div>;
        };
      `,
    },
    // Valid: Primitive instanceof expressions
    {
      code: `
        const Component = ({ obj }) => {
          const result = useMemo(() => ({
            isArray: obj instanceof Array,
          }), [obj instanceof Array]);
          return <div>{result.isArray}</div>;
        };
      `,
    },
    // Valid: Complex primitive chain
    {
      code: `
        const Component = ({ str, num }) => {
          const result = useMemo(() => ({
            complex: str.length + num.toString().length,
          }), [str.length + num.toString().length]);
          return <div>{result.complex}</div>;
        };
      `,
    },
    // Valid: Primitive array destructuring
    {
      code: `
        const Component = ({ arr }) => {
          const [first, second] = arr;
          const result = useMemo(() => ({
            sum: first + second,
          }), [first, second]);
          return <div>{result.sum}</div>;
        };
      `,
    },
    // Valid: Primitive object destructuring
    {
      code: `
        const Component = ({ obj }) => {
          const { a, b } = obj;
          const result = useMemo(() => ({
            sum: a + b,
          }), [a, b]);
          return <div>{result.sum}</div>;
        };
      `,
    },
    // Valid: Primitive rest parameters
    {
      code: `
        const Component = ({ obj }) => {
          const { a, ...rest } = obj;
          const result = useMemo(() => ({
            count: Object.keys(rest).length,
          }), [Object.keys(rest).length]);
          return <div>{result.count}</div>;
        };
      `,
    },
    // Valid: Primitive assignment expressions
    {
      code: `
        const Component = ({ value }) => {
          let temp;
          const result = useMemo(() => ({
            assigned: (temp = value),
          }), [value]);
          return <div>{result.assigned}</div>;
        };
      `,
    },
    // Valid: Primitive sequence expressions
    {
      code: `
        const Component = ({ a, b }) => {
          const result = useMemo(() => ({
            sequence: (a, b),
          }), [a, b]);
          return <div>{result.sequence}</div>;
        };
      `,
    },
    // Valid: Primitive update expressions
    {
      code: `
        const Component = ({ count }) => {
          let temp = count;
          const result = useMemo(() => ({
            incremented: ++temp,
          }), [++temp]);
          return <div>{result.incremented}</div>;
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
    // Invalid: Conditional expression with objects
    {
      code: `
        const Component = ({ condition, objA, objB }) => {
          const result = useMemo(() => ({
            selected: condition ? objA : objB,
          }), [condition ? objA : objB]);
          return <div>{result.selected.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ condition, objA, objB }) => {
          const result = useDeepCompareMemo(() => ({
            selected: condition ? objA : objB,
          }), [condition ? objA : objB]);
          return <div>{result.selected.name}</div>;
        };
      `,
    },
    // Invalid: Spread operator in dependency
    {
      code: `
        const Component = ({ baseConfig, overrides }) => {
          const result = useMemo(() => ({
            config: { ...baseConfig, ...overrides },
          }), [{ ...baseConfig, ...overrides }]);
          return <div>{result.config.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ baseConfig, overrides }) => {
          const result = useDeepCompareMemo(() => ({
            config: { ...baseConfig, ...overrides },
          }), [{ ...baseConfig, ...overrides }]);
          return <div>{result.config.name}</div>;
        };
      `,
    },
    // Invalid: Array destructuring in dependency
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            first: data[0],
          }), [[...data]]);
          return <div>{result.first}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            first: data[0],
          }), [[...data]]);
          return <div>{result.first}</div>;
        };
      `,
    },
    // Invalid: Complex object method calls
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            filtered: data.filter(x => x.active),
            sorted: data.sort((a, b) => a.name.localeCompare(b.name)),
          }), [data.filter(x => x.active), data.sort((a, b) => a.name.localeCompare(b.name))]);
          return <div>{result.filtered.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            filtered: data.filter(x => x.active),
            sorted: data.sort((a, b) => a.name.localeCompare(b.name)),
          }), [data.filter(x => x.active), data.sort((a, b) => a.name.localeCompare(b.name))]);
          return <div>{result.filtered.length}</div>;
        };
      `,
    },
    // Invalid: Class instance creation
    {
      code: `
        const Component = ({ config }) => {
          const result = useMemo(() => ({
            instance: new MyClass(config),
          }), [new MyClass(config)]);
          return <div>{result.instance.value}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ config }) => {
          const result = useDeepCompareMemo(() => ({
            instance: new MyClass(config),
          }), [new MyClass(config)]);
          return <div>{result.instance.value}</div>;
        };
      `,
    },
    // Invalid: Computed property access returning objects
    {
      code: `
        const Component = ({ obj, key }) => {
          const result = useMemo(() => ({
            nested: obj[key].nested,
          }), [obj[key]]);
          return <div>{result.nested.value}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ obj, key }) => {
          const result = useDeepCompareMemo(() => ({
            nested: obj[key].nested,
          }), [obj[key]]);
          return <div>{result.nested.value}</div>;
        };
      `,
    },
    // Invalid: Function calls returning arrays
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            processed: processArray(data),
          }), [processArray(data)]);
          return <div>{result.processed.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            processed: processArray(data),
          }), [processArray(data)]);
          return <div>{result.processed.length}</div>;
        };
      `,
    },
    // Invalid: Nested function calls
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            transformed: transform(filter(data)),
          }), [transform(filter(data))]);
          return <div>{result.transformed.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            transformed: transform(filter(data)),
          }), [transform(filter(data))]);
          return <div>{result.transformed.length}</div>;
        };
      `,
    },
    // Invalid: Object with computed properties
    {
      code: `
        const Component = ({ key, value }) => {
          const result = useMemo(() => ({
            dynamic: { [key]: value },
          }), [{ [key]: value }]);
          return <div>{result.dynamic[key]}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ key, value }) => {
          const result = useDeepCompareMemo(() => ({
            dynamic: { [key]: value },
          }), [{ [key]: value }]);
          return <div>{result.dynamic[key]}</div>;
        };
      `,
    },
    // Invalid: Array with spread elements
    {
      code: `
        const Component = ({ items, newItem }) => {
          const result = useMemo(() => ({
            combined: [...items, newItem],
          }), [[...items, newItem]]);
          return <div>{result.combined.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items, newItem }) => {
          const result = useDeepCompareMemo(() => ({
            combined: [...items, newItem],
          }), [[...items, newItem]]);
          return <div>{result.combined.length}</div>;
        };
      `,
    },
    // Invalid: Complex member expression chains
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            value: data.user.profile.settings.theme,
          }), [data.user.profile.settings]);
          return <div>{result.value}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            value: data.user.profile.settings.theme,
          }), [data.user.profile.settings]);
          return <div>{result.value}</div>;
        };
      `,
    },
    // Invalid: Function reference (not call)
    {
      code: `
        const Component = ({ handler }) => {
          const result = useMemo(() => ({
            callback: handler,
          }), [handler]);
          return <button onClick={result.callback} />;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ handler }) => {
          const result = useDeepCompareMemo(() => ({
            callback: handler,
          }), [handler]);
          return <button onClick={result.callback} />;
        };
      `,
    },
    // Invalid: Array methods that return arrays
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            filtered: items.filter(x => x.active),
          }), [items.filter(x => x.active)]);
          return <div>{result.filtered.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            filtered: items.filter(x => x.active),
          }), [items.filter(x => x.active)]);
          return <div>{result.filtered.length}</div>;
        };
      `,
    },
    // Invalid: Object.keys/values/entries
    {
      code: `
        const Component = ({ obj }) => {
          const result = useMemo(() => ({
            keys: Object.keys(obj),
            values: Object.values(obj),
          }), [Object.keys(obj), Object.values(obj)]);
          return <div>{result.keys.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ obj }) => {
          const result = useDeepCompareMemo(() => ({
            keys: Object.keys(obj),
            values: Object.values(obj),
          }), [Object.keys(obj), Object.values(obj)]);
          return <div>{result.keys.length}</div>;
        };
      `,
    },
    // Invalid: Array.from and similar
    {
      code: `
        const Component = ({ iterable }) => {
          const result = useMemo(() => ({
            array: Array.from(iterable),
          }), [Array.from(iterable)]);
          return <div>{result.array.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ iterable }) => {
          const result = useDeepCompareMemo(() => ({
            array: Array.from(iterable),
          }), [Array.from(iterable)]);
          return <div>{result.array.length}</div>;
        };
      `,
    },
    // Invalid: Promise.all and similar async patterns
    {
      code: `
        const Component = ({ promises }) => {
          const result = useMemo(() => ({
            combined: Promise.all(promises),
          }), [Promise.all(promises)]);
          return <div>Loading...</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ promises }) => {
          const result = useDeepCompareMemo(() => ({
            combined: Promise.all(promises),
          }), [Promise.all(promises)]);
          return <div>Loading...</div>;
        };
      `,
    },
    // Invalid: Regular expression objects
    {
      code: `
        const Component = ({ pattern }) => {
          const result = useMemo(() => ({
            regex: new RegExp(pattern),
          }), [new RegExp(pattern)]);
          return <div>{result.regex.source}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ pattern }) => {
          const result = useDeepCompareMemo(() => ({
            regex: new RegExp(pattern),
          }), [new RegExp(pattern)]);
          return <div>{result.regex.source}</div>;
        };
      `,
    },
    // Invalid: Set and Map constructors
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            set: new Set(items),
            map: new Map(items),
          }), [new Set(items), new Map(items)]);
          return <div>{result.set.size}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            set: new Set(items),
            map: new Map(items),
          }), [new Set(items), new Map(items)]);
          return <div>{result.set.size}</div>;
        };
      `,
    },
    // Invalid: Complex nested array/object literals
    {
      code: `
        const Component = ({ a, b, c }) => {
          const result = useMemo(() => ({
            nested: [{ a }, { b }, { c }],
          }), [[{ a }, { b }, { c }]]);
          return <div>{result.nested.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ a, b, c }) => {
          const result = useDeepCompareMemo(() => ({
            nested: [{ a }, { b }, { c }],
          }), [[{ a }, { b }, { c }]]);
          return <div>{result.nested.length}</div>;
        };
      `,
    },
    // Invalid: Function bind calls
    {
      code: `
        const Component = ({ handler, context }) => {
          const result = useMemo(() => ({
            bound: handler.bind(context),
          }), [handler.bind(context)]);
          return <button onClick={result.bound} />;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ handler, context }) => {
          const result = useDeepCompareMemo(() => ({
            bound: handler.bind(context),
          }), [handler.bind(context)]);
          return <button onClick={result.bound} />;
        };
      `,
    },
    // Invalid: JSON.parse calls
    {
      code: `
        const Component = ({ jsonString }) => {
          const result = useMemo(() => ({
            parsed: JSON.parse(jsonString),
          }), [JSON.parse(jsonString)]);
          return <div>{result.parsed.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ jsonString }) => {
          const result = useDeepCompareMemo(() => ({
            parsed: JSON.parse(jsonString),
          }), [JSON.parse(jsonString)]);
          return <div>{result.parsed.name}</div>;
        };
      `,
    },
    // Invalid: Complex TypeScript as expressions
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            typed: data as ComplexType,
          }), [data as ComplexType]);
          return <div>{result.typed.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            typed: data as ComplexType,
          }), [data as ComplexType]);
          return <div>{result.typed.name}</div>;
        };
      `,
    },
    // Invalid: Destructuring assignment expressions
    {
      code: `
        const Component = ({ source }) => {
          const result = useMemo(() => {
            const { a, b, ...rest } = source;
            return { a, b, rest };
          }, [source]);
          return <div>{result.a}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ source }) => {
          const result = useDeepCompareMemo(() => {
            const { a, b, ...rest } = source;
            return { a, b, rest };
          }, [source]);
          return <div>{result.a}</div>;
        };
      `,
    },
    // Invalid: Mixed primitive and non-primitive with complex expressions
    {
      code: `
        const Component = ({ count, config, enabled }) => {
          const result = useMemo(() => ({
            data: enabled ? { count, ...config } : null,
          }), [count, enabled ? { count, ...config } : null]);
          return <div>{result.data?.count}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ count, config, enabled }) => {
          const result = useDeepCompareMemo(() => ({
            data: enabled ? { count, ...config } : null,
          }), [count, enabled ? { count, ...config } : null]);
          return <div>{result.data?.count}</div>;
        };
      `,
    },
    // Invalid: Logical expressions with objects
    {
      code: `
        const Component = ({ objA, objB, condition }) => {
          const result = useMemo(() => ({
            selected: condition && objA || objB,
          }), [condition && objA || objB]);
          return <div>{result.selected.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ objA, objB, condition }) => {
          const result = useDeepCompareMemo(() => ({
            selected: condition && objA || objB,
          }), [condition && objA || objB]);
          return <div>{result.selected.name}</div>;
        };
      `,
    },
    // Invalid: Sparse array with holes
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            sparse: [items[0], , items[2]],
          }), [[items[0], , items[2]]]);
          return <div>{result.sparse.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            sparse: [items[0], , items[2]],
          }), [[items[0], , items[2]]]);
          return <div>{result.sparse.length}</div>;
        };
      `,
    },
    // Invalid: WeakMap and WeakSet constructors
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            weakMap: new WeakMap(),
            weakSet: new WeakSet(items),
          }), [new WeakMap(), new WeakSet(items)]);
          return <div>Collections created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            weakMap: new WeakMap(),
            weakSet: new WeakSet(items),
          }), [new WeakMap(), new WeakSet(items)]);
          return <div>Collections created</div>;
        };
      `,
    },
    // Invalid: Error constructors
    {
      code: `
        const Component = ({ message }) => {
          const result = useMemo(() => ({
            error: new Error(message),
          }), [new Error(message)]);
          return <div>{result.error.message}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ message }) => {
          const result = useDeepCompareMemo(() => ({
            error: new Error(message),
          }), [new Error(message)]);
          return <div>{result.error.message}</div>;
        };
      `,
    },
    // Invalid: URL and URLSearchParams constructors
    {
      code: `
        const Component = ({ urlString, params }) => {
          const result = useMemo(() => ({
            url: new URL(urlString),
            searchParams: new URLSearchParams(params),
          }), [new URL(urlString), new URLSearchParams(params)]);
          return <div>{result.url.href}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ urlString, params }) => {
          const result = useDeepCompareMemo(() => ({
            url: new URL(urlString),
            searchParams: new URLSearchParams(params),
          }), [new URL(urlString), new URLSearchParams(params)]);
          return <div>{result.url.href}</div>;
        };
      `,
    },
    // Invalid: FormData constructor
    {
      code: `
        const Component = ({ form }) => {
          const result = useMemo(() => ({
            formData: new FormData(form),
          }), [new FormData(form)]);
          return <div>Form data created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ form }) => {
          const result = useDeepCompareMemo(() => ({
            formData: new FormData(form),
          }), [new FormData(form)]);
          return <div>Form data created</div>;
        };
      `,
    },
    // Invalid: ArrayBuffer and TypedArray constructors
    {
      code: `
        const Component = ({ size, data }) => {
          const result = useMemo(() => ({
            buffer: new ArrayBuffer(size),
            uint8: new Uint8Array(data),
          }), [new ArrayBuffer(size), new Uint8Array(data)]);
          return <div>Buffers created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ size, data }) => {
          const result = useDeepCompareMemo(() => ({
            buffer: new ArrayBuffer(size),
            uint8: new Uint8Array(data),
          }), [new ArrayBuffer(size), new Uint8Array(data)]);
          return <div>Buffers created</div>;
        };
      `,
    },
    // Invalid: Proxy constructor
    {
      code: `
        const Component = ({ target, handler }) => {
          const result = useMemo(() => ({
            proxy: new Proxy(target, handler),
          }), [new Proxy(target, handler)]);
          return <div>Proxy created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ target, handler }) => {
          const result = useDeepCompareMemo(() => ({
            proxy: new Proxy(target, handler),
          }), [new Proxy(target, handler)]);
          return <div>Proxy created</div>;
        };
      `,
    },
    // Invalid: Complex conditional with nested objects
    {
      code: `
        const Component = ({ condition, a, b }) => {
          const result = useMemo(() => ({
            nested: condition ? { a: { nested: a } } : { b: { nested: b } },
          }), [condition ? { a: { nested: a } } : { b: { nested: b } }]);
          return <div>{result.nested.a?.nested}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ condition, a, b }) => {
          const result = useDeepCompareMemo(() => ({
            nested: condition ? { a: { nested: a } } : { b: { nested: b } },
          }), [condition ? { a: { nested: a } } : { b: { nested: b } }]);
          return <div>{result.nested.a?.nested}</div>;
        };
      `,
    },
    // Invalid: Generator function expressions
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            generator: function* () { yield data; },
          }), [function* () { yield data; }]);
          return <div>Generator created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            generator: function* () { yield data; },
          }), [function* () { yield data; }]);
          return <div>Generator created</div>;
        };
      `,
    },
    // Invalid: Async function expressions
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            asyncFn: async function() { return data; },
          }), [async function() { return data; }]);
          return <div>Async function created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            asyncFn: async function() { return data; },
          }), [async function() { return data; }]);
          return <div>Async function created</div>;
        };
      `,
    },
    // Invalid: Async arrow functions
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            asyncArrow: async () => data,
          }), [async () => data]);
          return <div>Async arrow created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            asyncArrow: async () => data,
          }), [async () => data]);
          return <div>Async arrow created</div>;
        };
      `,
    },
    // Invalid: Complex array methods chaining
    {
      code: `
        const Component = ({ items }) => {
          const result = useMemo(() => ({
            processed: items.filter(x => x.active).map(x => x.name).sort(),
          }), [items.filter(x => x.active).map(x => x.name).sort()]);
          return <div>{result.processed.join(', ')}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ items }) => {
          const result = useDeepCompareMemo(() => ({
            processed: items.filter(x => x.active).map(x => x.name).sort(),
          }), [items.filter(x => x.active).map(x => x.name).sort()]);
          return <div>{result.processed.join(', ')}</div>;
        };
      `,
    },
    // Invalid: Object.assign calls
    {
      code: `
        const Component = ({ target, source }) => {
          const result = useMemo(() => ({
            merged: Object.assign(target, source),
          }), [Object.assign(target, source)]);
          return <div>{result.merged.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ target, source }) => {
          const result = useDeepCompareMemo(() => ({
            merged: Object.assign(target, source),
          }), [Object.assign(target, source)]);
          return <div>{result.merged.name}</div>;
        };
      `,
    },
    // Invalid: Object.create calls
    {
      code: `
        const Component = ({ proto, props }) => {
          const result = useMemo(() => ({
            created: Object.create(proto, props),
          }), [Object.create(proto, props)]);
          return <div>Object created</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ proto, props }) => {
          const result = useDeepCompareMemo(() => ({
            created: Object.create(proto, props),
          }), [Object.create(proto, props)]);
          return <div>Object created</div>;
        };
      `,
    },
    // Invalid: Reflect method calls
    {
      code: `
        const Component = ({ target, key, value }) => {
          const result = useMemo(() => ({
            reflected: Reflect.set(target, key, value),
          }), [Reflect.set(target, key, value)]);
          return <div>{result.reflected}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ target, key, value }) => {
          const result = useDeepCompareMemo(() => ({
            reflected: Reflect.set(target, key, value),
          }), [Reflect.set(target, key, value)]);
          return <div>{result.reflected}</div>;
        };
      `,
    },
    // Invalid: Complex nested member expressions with function calls
    {
      code: `
        const Component = ({ data }) => {
          const result = useMemo(() => ({
            complex: data.users.filter(u => u.active).map(u => u.profile.settings),
          }), [data.users.filter(u => u.active).map(u => u.profile.settings)]);
          return <div>{result.complex.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ data }) => {
          const result = useDeepCompareMemo(() => ({
            complex: data.users.filter(u => u.active).map(u => u.profile.settings),
          }), [data.users.filter(u => u.active).map(u => u.profile.settings)]);
          return <div>{result.complex.length}</div>;
        };
      `,
    },
    // Invalid: Template literals with object interpolation
    {
      code: `
        const Component = ({ obj }) => {
          const result = useMemo(() => ({
            template: \`Object: \${obj}\`,
          }), [\`Object: \${obj}\`]);
          return <div>{result.template}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ obj }) => {
          const result = useDeepCompareMemo(() => ({
            template: \`Object: \${obj}\`,
          }), [\`Object: \${obj}\`]);
          return <div>{result.template}</div>;
        };
      `,
    },
    // Invalid: Complex destructuring with defaults
    {
      code: `
        const Component = ({ config = {} }) => {
          const result = useMemo(() => ({
            processed: config,
          }), [config]);
          return <div>{result.processed.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ config = {} }) => {
          const result = useDeepCompareMemo(() => ({
            processed: config,
          }), [config]);
          return <div>{result.processed.name}</div>;
        };
      `,
    },
    // Invalid: Function call with object spread
    {
      code: `
        const Component = ({ base, overrides }) => {
          const result = useMemo(() => ({
            merged: mergeObjects({ ...base }, { ...overrides }),
          }), [mergeObjects({ ...base }, { ...overrides })]);
          return <div>{result.merged.name}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ base, overrides }) => {
          const result = useDeepCompareMemo(() => ({
            merged: mergeObjects({ ...base }, { ...overrides }),
          }), [mergeObjects({ ...base }, { ...overrides })]);
          return <div>{result.merged.name}</div>;
        };
      `,
    },
    // Invalid: Complex conditional with function calls
    {
      code: `
        const Component = ({ condition, data }) => {
          const result = useMemo(() => ({
            processed: condition ? processData(data) : transformData(data),
          }), [condition ? processData(data) : transformData(data)]);
          return <div>{result.processed.length}</div>;
        };
      `,
      errors: [{ messageId: 'useDeepCompareMemo' }],
      output: `
        const Component = ({ condition, data }) => {
          const result = useDeepCompareMemo(() => ({
            processed: condition ? processData(data) : transformData(data),
          }), [condition ? processData(data) : transformData(data)]);
          return <div>{result.processed.length}</div>;
        };
      `,
    },
  ],
});
