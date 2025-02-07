import { ruleTesterTs } from '../utils/ruleTester';
import { scopesReadTopToBottom } from '../../src/rules/scopes-read-top-to-bottom';

ruleTesterTs.run('scopes-read-top-to-bottom', scopesReadTopToBottom, {
  valid: [
    // Basic variable ordering
    {
      code: `
        const a = 1;
        const b = a + 2;
      `,
    },
    // React hooks should maintain their order
    {
      code: `
        const [state, setState] = useState(null);
        const { id } = group || {};
      `,
    },
    // Destructuring with correct order
    {
      code: `
        const group = useGroupDoc();
        const { id } = group || {};
        const { groupTabState } = useGroupRouter();
      `,
    },
    // Side effects should prevent reordering
    {
      code: `
        let results = [];
        console.log('Processing started');
        for (const item of items) {
          results.push(processItem(item));
        }
      `,
    },
    // If statements with side effects
    {
      code: `
        const id = getId();
        let data;
        if (shouldFetch) {
          data = fetchData();
        }
      `,
    },
    // Multiple React hooks in correct order
    {
      code: `
        const [count, setCount] = useState(0);
        const [text, setText] = useState('');
        useEffect(() => {
          console.log(count);
        }, [count]);
        const value = count * 2;
      `,
    },
    // Nested object destructuring
    {
      code: `
        const response = await fetchData();
        const { data: { user: { name, id } } } = response;
        const formattedName = formatName(name);
      `,
    },
    // Early returns with hooks
    {
      code: `
        const [isLoading] = useState(false);
        if (isLoading) return null;
        const data = useQuery();
        return <div>{data}</div>;
      `,
    },
    // Complex conditional dependencies
    {
      code: `
        const condition = getCondition();
        const value = condition ? 'a' : 'b';
        const result = processValue(value);
      `,
    },
    // Function declarations with hooks
    {
      code: `
        const [state, setState] = useState(null);
        function handleClick() {
          setState(prev => !prev);
        }
        return <button onClick={handleClick}>{state}</button>;
      `,
    },
    // Array methods with callbacks
    {
      code: `
        const items = getItems();
        const processedItems = items.map(item => {
          return transform(item);
        });
        const filteredItems = processedItems.filter(Boolean);
      `,
    },
    // Async/await patterns
    {
      code: `
        const user = await getUser();
        const permissions = await getPermissions(user.id);
        const isAdmin = checkPermissions(permissions);
      `,
    },
    // Multiple hooks with dependencies
    {
      code: `
        const [count] = useState(0);
        const doubleCount = useMemo(() => count * 2, [count]);
        const tripleCount = useMemo(() => doubleCount * 1.5, [doubleCount]);
      `,
    },
    // Complex object initialization
    {
      code: `
        const baseConfig = getConfig();
        const extendedConfig = {
          ...baseConfig,
          additional: true,
        };
        const instance = new Service(extendedConfig);
      `,
    },
    // Try-catch blocks
    {
      code: `
        const config = getConfig();
        try {
          const result = riskyOperation(config);
          console.log(result);
        } catch (error) {
          handleError(error);
        }
      `,
    },
  ],
  invalid: [
    // Basic out of order case
    {
      code: `
        const b = a + 2;
        const a = 1;
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const a = 1;
        const b = a + 2;
      `,
    },
    // Out of order with destructuring
    {
      code: `
        const { id } = group || {};
        const group = useGroupDoc();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const group = useGroupDoc();
        const { id } = group || {};
      `,
    },
    // Multiple dependencies
    {
      code: `
        const result = a + b;
        const a = 1;
        const b = 2;
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const a = 1;
        const result = a + b;
        const b = 2;
      `,
    },
    // Complex destructuring out of order
    {
      code: `
        const { data: { user: { name } } } = response;
        const response = await fetchData();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const response = await fetchData();
        const { data: { user: { name } } } = response;
      `,
    },
    // Multiple hooks with dependencies out of order
    {
      code: `
        const tripleCount = useMemo(() => doubleCount * 1.5, [doubleCount]);
        const [count] = useState(0);
        const doubleCount = useMemo(() => count * 2, [count]);
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const [count] = useState(0);
        const doubleCount = useMemo(() => count * 2, [count]);
        const tripleCount = useMemo(() => doubleCount * 1.5, [doubleCount]);
      `,
    },
    // Object spread with dependencies
    {
      code: `
        const extended = { ...base, extra: true };
        const base = { foo: 'bar' };
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const base = { foo: 'bar' };
        const extended = { ...base, extra: true };
      `,
    },
    // Array methods with out of order dependencies
    {
      code: `
        const processed = items.map(transform);
        const items = getItems();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const items = getItems();
        const processed = items.map(transform);
      `,
    },
    // Function calls with multiple dependencies
    {
      code: `
        const result = process(a, b, c);
        const a = getValue();
        const b = getOtherValue();
        const c = getLastValue();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const a = getValue();
        const b = getOtherValue();
        const result = process(a, b, c);
        const c = getLastValue();
      `,
    },
    // Nested destructuring with dependencies
    {
      code: `
        const { items: [first, { nested: value }] } = data;
        const data = fetchComplexData();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const data = fetchComplexData();
        const { items: [first, { nested: value }] } = data;
      `,
    },
    // Template literals with dependencies
    {
      code: `
        const message = \`Hello \${name}!\`;
        const name = getName();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const name = getName();
        const message = \`Hello \${name}!\`;
      `,
    },
    // Conditional expressions with dependencies
    {
      code: `
        const display = isValid ? success : error;
        const isValid = validate();
        const success = 'OK';
        const error = 'Error';
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const isValid = validate();
        const success = 'OK';
        const display = isValid ? success : error;
        const error = 'Error';
      `,
    },
    // Complex object methods with dependencies
    {
      code: `
        const instance = new MyClass({
          handler: () => value,
        });
        const value = getValue();
      `,
      errors: [{ messageId: 'scopeOutOfOrder' }],
      output: `
        const value = getValue();
        const instance = new MyClass({
          handler: () => value,
        });
      `,
    },
  ],
});
