import { Linter, Rule } from 'eslint';
import { ruleTesterJsx, withParserOptions } from '../utils/ruleTester';
import { preferUseCallbackOverUseMemoForFunctions } from '../rules/prefer-usecallback-over-usememo-for-functions';

// The shared JSX tester supplies the parser and `ecmaFeatures.jsx`; module
// scope analysis is not its default, and this rule discriminates `useCallback`
// by the module it is imported from, so every snippet declares it.
const parserOptions = {
  ecmaVersion: 2018,
  sourceType: 'module',
} as const;

const callbackDescription = (callbackName: string) =>
  `the callback "${callbackName}"`;

ruleTesterJsx.run(
  'prefer-usecallback-over-usememo-for-functions',
  preferUseCallbackOverUseMemoForFunctions,
  {
    valid: withParserOptions(parserOptions, [
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
      // Issue #1411: every violation suppressed inline leaves the file alone
      {
        code: `import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: a block disable covering the file suppresses everything
      {
        code: `/* eslint-disable prefer-usecallback-over-usememo-for-functions */
import { useMemo } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: a bare block disable suppresses this rule too
      {
        code: `/* eslint-disable */
import { useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
      },
      // Issue #1440: an aliased hook import is never matched, so an unknown
      // module's memo helper is left alone entirely
      {
        code: `import { useMemo as memoize } from '../hooks';
const C = () => { const cb = memoize(() => () => {}, []); return cb; };`,
      },
      // Issue #1440: the namespace form is out of scope for this rule
      {
        code: `import * as hooks from '../hooks';
const C = () => { const cb = hooks.useMemo(() => () => {}, []); return cb; };`,
      },
    ]),
    invalid: withParserOptions(parserOptions, [
      // ------------------------------------------------------------------
      // Issue #1440: `useMemo` here is bound by nothing this rule can vouch
      // for, so every one of these violations is reported without a fix.
      // Emitting `useCallback` would introduce an identifier no import binds.
      // ------------------------------------------------------------------
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
        output: null,
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
        output: null,
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
        output: null,
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
        output: null,
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
        output: null,
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
        output: null,
      },
      // Invalid case: the same async shape is fixed once useMemo is imported
      // from react, including a non-empty dependency array
      {
        code: `import { useMemo } from 'react';
function Component({ id }) {
  const fetchData = useMemo(() => {
    return async () => {
      const response = await fetch(\`/api/data/\${id}\`);
      return response.json();
    };
  }, [id]);
  return <button onClick={fetchData}>Fetch</button>;
}`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('fetchData') },
          },
        ],
        output: `import { useCallback } from 'react';
function Component({ id }) {
  const fetchData = useCallback(async () => {
    const response = await fetch(\`/api/data/\${id}\`);
    return response.json();
  }, [id]);
  return <button onClick={fetchData}>Fetch</button>;
}`,
      },
      // Invalid case: allowFunctionFactories: false still fixes a react import
      {
        code: `import { useMemo } from 'react';
function Component() {
  const handler = useMemo(() => () => console.log('Simple function'), []);
  return <button onClick={handler}>Click me</button>;
}`,
        options: [{ allowFunctionFactories: false }],
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handler') },
          },
        ],
        output: `import { useCallback } from 'react';
function Component() {
  const handler = useCallback(() => console.log('Simple function'), []);
  return <button onClick={handler}>Click me</button>;
}`,
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
      // Issue #1440: a useMemo bound by a default import is reported without a
      // fix — converting the call would emit a useCallback nothing binds
      {
        code: `import useMemo from './use-memo';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a named import from an unknown module is declined too:
      // renaming that specifier would import a member the module need not
      // export, and the hook it replaces need not be React's useMemo
      {
        code: `import { useMemo } from '../hooks';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: an unknown-module useMemo stays unfixed even when react's
      // useCallback is already imported. The emitted call would resolve, but a
      // hook of unknown semantics must not be swapped for React's silently
      {
        code: `import { useMemo } from '../hooks';
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
        output: null,
      },
      // Issue #1440: a re-exported useMemo barrel is an unknown module as well
      {
        code: `import { useMemo } from '@blumintinc/hooks';
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
        output: null,
      },
      // Issue #1440: a react useMemo with a useCallback imported from elsewhere
      // is declined: reusing that binding would call a different function, and
      // adding react's would collide with the name already bound
      {
        code: `import { useMemo } from 'react';
import { useCallback } from '../hooks';
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
        output: null,
      },
      // Issue #1440: the same guard applies to an aliased foreign useCallback,
      // whose local name would otherwise be emitted at the call site
      {
        code: `import { useMemo } from 'react';
import { useCallback as uc } from '../hooks';
const C = () => { const cb = useMemo(() => () => {}, []); return [cb, uc]; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a type-only useCallback import still binds the name, so the
      // emitted call would resolve to a type rather than the hook
      {
        code: `import { useMemo } from 'react';
import type { useCallback } from './hook-types';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a namespace import offers no specifier list to rewrite
      {
        code: `import * as hooks from './hooks';
const useMemo = hooks.useMemo;
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a require destructure is not an import binding
      {
        code: `const { useMemo } = require('react');
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: `default as useMemo` is react's default export, not the
      // hook, so the conversion is declined
      {
        code: `import { default as useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a type-only useMemo import is not a value binding
      {
        code: `import type { useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // Issue #1440: a locally rebound useMemo is declined while the react one
      // beside it is still converted, and the specifier the declined call needs
      // is the local binding rather than the import
      {
        code: `import { useMemo } from 'react';
const A = () => { const a = useMemo(() => () => {}, []); return a; };
const B = () => {
  const useMemo = require('../hooks').useMemo;
  const b = useMemo(() => () => {}, []);
  return b;
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
const A = () => { const a = useCallback(() => {}, []); return a; };
const B = () => {
  const useMemo = require('../hooks').useMemo;
  const b = useMemo(() => () => {}, []);
  return b;
};`,
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
      // Invalid case: hooks imported from preact, whose useCallback carries the
      // same contract as React's, are rewritten in place
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
      // Invalid case: the preact compat entry point exports the same hooks
      {
        code: `import { useMemo } from 'preact/compat';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'preact/compat';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
      },
      // Issue #1440: a react subpath is not the hooks entry point
      {
        code: `import { useMemo } from 'react/jsx-runtime';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: null,
      },
      // ------------------------------------------------------------------
      // Issue #1411: the import rewrite is a *rename* of the useMemo
      // specifier, so a suppressed violation breaks it in both directions:
      // a suppressed carrier drops the rename while survivors emit
      // useCallback, and a surviving carrier renames away the specifier the
      // suppressed useMemo call still needs. Either way an identifier ends up
      // unbound. Whenever any violation is suppressed the rename must degrade
      // to adding useCallback alongside useMemo.
      // ------------------------------------------------------------------
      // Mode A: the FIRST violation (the carrier) is disabled
      {
        code: `import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('beta') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};`,
      },
      // Mode B: the LAST violation is disabled, so the surviving carrier must
      // not rename away the specifier the suppressed call still resolves to
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('alpha') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useCallback(() => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
      },
      // Mode B: a MIDDLE violation is disabled
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => 1, []);
  const gamma = useMemo(() => () => 2, []);
  return [alpha, beta, gamma];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('alpha') },
          },
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('gamma') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useCallback(() => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => 1, []);
  const gamma = useCallback(() => 2, []);
  return [alpha, beta, gamma];
};`,
      },
      // Issue #1411: a bare disable suppresses this rule as well
      {
        code: `import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('beta') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  // eslint-disable-next-line
  const alpha = useMemo(() => () => {}, []);
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: a disable naming another rule must not suppress, so the
      // rename stays the fix
      {
        code: `import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line no-console
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('alpha') },
          },
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('beta') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  // eslint-disable-next-line no-console
  const alpha = useCallback(() => {}, []);
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: useCallback already imported, so a suppressed violation
      // only has to block the removal of useMemo — no duplicate specifier
      {
        code: `import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('alpha') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useCallback(() => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: an aliased useCallback import is reused while the
      // suppressed call keeps useMemo
      {
        code: `import { useMemo, useCallback as uc } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('alpha') },
          },
        ],
        output: `import { useMemo, useCallback as uc } from 'react';
const C = () => {
  const alpha = uc(() => {}, []);
  // eslint-disable-next-line prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
      },
      // Issue #1411: a block disable/enable pair suppresses the violations it
      // brackets, and the survivor outside it carries the added specifier
      {
        code: `import { useMemo } from 'react';
const C = () => {
  /* eslint-disable prefer-usecallback-over-usememo-for-functions */
  const alpha = useMemo(() => () => {}, []);
  /* eslint-enable prefer-usecallback-over-usememo-for-functions */
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('beta') },
          },
        ],
        output: `import { useMemo, useCallback } from 'react';
const C = () => {
  /* eslint-disable prefer-usecallback-over-usememo-for-functions */
  const alpha = useMemo(() => () => {}, []);
  /* eslint-enable prefer-usecallback-over-usememo-for-functions */
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};`,
      },
      // ------------------------------------------------------------------
      // Issue #1447: unwrapping the outer callback collapses the text around
      // the returned function. Every comment in that text has to come back out
      // on the line it occupied, because a directive whose line survives the
      // rewrite must keep governing the same line.
      // ------------------------------------------------------------------
      // Issue #1447: the reproduction — a directive between the returned
      // function and the dependency array
      {
        code: `import { useMemo } from 'react';
function Component() {
  const handleClick = useMemo(() => {
    return () => {
      console.log('Button clicked');
    };
  // eslint-disable-next-line no-console
  }, []);
  return <button onClick={handleClick}>Click me</button>;
}`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('handleClick') },
          },
        ],
        output: `import { useCallback } from 'react';
function Component() {
  const handleClick = useCallback(
    () => {
      console.log('Button clicked');
    },
    // eslint-disable-next-line no-console
    [],
  );
  return <button onClick={handleClick}>Click me</button>;
}`,
      },
      // Issue #1447: a comment inside the returned function is untouched text,
      // and must stay that way
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {
      // keep this note
      doWork();
    };
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {
    // keep this note
    doWork();
  }, []);
  return cb;
};`,
      },
      // Issue #1447: a comment between `return` and the function it returns
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return /* keep me */ () => {};
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(/* keep me */ () => {}, []);
  return cb;
};`,
      },
      // Issue #1447: a directive on its own line inside the outer callback
      // survives even though the `return` it governed is what gets collapsed —
      // an unused directive is visible to --report-unused-disable-directives,
      // whereas a dropped one silently stops suppressing
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    // eslint-disable-next-line consistent-return
    return () => {};
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    // eslint-disable-next-line consistent-return
    () => {},
    [],
  );
  return cb;
};`,
      },
      // Issue #1447: blank lines around a directive are kept, so the line it
      // governs after the rewrite is the line it governed before
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {};

    // eslint-disable-next-line no-console
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    () => {},

    // eslint-disable-next-line no-console
    [],
  );
  return cb;
};`,
      },
      // Issue #1447: comments in both collapsed spans at once
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    // before
    return () => {};
    // after
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    // before
    () => {},
    // after
    [],
  );
  return cb;
};`,
      },
      // Issue #1447: a comment trailing the returned function on its own line
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {}; // tail
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    () => {}, // tail
    [],
  );
  return cb;
};`,
      },
      // ------------------------------------------------------------------
      // Issue #2091: unwrapping removes a level of nesting, so the relocated
      // function has to be re-indented to the depth it lands at, and a comment
      // that cannot share a line with the code beside it forces the argument
      // list open. Both shapes are what a formatter prints, so `--fix` output
      // is not rewritten the moment the formatter runs over it.
      // ------------------------------------------------------------------
      // Issue #2091: the body is dedented by the level the unwrap removes, at a
      // depth no fixed indent could produce
      {
        code: `import { useMemo } from 'react';
function Outer() {
  if (ready) {
    const cb = useMemo(() => {
      return () => {
        doWork();
      };
    }, []);
    return cb;
  }
}`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
function Outer() {
  if (ready) {
    const cb = useCallback(() => {
      doWork();
    }, []);
    return cb;
  }
}`,
      },
      // Issue #2091: the broken-open argument list is indented from the call's
      // own line, so it holds at any depth
      {
        code: `import { useMemo } from 'react';
function Outer() {
  if (ready) {
    const cb = useMemo(() => {
      return () => {}; // tail
    }, []);
    return cb;
  }
}`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
function Outer() {
  if (ready) {
    const cb = useCallback(
      () => {}, // tail
      [],
    );
    return cb;
  }
}`,
      },
      // Issue #2091: the supplied dependency array joins the broken-open list
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {}; // tail
  });
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    () => {}, // tail
    [],
  );
  return cb;
};`,
      },
      // Issue #2091: a real dependency array survives the dedent unchanged
      {
        code: `import { useMemo } from 'react';
