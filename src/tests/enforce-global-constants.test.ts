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
    // A literal closing over a prop with that prop declared stays clean
    `
    function Component({ delay }) {
      const options = useMemo(() => ({ debounce: delay }), [delay]);
      return <div>{options.debounce}</div>;
    }
    `,
    // Declared dependencies stay clean for an array of object literals too
    `
    function Component({ id }) {
      const rows = useMemo(() => [{ id }, { id: id + 1 }], [id]);
      return <div>{rows.length}</div>;
    }
    `,
    // A dependency array holding a member expression is still a declaration
    `
    function Component(props) {
      const options = useMemo(() => ({ debounce: props.delay }), [props.delay]);
      return <div>{options.debounce}</div>;
    }
    `,
  ],
  invalid: [
    // A shebang has to stay at character 0 or the file stops parsing
    // (TS18026). With no import to anchor to, the hoisted constants used to be
    // spliced in ahead of it.
    {
      code: `#!/usr/bin/env node

const Comp = () => {
  const [a = {x:1}, b = 2] = arr;
  return <div/>;
};
`,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
      output: `#!/usr/bin/env node

const DEFAULT_A = {x:1} as const;

const DEFAULT_B = 2 as const;


const Comp = () => {
  const [a = DEFAULT_A, b = DEFAULT_B] = arr;
  return <div/>;
};
`,
    },
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
    // --- Negative controls: a literal closing over NOTHING is hoistable, so the
    // hoisting advice must survive the narrowing. ---
    // Nested object literal reading only inline values
    {
      code: `
      const MyComponent = () => {
        const theme = useMemo(() => ({
          palette: { primary: '#fff', secondary: '#000' },
          spacing: [4, 8, 16],
        }), []);

        return <div>{theme.spacing.length}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // Array literal of object literals reading only inline values
    {
      code: `
      const MyComponent = () => {
        const rows = useMemo(() => [{ id: 1 }, { id: 2 }], []);
        return <div>{rows.length}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // as const assertion over a fully static literal
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(() => ({ debounce: 500 }) as const, []);
        return <div>{options.debounce}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // A literal reading only bindings CREATED BY the callback is hoistable:
    // those names travel with the literal.
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(() => {
          const inner = { a: 1 };
          return { inner };
        }, []);
        return <div>{options.inner.a}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // The subtle boundary: an IMPORTED constant is module scope, not render
    // scope, so the literal still hoists verbatim beside it.
    {
      code: `
      import { DEBOUNCE_MS } from './constants';

      const MyComponent = () => {
        const options = useMemo(() => ({ debounce: DEBOUNCE_MS }), []);
        return <div>{options.debounce}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // A module-level const declared in the same file is equally visible from
    // module scope
    {
      code: `
      const DEBOUNCE_MS = 500;

      const MyComponent = () => {
        const options = useMemo(() => ({ debounce: DEBOUNCE_MS }), []);
        return <div>{options.debounce}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // An ambient global resolves to nothing in the file and exists at module
    // scope too
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(() => ({ ratio: Math.PI }), []);
        return <div>{options.ratio}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // A local TYPE referenced by an assertion erases at compile time, so it
    // neither blocks hoisting nor belongs in a dependency array
    {
      code: `
      const MyComponent = () => {
        type Options = { debounce: number };
        const options = useMemo(() => ({ debounce: 500 } as Options), []);
        return <div>{options.debounce}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // A name shadowed inside the callback resolves to the callback's own
    // binding, not the same-named prop
    {
      code: `
      function Component({ delay }) {
        const options = useMemo(() => {
          const delay = 500;
          return { debounce: delay };
        }, []);
        return <div>{options.debounce}</div>;
      }
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // The callback's own parameter is created per call, not closed over
    {
      code: `
      const MyComponent = () => {
        const options = useMemo(function (arg) {
          return { arg };
        }, []);
        return <div>{options.arg}</div>;
      };
      `,
      errors: [{ messageId: 'useGlobalConstant' }],
    },
    // --- The narrowed branch: a literal closing over a render-scope value
    // cannot be hoisted, so the remedy named is the omitted dependency. ---
    // Destructured prop
    {
      code: `
      function Component({ delay }) {
        const options = useMemo(() => ({ debounce: delay }), []);
        return <div>{options.debounce}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'delay' },
        },
      ],
    },
    // A member read off the whole props object
    {
      code: `
      function Component(props) {
        const options = useMemo(() => ({ debounce: props.delay }), []);
        return <div>{options.debounce}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'props' },
        },
      ],
    },
    // A useState value
    {
      code: `
      const MyComponent = () => {
        const [count, setCount] = useState(0);
        const options = useMemo(() => ({ count }), []);
        return <div onClick={() => setCount(count + 1)}>{options.count}</div>;
      };
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'count' },
        },
      ],
    },
    // Another hook's result
    {
      code: `
      const MyComponent = () => {
        const theme = useTheme();
        const options = useMemo(() => ({ theme }), []);
        return <div>{options.theme}</div>;
      };
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'theme' },
        },
      ],
    },
    // A variable declared in the component body
    {
      code: `
      const MyComponent = ({ items }) => {
        const total = items.length;
        const options = useMemo(() => ({ total }), []);
        return <div>{options.total}</div>;
      };
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'total' },
        },
      ],
    },
    // The callback, not the literal, is the unit of analysis: a callback-local
    // computed from a prop must name the PROP, which is the only name a
    // dependency array can hold.
    {
      code: `
      function Component({ delay }) {
        const options = useMemo(() => {
          const debounce = delay * 2;
          return { debounce };
        }, []);
        return <div>{options.debounce}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'delay' },
        },
      ],
    },
    // A closure buried in a property value closes over render scope just as a
    // property value does
    {
      code: `
      function Component({ id }) {
        const handle = useHandler();
        const options = useMemo(() => ({ onClick: () => handle(id) }), []);
        return <div {...options} />;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'handle' },
        },
      ],
    },
    // An array of object literals closing over a prop
    {
      code: `
      function Component({ id }) {
        const rows = useMemo(() => [{ id }, { id: 2 }], []);
        return <div>{rows.length}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'id' },
        },
      ],
    },
    // as const does not change which branch applies
    {
      code: `
      function Component({ delay }) {
        const options = useMemo(() => ({ debounce: delay }) as const, []);
        return <div>{options.debounce}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'delay' },
        },
      ],
    },
    // The name reported is the first in SOURCE order, not in scope-walk order
    {
      code: `
      function Component({ alpha, beta }) {
        const options = useMemo(() => ({ a: alpha, b: beta }), []);
        return <div>{options.a}</div>;
      }
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'alpha' },
        },
      ],
    },
    // A block-bodied callback returning a literal that closes over render scope
    {
      code: `
      const MyComponent = ({ disconnectOnPageLeave }) => {
        const roomOptions = useMemo(() => {
          return {
            disconnectOnPageLeave,
          } as const;
        }, []);
        return <div>{roomOptions.disconnectOnPageLeave}</div>;
      };
      `,
      errors: [
        {
          messageId: 'declareMemoDependency',
          data: { name: 'disconnectOnPageLeave' },
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
    // A module-scope const with an identical initializer is reused without redeclaring
    {
      code: `
      const DEFAULT_DEBOUNCE_MS = 10 as const;
      export const useThing = (props) => {
        const { debounceMs = 10 } = props;
        return debounceMs;
      };
      `,
      output: `
      const DEFAULT_DEBOUNCE_MS = 10 as const;
      export const useThing = (props) => {
        const { debounceMs = DEFAULT_DEBOUNCE_MS } = props;
        return debounceMs;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Reuse also applies when the existing const omits the as const assertion
    {
      code: `
      const DEFAULT_SIZE = 20;
      const Comp = () => {
        const { size = 20 } = props;
        return size;
      };
      `,
      output: `
      const DEFAULT_SIZE = 20;
      const Comp = () => {
        const { size = DEFAULT_SIZE } = props;
        return size;
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Repro 1: a module-scope const with a different value must not be reused
    {
      code: `
      const DEFAULT_DEBOUNCE_MS = 500 as const;
      export const useThing = (props) => {
        const { debounceMs = 10 } = props;
        return debounceMs;
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Repro 2: a same-named let is a collision, not an absent binding
    {
      code: `
      let DEFAULT_DEBOUNCE_MS = 500;
      export const useThing = (props) => {
        const { debounceMs = 10 } = props;
        return debounceMs;
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Repro 3: an inner-scope binding would capture the emitted reference
    {
      code: `
      export const useThing = (props) => {
        const DEFAULT_DEBOUNCE_MS = 999;
        const { debounceMs = 10 } = props;
        return [debounceMs, DEFAULT_DEBOUNCE_MS];
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // A shadow in an enclosing block scope also declines the fix
    {
      code: `
      export const useThing = (props) => {
        if (props.enabled) {
          const DEFAULT_DEBOUNCE_MS = 999;
          const { debounceMs = 10 } = props;
          return [debounceMs, DEFAULT_DEBOUNCE_MS];
        }
        return null;
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // An imported binding of the generated name declines the fix
    {
      code: `
      import { DEFAULT_SIZE } from './constants';

      const Comp = () => {
        const { size = 20 } = props;
        return [size, DEFAULT_SIZE];
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // A function declaration owning the generated name declines the fix
    {
      code: `
      function DEFAULT_SIZE() {
        return 1;
      }
      const Comp = () => {
        const { size = 20 } = props;
        return size;
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // A class declaration owning the generated name declines the fix
    {
      code: `
      class DEFAULT_SIZE {}
      const Comp = () => {
        const { size = 20 } = props;
        return size;
      };
      `,
      output: null,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Two locals normalizing to one generated name: the second value would
    // redeclare the binding, so only the first is extracted
    {
      code: `
      const Comp = () => {
        const { aB = 1, a_b = 2 } = props;
        return [aB, a_b];
      };
      `,
      output: `
const DEFAULT_A_B = 1 as const;


      const Comp = () => {
        const { aB = DEFAULT_A_B, a_b = 2 } = props;
        return [aB, a_b];
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // Same generated name with the same value shares a single declaration
    {
      code: `
      const Comp = () => {
        const { aB = 1, a_b = 1 } = props;
        return [aB, a_b];
      };
      `,
      output: `
const DEFAULT_A_B = 1 as const;


      const Comp = () => {
        const { aB = DEFAULT_A_B, a_b = DEFAULT_A_B } = props;
        return [aB, a_b];
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
    // A declined default must not suppress the fix for its safe siblings
    {
      code: `
      let DEFAULT_DEBOUNCE_MS = 500;
      export const useThing = (props) => {
        const { debounceMs = 10, retries = 3 } = props;
        return [debounceMs, retries];
      };
      `,
      output: `
const DEFAULT_RETRIES = 3 as const;


      let DEFAULT_DEBOUNCE_MS = 500;
      export const useThing = (props) => {
        const { debounceMs = 10, retries = DEFAULT_RETRIES } = props;
        return [debounceMs, retries];
      };
      `,
      errors: [{ messageId: 'extractDefaultToGlobalConstant' }],
    },
  ],
});
