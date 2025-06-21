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

    // Valid: useCallback that returns JSX
    {
      code: `
        const MyComponent = () => {
          const renderItem = useCallback((item) => {
            return <div key={item.id}>{item.name}</div>;
          }, []);
          return <List renderItem={renderItem} />;
        };
      `,
    },

    // Valid: useCallback that references component scope
    {
      code: `
        const MyComponent = () => {
          const componentId = useId();
          const logEvent = useCallback((eventType) => {
            analytics.track(eventType, { componentId });
          }, []);
          return <button onClick={() => logEvent('click')}>Click</button>;
        };
      `,
    },

    // Valid: useLatestCallback (allowed by default)
    {
      code: `
        const MyComponent = () => {
          const handleAction = useLatestCallback(() => {
            console.log('Action performed');
          });
          return <button onClick={handleAction}>Action</button>;
        };
      `,
    },

    // Valid: useCallback with non-empty dependencies
    {
      code: `
        const MyComponent = ({ userId }) => {
          const fetchUser = useCallback(async () => {
            const response = await fetch(\`/api/users/\${userId}\`);
            return response.json();
          }, [userId]);
          return <button onClick={fetchUser}>Fetch User</button>;
        };
      `,
    },
  ],

  invalid: [
    // Invalid: useCallback with empty dependencies and no component scope usage
    {
      code: `
        const MyComponent = () => {
          const formatCurrency = useCallback((amount) => {
            return new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(amount);
          }, []);
          return <div>{formatCurrency(29.99)}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtility' }],
    },

    // Invalid: useCallback with empty dependencies that only uses constants
    {
      code: `
        const MyComponent = () => {
          const validateEmailSimple = useCallback((email) => {
            const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
            return emailRegex.test(email);
          }, []);
          return <div>{validateEmailSimple('test@example.com') ? 'Valid' : 'Invalid'}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtility' }],
    },

    // Invalid: useCallback with empty dependencies that performs calculations
    {
      code: `
        const MyComponent = () => {
          const calculateTax = useCallback((amount, rate) => {
            return amount * (rate / 100);
          }, []);
          return <div>Tax: {calculateTax(100, 8.5)}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtility' }],
    },

    // Invalid: useCallback with empty dependencies that uses Math functions
    {
      code: `
        const MyComponent = () => {
          const generateRandomId = useCallback(() => {
            return Math.random().toString(36).substr(2, 9);
          }, []);
          return <div>ID: {generateRandomId()}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtility' }],
    },

    // Invalid: useCallback with empty dependencies that uses Date
    {
      code: `
        const MyComponent = () => {
          const formatDate = useCallback((date) => {
            return new Date(date).toLocaleDateString();
          }, []);
          return <div>{formatDate(new Date())}</div>;
        };
      `,
      errors: [{ messageId: 'extractToUtility' }],
    },
  ],
});
