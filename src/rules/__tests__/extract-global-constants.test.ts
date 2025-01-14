import { RuleTester } from '@typescript-eslint/utils/dist/ts-eslint';
import { extractGlobalConstants } from '../extract-global-constants';

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
});

ruleTester.run('extract-global-constants', extractGlobalConstants, {
  valid: [
    // Should allow mutable array initialization inside functions
    {
      code: `
        function Component() {
          const items = [];
          items.push(1);
          return items;
        }
      `,
    },
    // Should allow mutable object initialization inside functions
    {
      code: `
        function Component() {
          const config = {};
          config.key = 'value';
          return config;
        }
      `,
    },
    // Should allow array initialization with methods inside functions
    {
      code: `
        function Component() {
          const items = [1, 2, 3].map(x => x * 2);
          return items;
        }
      `,
    },
    // Should allow array initialization with spread inside functions
    {
      code: `
        function Component() {
          const items = [...someArray];
          return items;
        }
      `,
    },
    // Should allow Set/Map initialization inside functions
    {
      code: `
        function Component() {
          const set = new Set();
          set.add(1);
          return set;
        }
      `,
    },
    // Test case from the bug report
    {
      code: `
        const menuItemsFile = useMemo(() => {
          const items: ReactNode[] = [];
          if (MenuItemEdit) {
            items.push(MenuItemEdit);
          }
          if (MenuItemRemove) {
            items.push(MenuItemRemove);
          }
          return items;
        }, [MenuItemEdit, MenuItemRemove]);
      `,
    },
    // Should allow nested array/object initialization
    {
      code: `
        function Component() {
          const nested = { arr: [1, 2, { items: [] }] };
          nested.arr[2].items.push(3);
          return nested;
        }
      `,
    },
    // Should allow array/object destructuring with mutation
    {
      code: `
        function Component() {
          const { items = [] } = props;
          items.push(1);
          return items;
        }
      `,
    },
    // Should allow class instance creation
    {
      code: `
        function Component() {
          const instance = new MyClass();
          instance.configure();
          return instance;
        }
      `,
    },
    // Should allow Promise chain returning mutable values
    {
      code: `
        function Component() {
          const result = Promise.resolve([])
            .then(arr => {
              arr.push(1);
              return arr;
            });
          return result;
        }
      `,
    },
  ],
  invalid: [
    // Should flag immutable string constants
    {
      code: `
        function Component() {
          const MESSAGE = 'Hello';
          return MESSAGE;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'MESSAGE' },
        },
      ],
    },
    // Should flag immutable number constants
    {
      code: `
        function Component() {
          const MAX_COUNT = 100;
          return MAX_COUNT;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'MAX_COUNT' },
        },
      ],
    },
    // Should flag immutable boolean constants
    {
      code: `
        function Component() {
          const ENABLED = true;
          return ENABLED;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'ENABLED' },
        },
      ],
    },
    // Should flag immutable RegExp constants
    {
      code: `
        function Component() {
          const REGEX = /test/;
          return REGEX;
        }
      `,
      errors: [
        {
          messageId: 'extractGlobalConstants',
          data: { declarationName: 'REGEX' },
        },
      ],
    },
  ],
});