const C = ({ id }) => {
  const cb = useMemo(() => {
    return () => {
      doWork(id);
    };
  }, [id]);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = ({ id }) => {
  const cb = useCallback(() => {
    doWork(id);
  }, [id]);
  return cb;
};`,
      },
      // Issue #2091: the interior of a multi-line template literal is the
      // string's value, so the dedent must not reach into it
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {
      log(\`line one
line two\`);
    };
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(() => {
    log(\`line one
line two\`);
  }, []);
  return cb;
};`,
      },
      // Issue #2091: a call already broken open lands the function on the
      // callback's own line, so that line's depth is the reference
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(
    // why
    () => {
      return () => {
        doWork();
      };
    },
    [],
  );
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    // why
    () => {
      doWork();
    },
    [],
  );
  return cb;
};`,
      },
      // Issue #2091: a block comment spanning lines cannot be printed inline
      // either, so it breaks the list open as a `//` comment does — and its own
      // continuation line is text the fixer does not own
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    /* keep
       me */
    return () => {};
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    /* keep
       me */
    () => {},
    [],
  );
  return cb;
};`,
      },
      // Issue #2091: a comment in each collapsed span, with the trailing one
      // keeping the line it shared with the returned function
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    // before
    return () => {
      doWork();
    }; // tail
  }, []);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback(
    // before
    () => {
      doWork();
    }, // tail
    [],
  );
  return cb;
};`,
      },
      // Issue #2091: a conversion inside a JSX attribute is re-indented from
      // the line the call opens on, not from the statement's
      {
        code: `import { useMemo } from 'react';
const C = () => (
  <button
    onClick={useMemo(() => {
      return () => {
        doWork();
      };
    }, [])}
  />
);`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: 'the "onClick" prop callback' },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => (
  <button
    onClick={useCallback(() => {
      doWork();
    }, [])}
  />
);`,
      },
      // Issue #1447: the implicit-return shape carries its comment too
      {
        code: `import { useMemo } from 'react';
