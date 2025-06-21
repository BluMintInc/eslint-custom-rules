import { ruleTesterJsx } from '../utils/ruleTester';
import { noEmptyDependencyUseCallbacks } from '../rules/no-empty-dependency-use-callbacks';

ruleTesterJsx.run('no-empty-dependency-use-callbacks', noEmptyDependencyUseCallbacks, {
  valid: [
    // Valid: useCallback with dependencies
    {
      code: `
        const MyComponent = () => {
          const [count, setCount] = useState(0);
          const handleClick = useCallback(() => {
            setCount(count + 1);
          }, [count]);
          return <button onClick={handleClick}>Click</button>;
        };
      `,
    },

    // Valid: useCallback without dependencies array (not empty)
    {
      code: `
        const MyComponent = () => {
          const handleClick = useCallback(() => {
            console.log('clicked');
          });
          return <button onClick={handleClick}>Click</button>;
        };
      `,
    },

    // Valid: callback that accesses component scope
    {
      code: `
        const MyComponent = () => {
          const componentId = useId();
          const logEvent = useCallback((eventType) => {
            analytics.track(eventType, { componentId });
          }, []);
          return <Button onClick={() => logEvent('click')}>Click me</Button>;
        };
      `,
    },

    // Valid: callback that returns JSX
    {
      code: `
        const MyComponent = () => {
          const renderItem = useCallback((item) => {
            return <ItemComponent key={item.id} data={item} />;
          }, []);
          return <List renderItem={renderItem} />;
        };
      `,
    },

    // Valid: callback in custom hook (with allowCustomHooks: true)
    {
      code: `
        const useApiClient = () => {
          const apiCall = useCallback((endpoint) => {
            return fetch(\`/api/\${endpoint}\`);
          }, []);
          return { apiCall };
        };
      `,
      options: [{ allowCustomHooks: true }],
    },

    // Valid: test file (with allowTestFiles: true)
    {
      code: `
        const TestComponent = () => {
          const mockHandler = useCallback(() => {
            // Mock implementation for testing
          }, []);
          return <ComponentUnderTest onAction={mockHandler} />;
        };
      `,
      filename: 'test.spec.ts',
    },

    // Valid: callback that accesses imported function with component scope
    {
      code: `
        import { validateEmail } from '@/utils/validation';

        const LoginForm = () => {
          const userId = useId();
          const validateInput = useCallback((email) => {
            return validateEmail(email, userId);
          }, []);
          return <input onBlur={(e) => validateInput(e.target.value)} />;
        };
      `,
    },

    // Valid: callback with complex component scope access
    {
      code: `
        const MyComponent = () => {
          const [state, setState] = useState({});
          const config = { apiUrl: '/api' };

          const processData = useCallback((data) => {
            const processed = data.map(item => ({
              ...item,
              url: config.apiUrl + '/' + item.id
            }));
            setState(processed);
          }, []);

          return <DataProcessor onProcess={processData} />;
        };
      `,
    },

    // Valid: callback that returns JSX fragment
    {
      code: `
        const MyComponent = () => {
          const renderItems = useCallback((items) => {
            return (
              <>
                {items.map(item => <div key={item.id}>{item.name}</div>)}
              </>
            );
          }, []);
          return <Container render={renderItems} />;
        };
      `,
    },

    // Valid: callback accessing hook result
    {
      code: `
        const MyComponent = () => {
          const { data } = useQuery('key');
          const processData = useCallback((input) => {
            return input.filter(item => data.includes(item.id));
          }, []);
          return <Processor onProcess={processData} />;
        };
      `,
    },
  ],

  invalid: [
    // Invalid: simple useCallback with empty dependencies
    {
      code: `
        const MyComponent = () => {
          const [count, setCount] = useState(0);
          const formatCurrency = useCallback((amount) => {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(amount);
          }, []);
          return (
            <div>
              <p>Count: {count}</p>
              <p>Price: {formatCurrency(29.99)}</p>
            </div>
          );
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(amount);
          };

const MyComponent = () => {
          const [count, setCount] = useState(0);

          return (
            <div>
              <p>Count: {count}</p>
              <p>Price: {formatCurrency(29.99)}</p>
            </div>
          );
        };
      `,
    },

    // Invalid: callback using only built-in functions
    {
      code: `
        const Component = () => {
          const logMessage = useCallback((message) => {
            console.log(Date.now(), message);
          }, []);
          return <button onClick={() => logMessage('clicked')}>Click</button>;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const logMessage = (message) => {
            console.log(Date.now(), message);
          };

const Component = () => {

          return <button onClick={() => logMessage('clicked')}>Click</button>;
        };
      `,
    },

    // Invalid: callback using imported functions only
    {
      code: `
        import { validateEmail } from '@/utils/validation';

        const LoginForm = () => {
          const validateInput = useCallback((email) => {
            return validateEmail(email);
          }, []);
          return <input onBlur={(e) => validateInput(e.target.value)} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        import { validateEmail } from '@/utils/validation';

        const validateInput = (email) => {
            return validateEmail(email);
          };

const LoginForm = () => {

          return <input onBlur={(e) => validateInput(e.target.value)} />;
        };
      `,
    },

    // Invalid: arrow function with implicit return
    {
      code: `
        const Component = () => {
          const double = useCallback((x) => x * 2, []);
          return <div>{double(5)}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const double = (x) => x * 2;

const Component = () => {

          return <div>{double(5)}</div>;
        };
      `,
    },

    // Invalid: function expression
    {
      code: `
        const Component = () => {
          const calculate = useCallback(function(a, b) {
            return Math.max(a, b);
          }, []);
          return <div>{calculate(1, 2)}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const calculate = function(a, b) {
            return Math.max(a, b);
          };

const Component = () => {

          return <div>{calculate(1, 2)}</div>;
        };
      `,
    },

    // Invalid: callback in custom hook (with allowCustomHooks: false)
    {
      code: `
        const useApiClient = () => {
          const apiCall = useCallback((endpoint) => {
            return fetch(\`/api/\${endpoint}\`);
          }, []);
          return { apiCall };
        };
      `,
      options: [{ allowCustomHooks: false }],
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const apiCall = (endpoint) => {
            return fetch(\`/api/\${endpoint}\`);
          };

const useApiClient = () => {

          return { apiCall };
        };
      `,
    },

    // Invalid: test file (with allowTestFiles: false)
    {
      code: `
        const TestComponent = () => {
          const mockHandler = useCallback(() => {
            console.log('test');
          }, []);
          return <ComponentUnderTest onAction={mockHandler} />;
        };
      `,
      filename: 'test.spec.ts',
      options: [{ allowTestFiles: false }],
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const mockHandler = () => {
            console.log('test');
          };

const TestComponent = () => {

          return <ComponentUnderTest onAction={mockHandler} />;
        };
      `,
    },

    // Invalid: callback with Math operations
    {
      code: `
        const Calculator = () => {
          const calculateArea = useCallback((radius) => {
            return Math.PI * Math.pow(radius, 2);
          }, []);
          return <input onChange={(e) => calculateArea(e.target.value)} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const calculateArea = (radius) => {
            return Math.PI * Math.pow(radius, 2);
          };

const Calculator = () => {

          return <input onChange={(e) => calculateArea(e.target.value)} />;
        };
      `,
    },

    // Invalid: callback with JSON operations
    {
      code: `
        const DataProcessor = () => {
          const parseData = useCallback((jsonString) => {
            return JSON.parse(jsonString);
          }, []);
          return <Processor onParse={parseData} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const parseData = (jsonString) => {
            return JSON.parse(jsonString);
          };

const DataProcessor = () => {

          return <Processor onParse={parseData} />;
        };
      `,
    },

    // Invalid: callback with string operations
    {
      code: `
        const TextProcessor = () => {
          const formatText = useCallback((text) => {
            return String(text).toUpperCase().trim();
          }, []);
          return <TextInput onFormat={formatText} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const formatText = (text) => {
            return String(text).toUpperCase().trim();
          };

const TextProcessor = () => {

          return <TextInput onFormat={formatText} />;
        };
      `,
    },

    // Invalid: callback with array operations
    {
      code: `
        const ListProcessor = () => {
          const sortItems = useCallback((items) => {
            return Array.from(items).sort();
          }, []);
          return <List onSort={sortItems} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const sortItems = (items) => {
            return Array.from(items).sort();
          };

const ListProcessor = () => {

          return <List onSort={sortItems} />;
        };
      `,
    },

    // Invalid: callback with Promise operations
    {
      code: `
        const AsyncProcessor = () => {
          const processAsync = useCallback(async (data) => {
            return Promise.resolve(data);
          }, []);
          return <Processor onProcess={processAsync} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const processAsync = async (data) => {
            return Promise.resolve(data);
          };

const AsyncProcessor = () => {

          return <Processor onProcess={processAsync} />;
        };
      `,
    },

    // Invalid: callback with fetch operations
    {
      code: `
        const ApiComponent = () => {
          const fetchData = useCallback(async (url) => {
            const response = await fetch(url);
            return response.json();
          }, []);
          return <DataFetcher onFetch={fetchData} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const fetchData = async (url) => {
            const response = await fetch(url);
            return response.json();
          };

const ApiComponent = () => {

          return <DataFetcher onFetch={fetchData} />;
        };
      `,
    },

    // Invalid: callback with RegExp operations
    {
      code: `
        const ValidationComponent = () => {
          const validateEmail = useCallback((email) => {
            const regex = new RegExp(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/);
            return regex.test(email);
          }, []);
          return <EmailInput onValidate={validateEmail} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const validateEmail = (email) => {
            const regex = new RegExp(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/);
            return regex.test(email);
          };

const ValidationComponent = () => {

          return <EmailInput onValidate={validateEmail} />;
        };
      `,
    },

    // Invalid: callback with Error operations
    {
      code: `
        const ErrorHandler = () => {
          const createError = useCallback((message) => {
            return new Error(message);
          }, []);
          return <ErrorBoundary onCreate={createError} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const createError = (message) => {
            return new Error(message);
          };

const ErrorHandler = () => {

          return <ErrorBoundary onCreate={createError} />;
        };
      `,
    },

    // Invalid: callback with multiple built-in operations
    {
      code: `
        const ComplexProcessor = () => {
          const processData = useCallback((data) => {
            const timestamp = Date.now();
            const processed = JSON.stringify({
              data: Array.from(data),
              timestamp,
              hash: Math.random()
            });
            console.log('Processed:', processed);
            return processed;
          }, []);
          return <Processor onProcess={processData} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const processData = (data) => {
            const timestamp = Date.now();
            const processed = JSON.stringify({
              data: Array.from(data),
              timestamp,
              hash: Math.random()
            });
            console.log('Processed:', processed);
            return processed;
          };

const ComplexProcessor = () => {

          return <Processor onProcess={processData} />;
        };
      `,
    },

    // Invalid: callback with Intl operations
    {
      code: `
        const LocalizationComponent = () => {
          const formatNumber = useCallback((number) => {
            return new Intl.NumberFormat('en-US').format(number);
          }, []);
          return <NumberDisplay onFormat={formatNumber} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const formatNumber = (number) => {
            return new Intl.NumberFormat('en-US').format(number);
          };

const LocalizationComponent = () => {

          return <NumberDisplay onFormat={formatNumber} />;
        };
      `,
    },

    // Invalid: callback with mixed imports and built-ins
    {
      code: `
        import { debounce } from 'lodash';

        const SearchComponent = () => {
          const debouncedSearch = useCallback((query) => {
            console.log('Searching for:', query);
            return debounce(() => {
              console.log('Executing search');
            }, 300);
          }, []);
          return <SearchInput onSearch={debouncedSearch} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        import { debounce } from 'lodash';

        const debouncedSearch = (query) => {
            console.log('Searching for:', query);
            return debounce(() => {
              console.log('Executing search');
            }, 300);
          };

const SearchComponent = () => {

          return <SearchInput onSearch={debouncedSearch} />;
        };
      `,
    },

    // Invalid: callback that should suggest consideration (accesses unknown variables)
    {
      code: `
        const MyComponent = () => {
          const processData = useCallback((data) => {
            return unknownFunction(data);
          }, []);
          return <Processor onProcess={processData} />;
        };
      `,
      errors: [{ messageId: 'considerUtilityFunction' }],
    },

    // Invalid: callback with TypeScript generic
    {
      code: `
        const GenericComponent = () => {
          const processData = useCallback<(data: string) => string>((data) => {
            return data.toUpperCase();
          }, []);
          return <Processor onProcess={processData} />;
        };
      `,
      errors: [{ messageId: 'extractToUtilityFunction' }],
      output: `
        const processData = (data) => {
            return data.toUpperCase();
          };

const GenericComponent = () => {

          return <Processor onProcess={processData} />;
        };
      `,
    },
  ],
});
