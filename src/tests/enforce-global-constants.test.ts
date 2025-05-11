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
    // Default values that are already extracted to constants are valid
    `
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

      return null;
    };
    `,
    // Simple primitive default values without 'as const' are valid
    `
    export const useQuerySelector = <TElement extends HTMLElement>({
      query,
      ...options
    }: UseQuerySelectorProps) => {
      const {
        root,
        debounceMs = 10,
        shouldStopOnFound = false,
      } = options;

      return null;
    };
    `,
    // Non-component functions with default values are valid
    `
    function regularFunction({ value = { test: true } }) {
      return value;
    }
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
    // Default object values in component function destructuring
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

        return null;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_OBSERVE_OPTIONS = { childList: true, subtree: true } as const;
export const useQuerySelector = <TElement extends HTMLElement>({
        query,
        ...options
      }: UseQuerySelectorProps) => {
        const {
          root,
          observeOptions = DEFAULT_OBSERVE_OPTIONS,
          debounceMs = 10,
          shouldStopOnFound = false,
        } = options;

        return null;
      };
      `,
    },
    // Default values with 'as const' in component function destructuring
    {
      code: `
      export const useQuerySelector = <TElement extends HTMLElement>({
        query,
        ...options
      }: UseQuerySelectorProps) => {
        const {
          root,
          observeOptions = { childList: true, subtree: true } as const,
          debounceMs = 10 as const,
          shouldStopOnFound = false as const,
        } = options;

        return null;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_OBSERVE_OPTIONS = { childList: true, subtree: true } as const as const;
export const useQuerySelector = <TElement extends HTMLElement>({
        query,
        ...options
      }: UseQuerySelectorProps) => {
        const {
          root,
          observeOptions = DEFAULT_OBSERVE_OPTIONS,
          debounceMs = 10 as const,
          shouldStopOnFound = false as const,
        } = options;

        return null;
      };
      `,
    },
    // Default array values in component function destructuring
    {
      code: `
      const MyComponent = () => {
        const { items = [{ id: 1 }, { id: 2 }] } = props;
        return items.map(item => <div key={item.id}>{item.id}</div>);
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_ITEMS = [{ id: 1 }, { id: 2 }] as const;
const MyComponent = () => {
        const { items = DEFAULT_ITEMS } = props;
        return items.map(item => <div key={item.id}>{item.id}</div>);
      };
      `,
    },
    // Default values in React component function
    {
      code: `
      function MyComponent({ config = { theme: 'dark', animate: true } }) {
        return <div className={config.theme}>{config.animate ? 'Animated' : 'Static'}</div>;
      }
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'dark', animate: true } as const;
function MyComponent({ config = DEFAULT_CONFIG }) {
        return <div className={config.theme}>{config.animate ? 'Animated' : 'Static'}</div>;
      }
      `,
    },
    // Default values in custom hook
    {
      code: `
      export const useCustomHook = ({
        delay = 300,
        options = { retries: 3, timeout: 1000 }
      }) => {
        // Hook implementation
        return null;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_OPTIONS = { retries: 3, timeout: 1000 } as const;
export const useCustomHook = ({
        delay = 300,
        options = DEFAULT_OPTIONS
      }) => {
        // Hook implementation
        return null;
      };
      `,
    },
  ],
});
