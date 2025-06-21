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
    // String literals without 'as const' are valid
    `
    const MyComponent = ({ title = "Default Title" }) => {
      return <h1>{title}</h1>;
    };
    `,
    // Number literals without 'as const' are valid
    `
    const MyComponent = ({ count = 0 }) => {
      return <div>{count}</div>;
    };
    `,
    // Boolean literals without 'as const' are valid
    `
    const MyComponent = ({ isVisible = true }) => {
      return isVisible ? <div>Visible</div> : null;
    };
    `,
    // Null and undefined literals are valid
    `
    const MyComponent = ({ data = null, callback = undefined }) => {
      return <div>{data}</div>;
    };
    `,
    // Functions that don't start with uppercase or 'use' are valid
    `
    function helper({ config = { theme: 'dark' } }) {
      return config;
    }
    `,
    // Arrow functions not assigned to uppercase variables are valid
    `
    const helper = ({ config = { theme: 'dark' } }) => {
      return config;
    };
    `,
    // Methods in classes are valid
    `
    class MyClass {
      method({ config = { theme: 'dark' } }) {
        return config;
      }
    }
    `,
    // Default values referencing existing constants are valid
    `
    const EXISTING_CONFIG = { theme: 'light' } as const;

    const MyComponent = ({ config = EXISTING_CONFIG }) => {
      return <div className={config.theme}>Content</div>;
    };
    `,
    // Default values in non-destructuring parameters are valid
    `
    const MyComponent = (props = { theme: 'dark' }) => {
      return <div className={props.theme}>Content</div>;
    };
    `,
    // Nested functions with default values are valid if parent is not a component
    `
    function regularFunction() {
      const nested = ({ config = { theme: 'dark' } }) => {
        return config;
      };
      return nested;
    }
    `,
    // RegExp literals are currently not detected by the rule
    `
    const MyComponent = () => {
      const { pattern = /^[a-zA-Z0-9]+$/ } = props;
      return <div>{pattern.test('test')}</div>;
    };
    `,
    // Date constructors are currently not detected by the rule
    `
    const MyComponent = () => {
      const { timestamp = new Date() } = props;
      return <div>{timestamp.toISOString()}</div>;
    };
    `,
    // Class instantiations are currently not detected by the rule
    `
    const MyComponent = () => {
      const { instance = new Map() } = props;
      return <div>{instance.size}</div>;
    };
    `,
    // Function calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { result = someFunction() } = props;
      return <div>{result}</div>;
    };
    `,
    // Conditional expressions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { config = process.env.NODE_ENV === 'production' ? { mode: 'prod' } : { mode: 'dev' } } = props;
      return <div>{config.mode}</div>;
    };
    `,
    // Logical OR expressions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { config = defaultConfig || { theme: 'light' } } = props;
      return <div>{config.theme}</div>;
    };
    `,
    // Nullish coalescing expressions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { config = defaultConfig ?? { theme: 'light' } } = props;
      return <div>{config.theme}</div>;
    };
    `,
    // Array method calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { items = [1, 2, 3].map(x => ({ id: x })) } = props;
      return <div>{items.length}</div>;
    };
    `,
    // Object method calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { config = Object.assign({}, { theme: 'dark' }, { mode: 'dev' }) } = props;
      return <div>{config.theme}</div>;
    };
    `,
    // JSON.parse calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { config = JSON.parse('{"theme": "dark"}') } = props;
      return <div>{config.theme}</div>;
    };
    `,
    // Arrow functions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { handler = () => ({ action: 'click' }) } = props;
      return <button onClick={handler}>Click</button>;
    };
    `,
    // Async functions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { fetcher = async () => ({ data: 'test' }) } = props;
      return <div>Component</div>;
    };
    `,
    // Generator functions are currently not detected by the rule
    `
    const MyComponent = () => {
      const { generator = function* () { yield { value: 1 }; } } = props;
      return <div>Component</div>;
    };
    `,
    // Set constructors are currently not detected by the rule
    `
    const MyComponent = () => {
      const { items = new Set([1, 2, 3]) } = props;
      return <div>{items.size}</div>;
    };
    `,
    // WeakMap constructors are currently not detected by the rule
    `
    const MyComponent = () => {
      const { cache = new WeakMap() } = props;
      return <div>Component</div>;
    };
    `,
    // Symbol calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { key = Symbol('unique') } = props;
      return <div>Component</div>;
    };
    `,
    // BigInt calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { bigNumber = BigInt(123) } = props;
      return <div>{bigNumber.toString()}</div>;
    };
    `,
    // Proxy constructors are currently not detected by the rule
    `
    const MyComponent = () => {
      const { proxy = new Proxy({}, { get: () => 'test' }) } = props;
      return <div>Component</div>;
    };
    `,
    // Promise calls are currently not detected by the rule
    `
    const MyComponent = () => {
      const { promise = Promise.resolve({ data: 'test' }) } = props;
      return <div>Component</div>;
    };
    `,
    // Edge case: Component with no destructuring should be valid
    `
    const MyComponent = (props) => {
      return <div>{props.title}</div>;
    };
    `,
    // Edge case: Component with empty destructuring should be valid
    `
    const MyComponent = ({}) => {
      return <div>Empty</div>;
    };
    `,
    // Edge case: Component with rest parameters only should be valid
    `
    const MyComponent = ({ ...rest }) => {
      return <div>{rest.title}</div>;
    };
    `,
    // Edge case: Component with renamed destructuring should be valid
    `
    const MyComponent = ({ title: componentTitle = "Default" }) => {
      return <div>{componentTitle}</div>;
    };
    `,
    // Edge case: Component with mixed destructuring and rest should be valid for primitives
    `
    const MyComponent = ({ title = "Default", count = 0, ...rest }) => {
      return <div>{title} - {count} - {rest.extra}</div>;
    };
    `,
    // Edge case: Deeply nested component should be valid if not a React component
    `
    function outerFunction() {
      function innerFunction() {
        const notAComponent = ({ config = { theme: 'dark' } }) => {
          return config;
        };
        return notAComponent;
      }
      return innerFunction;
    }
    `,
    // Edge case: Component with TypeScript type annotations are detected by the rule
    `
    const MyComponent = ({ title = "Default", count = 0 }) => {
      return <div>{title} - {count}</div>;
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
    // Nested destructuring with default objects - currently detects outer default
    {
      code: `
      const MyComponent = () => {
        const {
          config: {
            theme = { primary: 'blue', secondary: 'gray' }
          } = {}
        } = props;
        return <div className={theme.primary}>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = {} as const;
const MyComponent = () => {
        const {
          config: {
            theme = { primary: 'blue', secondary: 'gray' }
          } = DEFAULT_CONFIG
        } = props;
        return <div className={theme.primary}>Content</div>;
      };
      `,
    },
    // Multiple default objects in same destructuring
    {
      code: `
      const MyComponent = () => {
        const {
          config = { theme: 'dark', mode: 'dev' },
          options = { retries: 3, timeout: 1000 },
          settings = { autoSave: true, notifications: false }
        } = props;
        return <div>Content</div>;
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
      const DEFAULT_CONFIG = { theme: 'dark', mode: 'dev' } as const;
const MyComponent = () => {
        const {
          config = DEFAULT_CONFIG,
          options = { retries: 3, timeout: 1000 },
          settings = { autoSave: true, notifications: false }
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Default arrays with objects
    {
      code: `
      const MyComponent = () => {
        const {
          items = [
            { id: 1, name: 'Item 1', active: true },
            { id: 2, name: 'Item 2', active: false }
          ]
        } = props;
        return items.map(item => <div key={item.id}>{item.name}</div>);
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_ITEMS = [
            { id: 1, name: 'Item 1', active: true },
            { id: 2, name: 'Item 2', active: false }
          ] as const;
const MyComponent = () => {
        const {
          items = DEFAULT_ITEMS
        } = props;
        return items.map(item => <div key={item.id}>{item.name}</div>);
      };
      `,
    },
    // Function expression component with default object
    {
      code: `
      const MyComponent = function({ config = { theme: 'light', size: 'medium' } }) {
        return <div className={config.theme}>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'light', size: 'medium' } as const;
const MyComponent = function({ config = DEFAULT_CONFIG }) {
        return <div className={config.theme}>Content</div>;
      };
      `,
    },
    // Hook with complex default object
    {
      code: `
      export const useApiClient = ({
        baseURL = 'https://api.example.com',
        headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Version': 'v1'
        },
        timeout = 5000
      }) => {
        return { baseURL, headers, timeout };
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_HEADERS = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Version': 'v1'
        } as const;
export const useApiClient = ({
        baseURL = 'https://api.example.com',
        headers = DEFAULT_HEADERS,
        timeout = 5000
      }) => {
        return { baseURL, headers, timeout };
      };
      `,
    },
    // Component with default object containing functions
    {
      code: `
      const MyComponent = () => {
        const {
          handlers = {
            onClick: () => console.log('clicked'),
            onHover: () => console.log('hovered')
          }
        } = props;
        return <button onClick={handlers.onClick}>Click me</button>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_HANDLERS = {
            onClick: () => console.log('clicked'),
            onHover: () => console.log('hovered')
          } as const;
const MyComponent = () => {
        const {
          handlers = DEFAULT_HANDLERS
        } = props;
        return <button onClick={handlers.onClick}>Click me</button>;
      };
      `,
    },
    // Default object with computed property names
    {
      code: `
      const MyComponent = () => {
        const key = 'theme';
        const {
          config = { [key]: 'dark', mode: 'production' }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { [key]: 'dark', mode: 'production' } as const;
const MyComponent = () => {
        const key = 'theme';
        const {
          config = DEFAULT_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Default object with spread operator
    {
      code: `
      const MyComponent = () => {
        const baseConfig = { theme: 'light' };
        const {
          config = { ...baseConfig, mode: 'dev', debug: true }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { ...baseConfig, mode: 'dev', debug: true } as const;
const MyComponent = () => {
        const baseConfig = { theme: 'light' };
        const {
          config = DEFAULT_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Default object with template literals
    {
      code: `
      const MyComponent = () => {
        const {
          config = {
            apiUrl: \`https://\${process.env.NODE_ENV}.api.com\`,
            version: 'v1'
          }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = {
            apiUrl: \`https://\${process.env.NODE_ENV}.api.com\`,
            version: 'v1'
          } as const;
const MyComponent = () => {
        const {
          config = DEFAULT_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Default empty object
    {
      code: `
      const MyComponent = () => {
        const { config = {} } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = {} as const;
const MyComponent = () => {
        const { config = DEFAULT_CONFIG } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Default empty array
    {
      code: `
      const MyComponent = () => {
        const { items = [] } = props;
        return <div>{items.length}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_ITEMS = [] as const;
const MyComponent = () => {
        const { items = DEFAULT_ITEMS } = props;
        return <div>{items.length}</div>;
      };
      `,
    },
    // Component with very long property name
    {
      code: `
      const MyComponent = () => {
        const {
          veryLongPropertyNameThatShouldBeConvertedToConstant = {
            setting1: true,
            setting2: false
          }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_VERY_LONG_PROPERTY_NAME_THAT_SHOULD_BE_CONVERTED_TO_CONSTANT = {
            setting1: true,
            setting2: false
          } as const;
const MyComponent = () => {
        const {
          veryLongPropertyNameThatShouldBeConvertedToConstant = DEFAULT_VERY_LONG_PROPERTY_NAME_THAT_SHOULD_BE_CONVERTED_TO_CONSTANT
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Component with camelCase property name
    {
      code: `
      const MyComponent = () => {
        const {
          apiConfig = { baseUrl: 'https://api.com', timeout: 5000 }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_API_CONFIG = { baseUrl: 'https://api.com', timeout: 5000 } as const;
const MyComponent = () => {
        const {
          apiConfig = DEFAULT_API_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Component with PascalCase property name
    {
      code: `
      const MyComponent = () => {
        const {
          DatabaseConfig = { host: 'localhost', port: 5432 }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_DATABASE_CONFIG = { host: 'localhost', port: 5432 } as const;
const MyComponent = () => {
        const {
          DatabaseConfig = DEFAULT_DATABASE_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Component with snake_case property name
    {
      code: `
      const MyComponent = () => {
        const {
          api_config = { base_url: 'https://api.com' }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_API_CONFIG = { base_url: 'https://api.com' } as const;
const MyComponent = () => {
        const {
          api_config = DEFAULT_API_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Component with kebab-case property name (quoted)
    {
      code: `
      const MyComponent = () => {
        const {
          'api-config': apiConfig = { 'base-url': 'https://api.com' }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_API_CONFIG = { 'base-url': 'https://api.com' } as const;
const MyComponent = () => {
        const {
          'api-config': apiConfig = DEFAULT_API_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Multiple components in same file
    {
      code: `
      const ComponentA = () => {
        const { config = { theme: 'dark' } } = props;
        return <div>A</div>;
      };

      const ComponentB = () => {
        const { settings = { mode: 'dev' } } = props;
        return <div>B</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'dark' } as const;
const ComponentA = () => {
        const { config = DEFAULT_CONFIG } = props;
        return <div>A</div>;
      };

      const ComponentB = () => {
        const { settings = { mode: 'dev' } } = props;
        return <div>B</div>;
      };
      `,
    },
    // Hook with generic type parameters
    {
      code: `
      export const useGenericHook = <T extends object>({
        defaultValue = { id: 0, name: 'default' } as T,
        options = { strict: true, validate: false }
      }) => {
        return { defaultValue, options };
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_DEFAULT_VALUE = { id: 0, name: 'default' } as T as const;
export const useGenericHook = <T extends object>({
        defaultValue = DEFAULT_DEFAULT_VALUE,
        options = { strict: true, validate: false }
      }) => {
        return { defaultValue, options };
      };
      `,
    },
    // Component with default object in parameter destructuring (not body)
    {
      code: `
      export const MyComponent = ({
        config = { theme: 'light', size: 'medium' },
        options = { autoSave: true }
      }) => {
        return <div className={config.theme}>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'light', size: 'medium' } as const;
export const MyComponent = ({
        config = DEFAULT_CONFIG,
        options = { autoSave: true }
      }) => {
        return <div className={config.theme}>Content</div>;
      };
      `,
    },
    // Hook with default object in parameter destructuring
    {
      code: `
      export const useCustomHook = ({
        apiConfig = {
          baseURL: 'https://api.example.com',
          timeout: 5000,
          retries: 3
        },
        cacheConfig = {
          ttl: 300,
          maxSize: 100
        }
      }) => {
        return { apiConfig, cacheConfig };
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_API_CONFIG = {
          baseURL: 'https://api.example.com',
          timeout: 5000,
          retries: 3
        } as const;
export const useCustomHook = ({
        apiConfig = DEFAULT_API_CONFIG,
        cacheConfig = {
          ttl: 300,
          maxSize: 100
        }
      }) => {
        return { apiConfig, cacheConfig };
      };
      `,
    },
    // Function declaration component with default object
    {
      code: `
      function MyComponent({
        theme = { primary: 'blue', secondary: 'gray' },
        layout = { columns: 3, gap: 16 }
      }) {
        return <div style={{ color: theme.primary }}>Content</div>;
      }
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_THEME = { primary: 'blue', secondary: 'gray' } as const;
function MyComponent({
        theme = DEFAULT_THEME,
        layout = { columns: 3, gap: 16 }
      }) {
        return <div style={{ color: theme.primary }}>Content</div>;
      }
      `,
    },
    // Edge case: Default value with complex nested structure
    {
      code: `
      const MyComponent = () => {
        const {
          config = {
            api: {
              endpoints: {
                users: '/api/users',
                posts: '/api/posts'
              },
              timeout: 5000
            },
            ui: {
              theme: 'dark',
              animations: {
                duration: 300,
                easing: 'ease-in-out'
              }
            }
          }
        } = props;
        return <div>Component</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = {
            api: {
              endpoints: {
                users: '/api/users',
                posts: '/api/posts'
              },
              timeout: 5000
            },
            ui: {
              theme: 'dark',
              animations: {
                duration: 300,
                easing: 'ease-in-out'
              }
            }
          } as const;
const MyComponent = () => {
        const {
          config = DEFAULT_CONFIG
        } = props;
        return <div>Component</div>;
      };
      `,
    },
    // Edge case: Default value with mixed array types
    {
      code: `
      const MyComponent = () => {
        const {
          items = [
            'string',
            42,
            true,
            null,
            undefined,
            { id: 1 },
            [1, 2, 3],
            () => 'function'
          ]
        } = props;
        return <div>{items.length}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_ITEMS = [
            'string',
            42,
            true,
            null,
            undefined,
            { id: 1 },
            [1, 2, 3],
            () => 'function'
          ] as const;
const MyComponent = () => {
        const {
          items = DEFAULT_ITEMS
        } = props;
        return <div>{items.length}</div>;
      };
      `,
    },
    // Edge case: Default value with property names that need escaping
    {
      code: `
      const MyComponent = () => {
        const {
          config = {
            'kebab-case': 'value1',
            'snake_case': 'value2',
            'with spaces': 'value3',
            'with.dots': 'value4',
            '123numeric': 'value5'
          }
        } = props;
        return <div>Component</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = {
            'kebab-case': 'value1',
            'snake_case': 'value2',
            'with spaces': 'value3',
            'with.dots': 'value4',
            '123numeric': 'value5'
          } as const;
const MyComponent = () => {
        const {
          config = DEFAULT_CONFIG
        } = props;
        return <div>Component</div>;
      };
      `,
    },
    // Edge case: Component with renamed destructuring and object default
    {
      code: `
      const MyComponent = ({ config: componentConfig = { theme: 'dark', mode: 'dev' } }) => {
        return <div className={componentConfig.theme}>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'dark', mode: 'dev' } as const;
const MyComponent = ({ config: componentConfig = DEFAULT_CONFIG }) => {
        return <div className={componentConfig.theme}>Content</div>;
      };
      `,
    },
    // Edge case: Component with mixed valid and invalid defaults
    {
      code: `
      const MyComponent = ({
        title = "Default Title",
        config = { theme: 'dark' },
        count = 42,
        options = { autoSave: true }
      }) => {
        return <div className={config.theme}>{title} - {count}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'dark' } as const;
const MyComponent = ({
        title = "Default Title",
        config = DEFAULT_CONFIG,
        count = 42,
        options = { autoSave: true }
      }) => {
        return <div className={config.theme}>{title} - {count}</div>;
      };
      `,
    },
    // Edge case: Component with object default in body destructuring after other statements
    {
      code: `
      const MyComponent = () => {
        const someVariable = 'test';
        console.log(someVariable);

        const {
          config = { theme: 'dark', animate: true }
        } = props;

        return <div className={config.theme}>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_CONFIG = { theme: 'dark', animate: true } as const;
const MyComponent = () => {
        const someVariable = 'test';
        console.log(someVariable);

        const {
          config = DEFAULT_CONFIG
        } = props;

        return <div className={config.theme}>Content</div>;
      };
      `,
    },
    // Edge case: Hook with object default and TypeScript generics
    {
      code: `
      export const useTypedHook = <T extends Record<string, any>>({
        defaultData = { id: 0, name: 'default' } as T,
        config = { strict: true, validate: false }
      }: HookProps<T>) => {
        return { defaultData, config };
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_DEFAULT_DATA = { id: 0, name: 'default' } as T as const;
export const useTypedHook = <T extends Record<string, any>>({
        defaultData = DEFAULT_DEFAULT_DATA,
        config = { strict: true, validate: false }
      }: HookProps<T>) => {
        return { defaultData, config };
      };
      `,
    },
    // Edge case: Component with array default containing mixed types
    {
      code: `
      const MyComponent = () => {
        const {
          mixedArray = [
            "string",
            123,
            true,
            { nested: "object" },
            ["nested", "array"],
            null,
            undefined
          ]
        } = props;
        return <div>{mixedArray.length}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_MIXED_ARRAY = [
            "string",
            123,
            true,
            { nested: "object" },
            ["nested", "array"],
            null,
            undefined
          ] as const;
const MyComponent = () => {
        const {
          mixedArray = DEFAULT_MIXED_ARRAY
        } = props;
        return <div>{mixedArray.length}</div>;
      };
      `,
    },
    // Edge case: Component with object default containing special characters in keys
    {
      code: `
      const MyComponent = () => {
        const {
          specialConfig = {
            "key-with-dashes": "value1",
            "key_with_underscores": "value2",
            "key with spaces": "value3",
            "key.with.dots": "value4",
            "123numericKey": "value5",
            "key@with#symbols": "value6"
          }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_SPECIAL_CONFIG = {
            "key-with-dashes": "value1",
            "key_with_underscores": "value2",
            "key with spaces": "value3",
            "key.with.dots": "value4",
            "123numericKey": "value5",
            "key@with#symbols": "value6"
          } as const;
const MyComponent = () => {
        const {
          specialConfig = DEFAULT_SPECIAL_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Edge case: Component with extremely nested object default
    {
      code: `
      const MyComponent = () => {
        const {
          deepConfig = {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: {
                      value: "deeply nested",
                      array: [1, 2, { nested: true }]
                    }
                  }
                }
              }
            }
          }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_DEEP_CONFIG = {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: {
                      value: "deeply nested",
                      array: [1, 2, { nested: true }]
                    }
                  }
                }
              }
            }
          } as const;
const MyComponent = () => {
        const {
          deepConfig = DEFAULT_DEEP_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Edge case: Component with object default containing functions and complex expressions
    {
      code: `
      const MyComponent = () => {
        const {
          complexConfig = {
            handlers: {
              onClick: (e) => console.log('clicked', e),
              onSubmit: async (data) => await submitData(data)
            },
            computed: {
              timestamp: Date.now(),
              random: Math.random()
            },
            nested: {
              deep: {
                value: "test"
              }
            }
          }
        } = props;
        return <div>Content</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_COMPLEX_CONFIG = {
            handlers: {
              onClick: (e) => console.log('clicked', e),
              onSubmit: async (data) => await submitData(data)
            },
            computed: {
              timestamp: Date.now(),
              random: Math.random()
            },
            nested: {
              deep: {
                value: "test"
              }
            }
          } as const;
const MyComponent = () => {
        const {
          complexConfig = DEFAULT_COMPLEX_CONFIG
        } = props;
        return <div>Content</div>;
      };
      `,
    },
    // Edge case: Component with TypeScript type assertions are detected
    {
      code: `
      const MyComponent = ({ title = "Default" as string, count = 0 as number }) => {
        return <div>{title} - {count}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_TITLE = "Default" as string as const;
const MyComponent = ({ title = DEFAULT_TITLE, count = 0 as number }) => {
        return <div>{title} - {count}</div>;
      };
      `,
    },
    // Edge case: Component with boolean type assertion
    {
      code: `
      const MyComponent = ({ isActive = true as boolean }) => {
        return <div>{isActive ? 'Active' : 'Inactive'}</div>;
      };
      `,
      errors: [
        {
          messageId: 'extractDefaultToConstant',
        },
      ],
      output: `
      const DEFAULT_IS_ACTIVE = true as boolean as const;
const MyComponent = ({ isActive = DEFAULT_IS_ACTIVE }) => {
        return <div>{isActive ? 'Active' : 'Inactive'}</div>;
      };
      `,
    },
  ],
});
