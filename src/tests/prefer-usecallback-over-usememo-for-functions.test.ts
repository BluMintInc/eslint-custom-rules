import { ESLintUtils } from '@typescript-eslint/utils';
import { Linter, Rule } from 'eslint';
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

const callbackDescription = (callbackName: string) =>
  `the callback "${callbackName}"`;

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
      // Valid case: the member-expression form is out of scope for this rule, so
      // the react import is never rewritten for it
      {
        code: `import React from 'react';
const C = () => { const cb = React.useMemo(() => () => {}, []); return cb; };`,
      },
      // Valid case: a useMemo computing a value leaves the import untouched
      {
        code: `import { useMemo } from 'react';
const C = () => { const config = useMemo(() => ({ apiUrl: '/api' }), []); return config; };`,
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handleClick') },
          },
        ],
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handleClick') },
          },
        ],
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('fetchData') },
          },
        ],
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handler') },
          },
        ],
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handler') },
          },
        ],
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
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handleClick') },
          },
        ],
        output: `
        function Component({ id }) {
          const handleClick = useCallback(() => {
              console.log('Button clicked', id);
            }, [id]);
          return <button onClick={handleClick}>Click me</button>;
        }
      `,
      },
      // Invalid case: the autofix must swap the react import over to useCallback
      {
        code: `import { useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
      },
      // Invalid case: a surviving useMemo call keeps the specifier
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const config = useMemo(() => ({ apiUrl: '/api' }), []);
  return [cb, config];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const config = useMemo(() => ({ apiUrl: '/api' }), []);
  return [cb, config];
};`,
      },
      // Invalid case: useMemo referenced as a value keeps the specifier
      {
        code: `import { useMemo } from 'react';
const memoAlias = useMemo;
const C = () => { const cb = useMemo(() => () => {}, []); return [cb, memoAlias]; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const memoAlias = useMemo;
const C = () => { const cb = useCallback(() => {}, []); return [cb, memoAlias]; };`,
      },
      // Invalid case: useCallback already imported, so no duplicate specifier
      {
        code: `import { useMemo, useCallback } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
      },
      // Invalid case: useCallback imported and useMemo still needed leaves the
      // import list untouched
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const config = useMemo(() => ({ apiUrl: '/api' }), []);
  return [cb, config];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback, useMemo } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const config = useMemo(() => ({ apiUrl: '/api' }), []);
  return [cb, config];
};`,
      },
      // Invalid case: an aliased useCallback import is reused at the call site
      {
        code: `import { useMemo, useCallback as uc } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback as uc } from 'react';
const C = () => { const cb = uc(() => {}, []); return cb; };`,
      },
      // Invalid case: a default specifier survives the useMemo swap
      {
        code: `import React, { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {
      console.log('clicked');
    };
  }, []);
  return <div onClick={cb}>{React.version}</div>;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import React, { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {
      console.log('clicked');
    }, []);
  return <div onClick={cb}>{React.version}</div>;
};`,
      },
      // Invalid case: generic type arguments survive alongside the import rewrite
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const handler = useMemo<(id: string) => void>(() => {
    return (id) => {
      console.log(id);
    };
  }, []);
  return handler;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handler') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const handler = useCallback<(id: string) => void>((id) => {
      console.log(id);
    }, []);
  return handler;
};`,
      },
      // Invalid case: two conversions in one file share a single import rewrite
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const a = useMemo(() => () => {}, []);
  const b = useMemo(() => () => 1, []);
  return [a, b];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('a') },
          },
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('b') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const a = useCallback(() => {}, []);
  const b = useCallback(() => 1, []);
  return [a, b];
};`,
      },
      // Invalid case: a local binding named useCallback would capture the emitted
      // call, so the violation is reported without a fix
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const useCallback = 1;
  const cb = useMemo(() => () => {}, []);
  return [cb, useCallback];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Invalid case: shadowing only blocks the conversion inside that scope
      {
        code: `import { useMemo } from 'react';
const A = () => {
  const useCallback = 1;
  const a = useMemo(() => () => {}, []);
  return [a, useCallback];
};
const B = () => { const b = useMemo(() => () => {}, []); return b; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('a') },
          },
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('b') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const A = () => {
  const useCallback = 1;
  const a = useMemo(() => () => {}, []);
  return [a, useCallback];
};
const B = () => { const b = useCallback(() => {}, []); return b; };`,
      },
      // Invalid case: a sole useMemo specifier is dropped with its statement when
      // useCallback comes from another declaration
      {
        code: `import { useMemo } from 'react';
import { useCallback } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
      },
      // Invalid case: the trailing useMemo specifier is removed with its comma
      {
        code: `import { useCallback, useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};`,
      },
      // Invalid case: removing the only named specifier drops the empty braces
      {
        code: `import React, { useMemo } from 'react';
import { useCallback } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other, React.version];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import React from 'react';
import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other, React.version];
};`,
      },
      // Invalid case: a useMemo bound by a default import is left to its own
      // module, so only the call site changes
      {
        code: `import useMemo from './use-memo';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import useMemo from './use-memo';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
      },
      // Invalid case: assignment target names the callback in the message
      {
        code: `import { useMemo } from 'react';
const C = () => {
  let handler;
  handler = useMemo(() => () => {}, []);
  return handler;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handler') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  let handler;
  handler = useCallback(() => {}, []);
  return handler;
};`,
      },
      // Invalid case: object property names the callback in the message
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const handlers = { onClick: useMemo(() => () => {}, []) };
  return handlers;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: 'the "onClick" property callback' },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const handlers = { onClick: useCallback(() => {}, []) };
  return handlers;
};`,
      },
      // Invalid case: JSX attribute names the callback in the message
      {
        code: `import { useMemo } from 'react';
