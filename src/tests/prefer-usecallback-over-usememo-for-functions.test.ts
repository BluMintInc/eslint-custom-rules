import { ESLintUtils } from '@typescript-eslint/utils';
import { preferUseCallbackOverUseMemoForFunctions } from '../rules/prefer-usecallback-over-usememo-for-functions';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run(
  'prefer-usecallback-over-usememo-for-functions',
  preferUseCallbackOverUseMemoForFunctions,
  {
    valid: [
      // Valid case: using useCallback for function memoization
      {
        code: `
        function Component() {
          const handleClick = useCallback(() => {
            console.log('Button clicked');
          }, []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
      },
      // Valid case: using useCallback with dependencies
      {
        code: `
        function Component({ id }) {
          const fetchData = useCallback(async () => {
            const response = await fetch(\`/api/data/\${id}\`);
            return response.json();
          }, [id]);
          return <button onClick={fetchData}>Fetch</button>;
        }
      `,
      },
      // Valid case: using useMemo for object memoization (not a function)
      {
        code: `
        function Component() {
          const config = useMemo(() => ({
            apiUrl: '/api',
            timeout: 5000,
          }), []);
          return <ApiProvider config={config} />;
        }
      `,
      },
      // Valid case: using useMemo for complex computation
      {
        code: `
        function Component({ data }) {
          const processedData = useMemo(() => {
            return data.map(item => item.value * 2);
          }, [data]);
          return <DataDisplay data={processedData} />;
        }
      `,
      },
      // Valid case: using useMemo for function factory (returning object with functions)
      {
        code: `
        function Component() {
          const handlers = useMemo(() => {
            return {
              onClick: (id) => () => console.log(\`Clicked \${id}\`),
              onHover: (id) => () => console.log(\`Hovered \${id}\`)
            };
          }, []);
          return <ComplexComponent handlers={handlers} />;
        }
      `,
      },
      // Valid case: using useMemo for function factory (with implicit return)
      {
        code: `
        function Component() {
          const handlers = useMemo(() => ({
            onClick: (id) => () => console.log(\`Clicked \${id}\`),
            onHover: (id) => () => console.log(\`Hovered \${id}\`)
          }), []);
          return <ComplexComponent handlers={handlers} />;
        }
      `,
      },
      // Valid case: complex body with allowComplexBodies option
      {
        code: `
        function Component() {
          const handleClick = useMemo(() => {
            const timestamp = Date.now();
            const logger = setupLogger();

            return () => {
              logger.log('Button clicked at', timestamp);
            };
          }, []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
        options: [{ allowComplexBodies: true }],
      },
      // Valid case: function factory with non-empty dependency array
      {
        code: `
        function Component({ prefix }) {
          const createHandlers = useMemo(() => {
            return {
              onClick: (id) => () => console.log(\`\${prefix}: Clicked \${id}\`),
              onHover: (id) => () => console.log(\`\${prefix}: Hovered \${id}\`)
            };
          }, [prefix]);
          return <ComplexComponent handlers={createHandlers} />;
        }
      `,
      },
    ],
    invalid: [
      // Invalid case: using useMemo to return a function (with block body)
      {
        code: `
        function Component() {
          const handleClick = useMemo(() => {
            return () => {
              console.log('Button clicked');
            };
          }, []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component() {
          const handleClick = useCallback(() => {
              console.log('Button clicked');
            }, []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
      },
      // Invalid case: using useMemo to return a function (with implicit return)
      {
        code: `
        function Component() {
          const handleClick = useMemo(() => () => console.log('Button clicked'), []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component() {
          const handleClick = useCallback(() => console.log('Button clicked'), []);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
      },
      // Invalid case: using useMemo to return an async function
      {
        code: `
        function Component({ id }) {
          const fetchData = useMemo(() => {
            return async () => {
              const response = await fetch(\`/api/data/\${id}\`);
              return response.json();
            };
          }, [id]);
          return <button onClick={fetchData}>Fetch</button>;
        }
      `,
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component({ id }) {
          const fetchData = useCallback(async () => {
              const response = await fetch(\`/api/data/\${id}\`);
              return response.json();
            }, [id]);
          return <button onClick={fetchData}>Fetch</button>;
        }
      `,
      },
      // Invalid case: using useMemo to return a function with TypeScript generic
      {
        code: `
        function Component() {
          const handler = useMemo<(id: string) => void>(() => {
            return (id) => {
              console.log(\`Processing \${id}\`);
            };
          }, []);
          return <button onClick={() => handler('123')}>Process</button>;
        }
      `,
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component() {
          const handler = useCallback<(id: string) => void>((id) => {
              console.log(\`Processing \${id}\`);
            }, []);
          return <button onClick={() => handler('123')}>Process</button>;
        }
      `,
      },
      // Invalid case: function factory when allowFunctionFactories is false
      {
        code: `
        function Component() {
          const handler = useMemo(() => () => console.log('Simple function'), []);
          return <button onClick={handler}>Click me</button>;
        }
      `,
        options: [{ allowFunctionFactories: false }],
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component() {
          const handler = useCallback(() => console.log('Simple function'), []);
          return <button onClick={handler}>Click me</button>;
        }
      `,
      },
      // Invalid case: with non-empty dependency array
      {
        code: `
        function Component({ id }) {
          const handleClick = useMemo(() => {
            return () => {
              console.log('Button clicked', id);
            };
          }, [id]);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
        errors: [{ messageId: 'preferUseCallback' }],
        output: `
        function Component({ id }) {
          const handleClick = useCallback(() => {
              console.log('Button clicked', id);
            }, [id]);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
      },
    ],
  },
);
