import { ruleTesterJsx } from '../utils/ruleTester';
import { optimizeObjectBooleanConditions } from '../rules/optimize-object-boolean-conditions';

ruleTesterJsx.run('optimize-object-boolean-conditions', optimizeObjectBooleanConditions, {
  valid: [
    // Already optimized with boolean variables
    {
      code: `
        const hasData = data && Object.keys(data).length > 0;
        const result = useMemo(() => {
          return hasData ? processData() : [];
        }, [hasData, mode]);
      `,
    },
    // Boolean variables with proper naming
    {
      code: `
        const isDataEmpty = !data || Object.keys(data).length === 0;
        const result = useCallback(() => {
          return isDataEmpty ? 'No data' : 'Has data';
        }, [isDataEmpty]);
      `,
    },
    // Primitive dependencies (not objects)
    {
      code: `
        const result = useMemo(() => {
          return count > 0 ? 'positive' : 'zero or negative';
        }, [count > 0]);
      `,
    },
    // String dependencies
    {
      code: `
        const result = useMemo(() => {
          return name.length > 0 ? 'has name' : 'no name';
        }, [name.length > 0]);
      `,
    },
    // Array dependencies (should be allowed)
    {
      code: `
        const result = useMemo(() => {
          return items.length > 0 ? 'has items' : 'no items';
        }, [items.length > 0]);
      `,
    },
    // Hook without dependency array
    {
      code: `
        const result = useMemo(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        });
      `,
    },
    // Non-hook function calls
    {
      code: `
        const result = someFunction(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        }, [!data || Object.keys(data).length === 0]);
      `,
    },
    // Already boolean-named variables
    {
      code: `
        const hasRoundPreviews = roundPreviews && Object.keys(roundPreviews).length > 0;
        const result = useMemo(() => {
          return hasRoundPreviews ? 'has data' : 'no data';
        }, [hasRoundPreviews]);
      `,
    },
    // Variables starting with boolean prefixes
    {
      code: `
        const canProcess = data && data.ready;
        const result = useMemo(() => {
          return canProcess ? processData() : null;
        }, [canProcess]);
      `,
    },
    // Variables starting with 'should'
    {
      code: `
        const shouldRender = items && items.length > 0;
        const result = useMemo(() => {
          return shouldRender ? renderItems() : null;
        }, [shouldRender]);
      `,
    },
    // Variables starting with 'will'
    {
      code: `
        const willUpdate = config && config.autoUpdate;
        const result = useEffect(() => {
          if (willUpdate) startUpdates();
        }, [willUpdate]);
      `,
    },
    // Variables starting with 'was'
    {
      code: `
        const wasLoaded = data && data.loaded;
        const result = useMemo(() => {
          return wasLoaded ? data.content : 'Loading...';
        }, [wasLoaded]);
      `,
    },
    // Variables starting with 'were'
    {
      code: `
        const wereProcessed = items && items.processed;
        const result = useMemo(() => {
          return wereProcessed ? 'Done' : 'Processing...';
        }, [wereProcessed]);
      `,
    },
    // Simple identifier dependencies (not boolean expressions)
    {
      code: `
        const result = useMemo(() => {
          return data ? processData(data) : null;
        }, [data]);
      `,
    },
    // Property access dependencies
    {
      code: `
        const result = useMemo(() => {
          return user.name ? 'Hello ' + user.name : 'Hello Guest';
        }, [user.name]);
      `,
    },
    // Method call dependencies
    {
      code: `
        const result = useMemo(() => {
          return items.map(item => item.id);
        }, [items.map]);
      `,
    },
    // Computed property access
    {
      code: `
        const result = useMemo(() => {
          return obj[key] ? 'found' : 'not found';
        }, [obj[key]]);
      `,
    },
    // Function call dependencies
    {
      code: `
        const result = useMemo(() => {
          return getValue() > 0 ? 'positive' : 'non-positive';
        }, [getValue()]);
      `,
    },
    // Nested object access
    {
      code: `
        const result = useMemo(() => {
          return user.profile.name || 'Anonymous';
        }, [user.profile.name]);
      `,
    },
    // Multiple simple dependencies
    {
      code: `
        const result = useMemo(() => {
          return a + b;
        }, [a, b]);
      `,
    },
  ],
  invalid: [
    // Object existence check in useMemo
    {
      code: `
        const result = useMemo(() => {
          return !data ? [] : processData();
        }, [!data]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!data',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Object key count check in useCallback
    {
      code: `
        const callback = useCallback(() => {
          return Object.keys(items).length === 0 ? 'empty' : 'not empty';
        }, [Object.keys(items).length === 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(items).length === 0',
            suggestedName: 'hasItems',
            objectName: 'items',
          },
        },
      ],
    },
    // Object key count check with greater than
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(data).length > 0 ? 'has data' : 'no data';
        }, [Object.keys(data).length > 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(data).length > 0',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Object key count check with not equal
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(config).length !== 0 ? 'configured' : 'not configured';
        }, [Object.keys(config).length !== 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(config).length !== 0',
            suggestedName: 'hasConfig',
            objectName: 'config',
          },
        },
      ],
    },
    // Complex boolean expression with logical OR
    {
      code: `
        const result = useMemo(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        }, [!data || Object.keys(data).length === 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!data || Object.keys(data).length === 0',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Complex boolean expression with logical AND
    {
      code: `
        const result = useMemo(() => {
          return data && Object.keys(data).length > 0 ? processData() : [];
        }, [data && Object.keys(data).length > 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'data && Object.keys(data).length > 0',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // useEffect with object existence check
    {
      code: `
        useEffect(() => {
          if (!user) return;
          updateProfile();
        }, [!user]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!user',
            suggestedName: 'hasUser',
            objectName: 'user',
          },
        },
      ],
    },
    // Multiple boolean conditions in same dependency array
    {
      code: `
        const result = useMemo(() => {
          return (!data || Object.keys(data).length === 0) && (!config || Object.keys(config).length === 0);
        }, [!data || Object.keys(data).length === 0, !config || Object.keys(config).length === 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!data || Object.keys(data).length === 0',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!config || Object.keys(config).length === 0',
            suggestedName: 'hasConfig',
            objectName: 'config',
          },
        },
      ],
    },
    // Object existence check with different variable name
    {
      code: `
        const result = useMemo(() => {
          return !roundPreviews ? 'loading' : 'loaded';
        }, [!roundPreviews]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!roundPreviews',
            suggestedName: 'hasRoundPreviews',
            objectName: 'roundPreviews',
          },
        },
      ],
    },
    // Object key count with less than
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(items).length < 1 ? 'empty' : 'not empty';
        }, [Object.keys(items).length < 1]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(items).length < 1',
            suggestedName: 'hasItems',
            objectName: 'items',
          },
        },
      ],
    },
    // Object key count with greater than or equal
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(data).length >= 1 ? 'has data' : 'no data';
        }, [Object.keys(data).length >= 1]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(data).length >= 1',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Object key count with less than or equal
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(settings).length <= 0 ? 'no settings' : 'has settings';
        }, [Object.keys(settings).length <= 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(settings).length <= 0',
            suggestedName: 'hasSettings',
            objectName: 'settings',
          },
        },
      ],
    },
    // Mixed dependencies with boolean condition
    {
      code: `
        const result = useMemo(() => {
          return !data || mode === 'test' ? [] : processData();
        }, [!data, mode]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!data',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Complex expression with multiple objects
    {
      code: `
        const result = useMemo(() => {
          return !user || !user.profile ? 'no profile' : user.profile.name;
        }, [!user || !user.profile]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!user || !user.profile',
            suggestedName: 'hasUser',
            objectName: 'user',
          },
        },
      ],
    },
    // Object existence in useCallback with arrow function
    {
      code: `
        const handleClick = useCallback(() => {
          if (!data) return;
          processData();
        }, [!data]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!data',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Object key count in useEffect
    {
      code: `
        useEffect(() => {
          if (Object.keys(cache).length === 0) {
            loadCache();
          }
        }, [Object.keys(cache).length === 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(cache).length === 0',
            suggestedName: 'hasCache',
            objectName: 'cache',
          },
        },
      ],
    },
    // Nested complex expression
    {
      code: `
        const result = useMemo(() => {
          return (data && Object.keys(data).length > 0) || fallback ? 'show' : 'hide';
        }, [(data && Object.keys(data).length > 0) || fallback]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '(data && Object.keys(data).length > 0) || fallback',
            suggestedName: 'hasData',
            objectName: 'data',
          },
        },
      ],
    },
    // Object existence with camelCase variable
    {
      code: `
        const result = useMemo(() => {
          return !userProfile ? 'no profile' : userProfile.name;
        }, [!userProfile]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!userProfile',
            suggestedName: 'hasUserProfile',
            objectName: 'userProfile',
          },
        },
      ],
    },
    // Object key count with camelCase variable
    {
      code: `
        const result = useMemo(() => {
          return Object.keys(apiResponse).length > 0 ? 'success' : 'empty';
        }, [Object.keys(apiResponse).length > 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: 'Object.keys(apiResponse).length > 0',
            suggestedName: 'hasApiResponse',
            objectName: 'apiResponse',
          },
        },
      ],
    },
    // Multiple conditions with different objects
    {
      code: `
        const result = useMemo(() => {
          return (!user || Object.keys(user).length === 0) && (!settings || Object.keys(settings).length === 0);
        }, [!user || Object.keys(user).length === 0, !settings || Object.keys(settings).length === 0]);
      `,
      errors: [
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!user || Object.keys(user).length === 0',
            suggestedName: 'hasUser',
            objectName: 'user',
          },
        },
        {
          messageId: 'extractBooleanCondition',
          data: {
            expression: '!settings || Object.keys(settings).length === 0',
            suggestedName: 'hasSettings',
            objectName: 'settings',
          },
        },
      ],
    },
  ],
});