const C = () => <button onClick={useMemo(() => () => {}, [])}>Go</button>;`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: 'the "onClick" prop callback' },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => <button onClick={useCallback(() => {}, [])}>Go</button>;`,
      },
      // Invalid case: an unnamed position falls back to a generic description
      {
        code: `import { useMemo } from 'react';
const C = () => [useMemo(() => () => {}, [])];`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: 'this callback value' },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => [useCallback(() => {}, [])];`,
      },
      // Invalid case: hooks imported from a non-react module are rewritten in place
      {
        code: `import { useMemo } from 'preact/hooks';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'preact/hooks';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
      },
    ],
  },
);

// RuleTester asserts a single fix pass, but `eslint --fix` loops until stable.
// These cases assert the import rewrite converges and does not re-report.
describe('prefer-usecallback-over-usememo-for-functions: --fix convergence (issue #1367)', () => {
  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/prefer-usecallback-over-usememo-for-functions',
      preferUseCallbackOverUseMemoForFunctions as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: {
        'test/prefer-usecallback-over-usememo-for-functions': 'error' as const,
      },
    };
    const { output, messages } = linter.verifyAndFix(
      code,
      config,
      'Component.tsx',
    );
    return { output, messages };
  };

  it('converges on the issue reproduction', () => {
    const { output, messages } = lint(
      `import { useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
    );
    expect(output).toBe(
      `import { useCallback } from 'react';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
    );
    expect(messages).toHaveLength(0);
  });

  it('converges when a file holds multiple conversions', () => {
    const { output, messages } = lint(
      `import { useMemo } from 'react';
const C = () => {
  const a = useMemo(() => () => {}, []);
  const b = useMemo(() => () => 1, []);
  return [a, b];
};`,
    );
    expect(output).toBe(
      `import { useCallback } from 'react';
const C = () => {
  const a = useCallback(() => {}, []);
  const b = useCallback(() => 1, []);
  return [a, b];
};`,
    );
    expect(messages).toHaveLength(0);
  });

  it('keeps useMemo when a value-producing call survives', () => {
    const { output, messages } = lint(
      `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const config = useMemo(() => ({ apiUrl: '/api' }), []);
  return [cb, config];
};`,
    );
    expect(output).toContain(`import { useMemo, useCallback } from 'react';`);
    expect(messages).toHaveLength(0);
  });
});