const C = () => { const cb = useMemo(() => /* inner */ () => {}, []); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => { const cb = useCallback(/* inner */ () => {}, []); return cb; };`,
      },
      // Issue #1447: text outside the collapsed spans — around the callee, the
      // dependency array and the closing paren — is never re-emitted, so it
      // stays byte-identical
      {
        code: `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo /* memoize */ (() => () => {}, /* stable */ [] /* deps */);
  return cb;
};`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => {
  const cb = useCallback /* memoize */ (() => {}, /* stable */ [] /* deps */);
  return cb;
};`,
      },
      // Issue #1447: a missing dependency array is still supplied by the fix
      {
        code: `import { useMemo } from 'react';
const C = () => { const cb = useMemo(() => () => {}); return cb; };`,
        errors: [
          {
            messageId: 'preferUseCallback',
            data: { callbackDescription: callbackDescription('cb') },
          },
        ],
        output: `import { useCallback } from 'react';
const C = () => { const cb = useCallback(() => {}, []); return cb; };`,
      },
    ]),
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

// Issue #1411: RuleTester applies a single fix pass and never shows the file
// `eslint --fix` actually writes. These cases run the real multi-pass fixer and
// assert the invariant the bug violated: every hook call left in the output
// resolves to a specifier that is still in the import list.
describe('prefer-usecallback-over-usememo-for-functions: inline disables and the import rename (issue #1411)', () => {
  const RULE_ID =
    '@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      preferUseCallbackOverUseMemoForFunctions as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // prefix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/prefer-usecallback-over-usememo', {
      meta: { schema: [] },
      create: () => ({}),
    } as unknown as Rule.RuleModule);
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    return linter.verifyAndFix(code, config, 'Component.tsx');
  };

  /** Local names bound by every braced import in the file. */
  const importedLocals = (output: string) => {
    const locals = new Set<string>();
    const importPattern = /import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from/g;
    let match: RegExpExecArray | null = importPattern.exec(output);
    while (match !== null) {
      for (const entry of match[1].split(',')) {
        const parts = entry.trim().split(/\s+as\s+/);
        const local = (parts[1] ?? parts[0]).trim();
        if (local !== '') {
          locals.add(local);
        }
      }
      match = importPattern.exec(output);
    }
    return locals;
  };

  const expectEveryHookCallBound = (output: string) => {
    const locals = importedLocals(output);
    const callPattern = /\b(useMemo|useCallback|uc)\s*(?:<[^>]*>)?\(/g;
    const called = new Set<string>();
    let match: RegExpExecArray | null = callPattern.exec(output);
    while (match !== null) {
      called.add(match[1]);
      match = callPattern.exec(output);
    }
    expect(called.size).toBeGreaterThan(0);
    for (const name of called) {
      expect([...locals]).toContain(name);
    }
  };

  it('adds useCallback alongside useMemo when the carrier is suppressed', () => {
    const { output, messages } = lint(`import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);

    expect(output).toBe(`import { useMemo, useCallback } from 'react';
const C = () => {
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};
`);
    expect(messages).toHaveLength(0);
    expectEveryHookCallBound(output);
  });

  it('keeps useMemo imported when a later violation is suppressed', () => {
    const { output, messages } = lint(`import { useMemo } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);

    expect(output).toBe(`import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useCallback(() => {}, []);
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);
    expect(messages).toHaveLength(0);
    expectEveryHookCallBound(output);
  });

  it('binds every hook when a middle violation is suppressed', () => {
    const { output } = lint(`import { useMemo } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => 1, []);
  const gamma = useMemo(() => () => 2, []);
  return [alpha, beta, gamma];
};
`);

    expect(output).toContain(`import { useMemo, useCallback } from 'react';`);
    expect(output).toContain('const beta = useMemo(() => () => 1, []);');
    expect(output).toContain('const gamma = useCallback(() => 2, []);');
    expectEveryHookCallBound(output);
  });

  it('leaves the file untouched when every violation is suppressed', () => {
    const code = `import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`;

    const { output, messages } = lint(code);

    expect(output).toBe(code);
    expect(messages).toHaveLength(0);
    expect(output).not.toContain('useCallback');
  });

  it('leaves the file untouched under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions */
import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  return cb;
};
`;

    const { output } = lint(code);

    expect(output).toBe(code);
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const { output, messages } = lint(`import { useMemo } from 'react';
const C = () => {
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo
  const alpha = useMemo(() => () => {}, []);
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);

    expect(output).toBe(`import { useCallback } from 'react';
const C = () => {
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo
  const alpha = useCallback(() => {}, []);
  const beta = useCallback(() => {}, []);
  return [alpha, beta];
};
`);
    expect(messages).toHaveLength(0);
    expectEveryHookCallBound(output);
  });

  it('adds no duplicate specifier when useCallback is already imported', () => {
    const { output } = lint(`import { useMemo, useCallback } from 'react';
const C = () => {
  const alpha = useMemo(() => () => {}, []);
  // eslint-disable-next-line @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);

    expect(output).toContain(`import { useMemo, useCallback } from 'react';`);
    expect(output.match(/useCallback/g)).toHaveLength(2);
    expectEveryHookCallBound(output);
  });

  // Issue #1440: the multi-pass fixer is the only place a stranded identifier is
  // visible, since RuleTester stops after one pass. Every case here must leave
  // the file byte-identical while still reporting.
  it('leaves an unknown-module useMemo alone', () => {
    const code = `import useMemo from './use-memo';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };
`;

    const { output, messages } = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('useCallback');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe(RULE_ID);
  });

  it('leaves a named useMemo from an unknown module alone', () => {
    const code = `import { useMemo } from '../hooks';
const C = () => { const cb = useMemo(() => () => {}, []); return cb; };
`;

    const { output, messages } = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('useCallback');
    expect(messages).toHaveLength(1);
  });

  it('does not reuse a useCallback imported from an unknown module', () => {
    const code = `import { useMemo } from 'react';
import { useCallback } from '../hooks';
const C = () => {
  const cb = useMemo(() => () => {}, []);
  const other = useCallback(() => {}, []);
  return [cb, other];
};
`;

    const { output, messages } = lint(code);

    expect(output).toBe(code);
    expect(messages).toHaveLength(1);
  });

  it('keeps a directive that governs a line the rewrite preserves', () => {
    const { output } = lint(`import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    // eslint-disable-next-line no-console
    return () => console.log('x');
  }, []);
  return cb;
};
`);

    expect(output).toContain('// eslint-disable-next-line no-console');
  });

  it('keeps the import usable when only the last violation survives a block disable', () => {
    const { output } = lint(`import { useMemo } from 'react';
const C = () => {
  /* eslint-disable @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions */
  const alpha = useMemo(() => () => {}, []);
  /* eslint-enable @blumintinc/blumint/prefer-usecallback-over-usememo-for-functions */
  const beta = useMemo(() => () => {}, []);
  return [alpha, beta];
};
`);

    expect(output).toContain(`import { useMemo, useCallback } from 'react';`);
    expect(output).toContain('const alpha = useMemo(() => () => {}, []);');
    expect(output).toContain('const beta = useCallback(() => {}, []);');
    expectEveryHookCallBound(output);
  });
});

