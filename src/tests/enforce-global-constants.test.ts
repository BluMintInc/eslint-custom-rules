import { ruleTesterJsx } from '../utils/ruleTester';
import { enforceGlobalConstants } from '../rules/enforce-global-constants';

ruleTesterJsx.run('enforce-global-constants', enforceGlobalConstants, {
  valid: [
    // Global constants are valid
    `
    const ROOM_OPTIONS = { disconnectOnPageLeave: true } as const;

    const MyComponent = () => {
      return (
        <div>
          {Object.entries(ROOM_OPTIONS).map(([key, option]) => (
            <Option key={key} label={option.label} icon={option.icon} />
          ))}
        </div>
      );
    };
    `,
    // useMemo with dependencies is valid
    `
    const MyComponent = () => {
      const roomOptions = useMemo(() => {
        return {
          disconnectOnPageLeave: true,
        } as const;
      }, [someValue]);

      return (
        <div>
          {Object.entries(roomOptions).map(([key, option]) => (
            <Option key={key} label={option.label} icon={option.icon} />
          ))}
        </div>
      );
    };
    `,
    // useMemo with computationally expensive operations is valid
    `
    const MyComponent = () => {
      const expensiveComputation = useMemo(() => {
        let result = 0;
        for (let i = 0; i < 1000; i++) {
          result += someComplexCalculation(i);
        }
        return result;
      }, []);

      return <div>{expensiveComputation}</div>;
    };
    `,
    // Destructuring defaults that depend on identifiers should not be auto-extracted
    `
    const MyComponent = () => {
      const base = { a: 1 };
      const { options = base } = props;
      return <div/>;
    };
    `,
    // Non component scope destructuring defaults are valid
    `
    function helper() {
      const { threshold = 5 } = config;
      return threshold;
    }
    `,
    // Hook with no defaults
    `
    export const useSomething = ({ a, b }: { a?: number; b?: number }) => {
      const { a: a1, b: b1 } = { a, b };
      return { a1, b1 };
    };
    `,
  ],
  invalid: [
    // useMemo with empty dependency array returning object literal
    {
      code: `
      const MyComponent = () => {
        const roomOptions = useMemo(() => {
          return {
            disconnectOnPageLeave: true,
          } as const;
        }, []);

        return (
          <div>
            {Object.entries(roomOptions).map(([key, option]) => (
              <Option key={key} label={option.label} icon={option.icon} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
    // useMemo with empty dependency array and implicit return of object literal
    {
      code: `
      const MyComponent = () => {
        const roomOptions = useMemo(() => ({
          disconnectOnPageLeave: true,
        }), []);

        return (
          <div>
            {Object.entries(roomOptions).map(([key, option]) => (
              <Option key={key} label={option.label} icon={option.icon} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
    // useMemo with empty dependency array returning array of object literals
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(() => [
          { id: 1, label: 'Option 1' },
          { id: 2, label: 'Option 2' },
        ], []);

        return (
          <div>
            {options.map(option => (
              <Option key={option.id} label={option.label} />
            ))}
          </div>
        );
      };
      `,
      errors: [
        {
          messageId: 'useGlobalConstant',
        },
      ],
    },
    // Extract object default from destructuring in component
    {
      code: `
export const useQuerySelector = <TElement extends HTMLElement>({
  query,
  ...options
}: UseQuerySelectorProps) => {
  const {
    root,
    observeOptions = { childList: true, subtree: true },
    debounceMs = 10,
    shouldStopOnFound = false,
  } = options;
  return { root, observeOptions, debounceMs, shouldStopOnFound };
};
      `,
      output: `
const DEFAULT_OBSERVE_OPTIONS = { childList: true, subtree: true } as const;

const DEFAULT_DEBOUNCE_MS = 10 as const;
const DEFAULT_SHOULD_STOP_ON_FOUND = false as const;


export const useQuerySelector = <TElement extends HTMLElement>({
  query,
  ...options
}: UseQuerySelectorProps) => {
  const {
    root,
    observeOptions = DEFAULT_OBSERVE_OPTIONS,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    shouldStopOnFound = DEFAULT_SHOULD_STOP_ON_FOUND,
  } = options;
  return { root, observeOptions, debounceMs, shouldStopOnFound };
};
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Extract array default and primitive defaults
    {
      code: `
      const MyComponent = () => {
        const { list = [1,2,3], size = 20, flag = true } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_LIST = [1,2,3] as const;

const DEFAULT_SIZE = 20 as const;
const DEFAULT_FLAG = true as const;


      const MyComponent = () => {
        const { list = DEFAULT_LIST, size = DEFAULT_SIZE, flag = DEFAULT_FLAG } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Should skip defaults that reference identifiers, but still extract static ones
    {
      code: `
      const MyComponent = () => {
        const base = { a: 1 };
        const { a = base.a, b = 2, c = { x: 1 } } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_B = 2 as const;

const DEFAULT_C = { x: 1 } as const;


      const MyComponent = () => {
        const base = { a: 1 };
        const { a = base.a, b = DEFAULT_B, c = DEFAULT_C } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Nested destructuring with defaults
    {
      code: `
      function MyComponent(){
        const { a: { x = 1 }, b = { y: 2 } } = props;
        return <div/>;
      }
      `,
      output: `
const DEFAULT_X = 1 as const;

const DEFAULT_B = { y: 2 } as const;


      function MyComponent(){
        const { a: { x = DEFAULT_X }, b = DEFAULT_B } = props;
        return <div/>;
      }
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Defaults inside hooks
    {
      code: `
      export const useThing = ({ opts, n }: { opts?: any; n?: number }) => {
        const { opts: options = { stable: true }, n: count = 3 } = { opts, n };
        return { options, count };
      };
      `,
      output: `
const DEFAULT_OPTIONS = { stable: true } as const;

const DEFAULT_COUNT = 3 as const;


      export const useThing = ({ opts, n }: { opts?: any; n?: number }) => {
        const { opts: options = DEFAULT_OPTIONS, n: count = DEFAULT_COUNT } = { opts, n };
        return { options, count };
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Multiple declarations in one statement
    {
      code: `
      const MyComponent = () => {
        const { a = 1 } = props, { b = { z: 9 } } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_A = 1 as const;

const DEFAULT_B = { z: 9 } as const;


      const MyComponent = () => {
        const { a = DEFAULT_A } = props, { b = DEFAULT_B } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Insert after directive prologue
    {
      code: `
      'use client';

      const C = () => {
        const { a = { k: 1 } } = props;
        return <div/>;
      };
      `,
      output: `
      'use client';
const DEFAULT_A = { k: 1 } as const;

const C = () => {
        const { a = DEFAULT_A } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Insert after imports
    {
      code: `
      import React from 'react';
      import x from './x';

      const C = () => {
        const { a = [1,2], b = 'hi' } = props;
        return <div/>;
      };
      `,
      output: `
      import React from 'react';
      import x from './x';
const DEFAULT_A = [1,2] as const;

const DEFAULT_B = 'hi' as const;

const C = () => {
        const { a = DEFAULT_A, b = DEFAULT_B } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Reuse existing constant if present
    {
      code: `
      const DEFAULT_FLAG = false as const;
      const C = () => {
        const { ok = false, flag = DEFAULT_FLAG } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_OK = false as const;


      const DEFAULT_FLAG = false as const;
      const C = () => {
        const { ok = DEFAULT_OK, flag = DEFAULT_FLAG } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // ArrayPattern defaults
    {
      code: `
      const Comp = () => {
        const [a = {x:1}, b = 2] = arr;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_A = {x:1} as const;

const DEFAULT_B = 2 as const;


      const Comp = () => {
        const [a = DEFAULT_A, b = DEFAULT_B] = arr;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Aliased property names
    {
      code: `
      const Comp = () => {
        const { longPropertyName: lp = { deep: true } } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_LP = { deep: true } as const;


      const Comp = () => {
        const { longPropertyName: lp = DEFAULT_LP } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Inline as const should not duplicate as const
    {
      code: `
      const Comp = () => {
        const { conf = ({ a: 1 } as const) } = props;
        return <div/>;
      };
      `,
      output: `
const DEFAULT_CONF = { a: 1 } as const;


      const Comp = () => {
        const { conf = (DEFAULT_CONF) } = props;
        return <div/>;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
  ],
});
