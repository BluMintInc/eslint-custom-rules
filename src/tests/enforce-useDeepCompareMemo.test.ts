import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceUseDeepCompareMemo } from '../rules/enforce-useDeepCompareMemo';

ruleTesterJsx.run('enforce-useDeepCompareMemo', enforceUseDeepCompareMemo, {
  valid: [
    // Using useDeepCompareMemo
    {
      code: `
        import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

        const MyComponent = ({ config }) => {
          const formattedData = useDeepCompareMemo(() => {
            return {
              name: config.name.toUpperCase(),
              status: getStatusLabel(config.status),
              lastActive: formatDate(config.lastLogin)
            };
          }, [config]);

          return <ProfileCard data={formattedData} />;
        };
      `,
    },
    // Using useMemo with primitive values
    {
      code: `
        const MyComponent = ({ id, name, count }) => {
          const formattedData = useMemo(() => {
            return {
              id,
              name: name.toUpperCase(),
              count: count * 2
            };
          }, [id, name, count]);

          return <ProfileCard data={formattedData} />;
        };
      `,
    },
    // Using useMemo with empty dependency array
    {
      code: `
        const MyComponent = () => {
          const constants = useMemo(() => {
            return { API_URL: 'https://api.example.com' };
          }, []);

          return <div>{constants.API_URL}</div>;
        };
      `,
    },
    // Using useMemo with already memoized values
    {
      code: `
        const MyComponent = ({ data }) => {
          const memoizedConfig = useMemo(() => ({ foo: 'bar' }), []);
          const derivedValue = useMemo(() => {
            return processConfig(memoizedConfig);
          }, [memoizedConfig]);

          return <div>{derivedValue}</div>;
        };
      `,
    },
    // Using useMemo to memoize JSX (should be handled by a different rule)
    {
      code: `
        const MyComponent = ({ config }) => {
          const MemoizedComponent = useMemo(() => {
            return <ExpensiveComponent config={config} />;
          }, [config]);

          return <div>{MemoizedComponent}</div>;
        };
      `,
    },
    // Using useMemo with a function that returns JSX
    {
      code: `
        const MyComponent = ({ config }) => {
          const renderComponent = useMemo(() => {
            return () => <ExpensiveComponent config={config} />;
          }, [config]);

          return <div>{renderComponent()}</div>;
        };
      `,
    },
    // Using useCallback (not affected by this rule)
    {
      code: `
        const MyComponent = ({ id, onSave }) => {
          const handleClick = useCallback(() => {
            onSave(id);
          }, [id, onSave]);

          return <button onClick={handleClick}>Save</button>;
        };
      `,
    },
    // Using useMemo with TypeScript generics and primitive values
    {
      code: `
        const MyComponent = ({ id, name }) => {
          const data = useMemo<FormattedData>(() => {
            return {
              id,
              name: name.toUpperCase()
            };
          }, [id, name]);

          return <div>{data.name}</div>;
        };
      `,
    },
  ],
  invalid: [
    // Basic case - using useMemo with an object in deps array
    {
      code: `
        const UserProfile = ({ userConfig }) => {
          const formattedData = useMemo(() => {
            return {
              name: userConfig.name.toUpperCase(),
              status: getStatusLabel(userConfig.status),
              lastActive: formatDate(userConfig.lastLogin)
            };
          }, [userConfig]);

          return <ProfileCard data={formattedData} />;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const UserProfile = ({ userConfig }) => {
          const formattedData = useDeepCompareMemo(() => {
            return {
              name: userConfig.name.toUpperCase(),
              status: getStatusLabel(userConfig.status),
              lastActive: formatDate(userConfig.lastLogin)
            };
          }, [userConfig]);

          return <ProfileCard data={formattedData} />;
        };
      `,
    },
    // Using useMemo with an array in deps array
    {
      code: `
        const ItemsList = ({ items }) => {
          const processedItems = useMemo(() => {
            return items.map(item => ({
              ...item,
              processed: true
            }));
          }, [items]);

          return <List items={processedItems} />;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const ItemsList = ({ items }) => {
          const processedItems = useDeepCompareMemo(() => {
            return items.map(item => ({
              ...item,
              processed: true
            }));
          }, [items]);

          return <List items={processedItems} />;
        };
      `,
    },
    // Using useMemo with a function in deps array
    {
      code: `
        const FunctionComponent = ({ callback }) => {
          const wrappedCallback = useMemo(() => {
            return (...args) => {
              console.log('Calling callback');
              return callback(...args);
            };
          }, [callback]);

          return <Button onClick={wrappedCallback}>Click me</Button>;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const FunctionComponent = ({ callback }) => {
          const wrappedCallback = useDeepCompareMemo(() => {
            return (...args) => {
              console.log('Calling callback');
              return callback(...args);
            };
          }, [callback]);

          return <Button onClick={wrappedCallback}>Click me</Button>;
        };
      `,
    },
    // Using useMemo with multiple reference types in deps array
    {
      code: `
        const ComplexComponent = ({ user, settings, onUpdate }) => {
          const config = useMemo(() => {
            return {
              userName: user.name,
              theme: settings.theme,
              updateFn: onUpdate
            };
          }, [user, settings, onUpdate]);

          return <ConfigProvider config={config} />;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const ComplexComponent = ({ user, settings, onUpdate }) => {
          const config = useDeepCompareMemo(() => {
            return {
              userName: user.name,
              theme: settings.theme,
              updateFn: onUpdate
            };
          }, [user, settings, onUpdate]);

          return <ConfigProvider config={config} />;
        };
      `,
    },
    // Using useMemo with mixed primitive and reference types
    {
      code: `
        const MixedComponent = ({ id, user, count }) => {
          const data = useMemo(() => {
            return {
              id,
              name: user.name,
              count
            };
          }, [id, user, count]);

          return <DataDisplay data={data} />;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const MixedComponent = ({ id, user, count }) => {
          const data = useDeepCompareMemo(() => {
            return {
              id,
              name: user.name,
              count
            };
          }, [id, user, count]);

          return <DataDisplay data={data} />;
        };
      `,
    },
    // Using useMemo with TypeScript generics
    {
      code: `
        const TypedComponent = ({ config }) => {
          const data = useMemo<ProcessedConfig>(() => {
            return {
              ...config,
              processed: true
            };
          }, [config]);

          return <ConfigDisplay data={data} />;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const TypedComponent = ({ config }) => {
          const data = useDeepCompareMemo<ProcessedConfig>(() => {
            return {
              ...config,
              processed: true
            };
          }, [config]);

          return <ConfigDisplay data={data} />;
        };
      `,
    },
    // Using useMemo with inline object in deps array
    {
      code: `
        const InlineObjectComponent = () => {
          const [state, setState] = useState({ count: 0 });

          const doubledCount = useMemo(() => {
            return state.count * 2;
          }, [{ ...state }]);

          return <div>{doubledCount}</div>;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const InlineObjectComponent = () => {
          const [state, setState] = useState({ count: 0 });

          const doubledCount = useDeepCompareMemo(() => {
            return state.count * 2;
          }, [{ ...state }]);

          return <div>{doubledCount}</div>;
        };
      `,
    },
    // Using useMemo with inline array in deps array
    {
      code: `
        const InlineArrayComponent = ({ items }) => {
          const itemCount = useMemo(() => {
            return items.length;
          }, [[...items]]);

          return <div>Count: {itemCount}</div>;
        };
      `,
      errors: [{ messageId: 'enforceUseDeepCompareMemo' }],
      output: `
        const InlineArrayComponent = ({ items }) => {
          const itemCount = useDeepCompareMemo(() => {
            return items.length;
          }, [[...items]]);

          return <div>Count: {itemCount}</div>;
        };
      `,
    },
  ],
});