// Issue #1447: a directive destroyed by a fix changes which rules report, which
// only a second rule can demonstrate. These cases lint with `no-console` enabled
// beside this rule and assert the suppression the file started with still holds
// after `--fix`.
describe('prefer-usecallback-over-usememo-for-functions: directives survive the unwrap (issue #1447)', () => {
  const RULE_ID =
    '@blumintinc/blumint/prefer-usecallback-over-usememo-for-functions';

  const lintWithNoConsole = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
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
        [RULE_ID]: 'error' as const,
        'no-console': 'error' as const,
      },
    };
    return linter.verifyAndFix(code, config, 'Component.tsx');
  };

  it('keeps no-console suppressed when the directive sits above the returned function', () => {
    const code = `import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    // eslint-disable-next-line no-console
    return () => console.log('x');
  }, []);
  return cb;
};
`;

    const { output, messages } = lintWithNoConsole(code);

    expect(output).toContain('// eslint-disable-next-line no-console');
    expect(output).toContain("console.log('x')");
    expect(messages).toHaveLength(0);
  });

  it('keeps no-console suppressed when the directive trails the returned function', () => {
    const { output, messages } =
      lintWithNoConsole(`import { useMemo } from 'react';
const C = () => {
  const cb = useMemo(() => {
    return () => {
      // eslint-disable-next-line no-console
      console.log('x');
    };
  }, []);
  return cb;
};
`);

    expect(output).toContain('// eslint-disable-next-line no-console');
    expect(messages).toHaveLength(0);
  });
});
