import { ESLintUtils } from '@typescript-eslint/utils';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';

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
  'enforce-object-literal-as-const',
  enforceObjectLiteralAsConst,
  {
    valid: [
      // Valid case: already using 'as const' with array literal
      {
        code: `
        function fetchData() {
          return [data, ref] as const;
        }
      `,
      },
      // Valid case: already using 'as const' with object literal
      {
        code: `
        function getConfig() {
          return { foo: 'bar', baz: 42 } as const;
        }
      `,
      },
      // Valid case: returning a variable, not a literal
      {
        code: `
        function getData() {
          const result = { foo: 'bar' };
          return result;
        }
      `,
      },
      // Valid case: returning a function call
      {
        code: `
        function getData() {
          return getResult();
        }
      `,
      },
      // Valid case: returning a primitive
      {
        code: `
        function getValue() {
          return 42;
        }
      `,
      },
      // Valid case: using spread operator (should be skipped)
      {
        code: `
        function mergeData() {
          return { ...data, newProp: 'value' };
        }
      `,
      },
      // Valid case: using spread in array (should be skipped)
      {
        code: `
        function combineArrays() {
          return [...array1, ...array2];
        }
      `,
      },
      // Valid case: not in a function
      {
        code: `
        const result = { foo: 'bar' };
      `,
      },
      // Valid case: returning null
      {
        code: `
        function maybeGetData() {
          if (condition) {
            return null;
          }
          return { data: 'value' } as const;
        }
      `,
      },
      // Valid case: returning undefined
      {
        code: `
        function maybeGetData() {
          if (condition) {
            return undefined;
          }
          return { data: 'value' } as const;
        }
      `,
      },
      // Valid case: returning a template literal
      {
        code: `
        function getMessage() {
          return \`Hello \${name}\`;
        }
      `,
      },
      // Valid case: returning a JSX element
      {
        code: `
        function renderComponent() {
          return <div>Hello</div>;
        }
      `,
      },
      // Valid case: returning a conditional expression
      {
        code: `
        function getData() {
          return condition ? valueA : valueB;
        }
      `,
      },
      // Valid case: returning a logical expression
      {
        code: `
        function getData() {
          return value || defaultValue;
        }
      `,
      },
      // Valid case: returning a binary expression
      {
        code: `
        function calculate() {
          return a + b;
        }
      `,
      },
      // Valid case: returning a new expression
      {
        code: `
        function createInstance() {
          return new MyClass();
        }
      `,
      },
      // Valid case: returning a tagged template expression
      {
        code: `
        function getStyledComponent() {
          return styled.div\`
            color: red;
          \`;
        }
      `,
      },
      // Valid case: returning a class expression
      {
        code: `
        function createClass() {
          return class MyClass {};
        }
      `,
      },
      // Valid case: returning an await expression
      {
        code: `
        async function fetchData() {
          return await api.getData();
        }
      `,
      },
      // Valid case: returning a type assertion with non-object/array
      {
        code: `
        function getValue() {
          return (someValue as number);
        }
      `,
      },
      // Valid case: returning a complex expression with non-literal
      {
        code: `
        function processData() {
          return processValue(data.map(item => item.value));
        }
      `,
      },
      // Valid case: object with method definition
      {
        code: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          } as const;
        }
      `,
      },
      // Valid case: object with computed property
      {
        code: `
        function getObject() {
          return {
            [computedKey]: 'value'
          } as const;
        }
      `,
      },
      // Valid case: empty array
      {
        code: `
        function getEmptyArray() {
          return [] as const;
        }
      `,
      },
      // Valid case: empty object
      {
        code: `
        function getEmptyObject() {
          return {} as const;
        }
      `,
      },
    ],
    invalid: [
      // Invalid case: array literal without 'as const'
      {
        code: `
        function fetchAssertGroup(groupId: string): Promise<[GroupInfo, DocumentReference<GroupInfo>]> {
          return [group, groupRef];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function fetchAssertGroup(groupId: string): Promise<[GroupInfo, DocumentReference<GroupInfo>]> {
          return [group, groupRef] as const;
        }
      `,
      },
      // Invalid case: object literal without 'as const'
      {
        code: `
        function getConfig() {
          return { foo: 'bar', baz: 42 };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return { foo: 'bar', baz: 42 } as const;
        }
      `,
      },
      // Invalid case: nested object literal without 'as const'
      {
        code: `
        function getNestedConfig() {
          return {
            foo: 'bar',
            nested: {
              baz: 'qux'
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getNestedConfig() {
          return {
            foo: 'bar',
            nested: {
              baz: 'qux'
            }
          } as const;
        }
      `,
      },
      // Invalid case: array with multiple elements
      {
        code: `
        function getItems() {
          return [a, b, c];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getItems() {
          return [a, b, c] as const;
        }
      `,
      },
      // Invalid case: with another type assertion
      {
        code: `
        function getData() {
          return { foo: 'bar' } as SomeType;
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getData() {
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in arrow function
      {
        code: `
        const getConfig = () => {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getConfig = () => {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in method
      {
        code: `
        class ConfigService {
          getConfig() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          getConfig() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: empty array
      {
        code: `
        function getEmptyArray() {
          return [];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getEmptyArray() {
          return [] as const;
        }
      `,
      },
      // Invalid case: empty object
      {
        code: `
        function getEmptyObject() {
          return {};
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getEmptyObject() {
          return {} as const;
        }
      `,
      },
      // Invalid case: object with method definition
      {
        code: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObject() {
          return {
            method() {
              return 'value';
            }
          } as const;
        }
      `,
      },
      // Invalid case: object with computed property
      {
        code: `
        function getObject() {
          return {
            [computedKey]: 'value'
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObject() {
          return {
            [computedKey]: 'value'
          } as const;
        }
      `,
      },
      // Invalid case: array with null elements
      {
        code: `
        function getArrayWithNull() {
          return [a, null, c];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getArrayWithNull() {
          return [a, null, c] as const;
        }
      `,
      },
      // Invalid case: object with shorthand properties
      {
        code: `
        function getObjectWithShorthand() {
          return { a, b, c };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getObjectWithShorthand() {
          return { a, b, c } as const;
        }
      `,
      },
      // Invalid case: in function expression
      {
        code: `
        const getConfig = function() {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getConfig = function() {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in async function
      {
        code: `
        async function getAsyncData() {
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        async function getAsyncData() {
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in async arrow function
      {
        code: `
        const getAsyncData = async () => {
          return { foo: 'bar' };
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const getAsyncData = async () => {
          return { foo: 'bar' } as const;
        };
      `,
      },
      // Invalid case: in generator function
      {
        code: `
        function* generateData() {
          yield 1;
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function* generateData() {
          yield 1;
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in async generator function
      {
        code: `
        async function* generateAsyncData() {
          yield 1;
          return { foo: 'bar' };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        async function* generateAsyncData() {
          yield 1;
          return { foo: 'bar' } as const;
        }
      `,
      },
      // Invalid case: in class static method
      {
        code: `
        class ConfigService {
          static getConfig() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          static getConfig() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: in class getter
      {
        code: `
        class ConfigService {
          get config() {
            return { foo: 'bar' };
          }
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        class ConfigService {
          get config() {
            return { foo: 'bar' } as const;
          }
        }
      `,
      },
      // Invalid case: in object method
      {
        code: `
        const service = {
          getConfig() {
            return { foo: 'bar' };
          }
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const service = {
          getConfig() {
            return { foo: 'bar' } as const;
          }
        };
      `,
      },
      // Invalid case: in object getter
      {
        code: `
        const service = {
          get config() {
            return { foo: 'bar' };
          }
        };
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        const service = {
          get config() {
            return { foo: 'bar' } as const;
          }
        };
      `,
      },
      // Invalid case: with JSX in object
      {
        code: `
        function getComponentConfig() {
          return {
            element: <div>Hello</div>,
            options: { animated: true }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getComponentConfig() {
          return {
            element: <div>Hello</div>,
            options: { animated: true }
          } as const;
        }
      `,
      },
      // Invalid case: with complex nested structure
      {
        code: `
        function getComplexData() {
          return {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ],
            settings: {
              theme: 'dark',
              notifications: {
                email: true,
                push: false
              }
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getComplexData() {
          return {
            users: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' }
            ],
            settings: {
              theme: 'dark',
              notifications: {
                email: true,
                push: false
              }
            }
          } as const;
        }
      `,
      },
      // Invalid case: with multiline array
      {
        code: `
        function getItems() {
          return [
            'item1',
            'item2',
            'item3'
          ];
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getItems() {
          return [
            'item1',
            'item2',
            'item3'
          ] as const;
        }
      `,
      },
      // Invalid case: with trailing comma
      {
        code: `
        function getConfig() {
          return {
            foo: 'bar',
            baz: 42,
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return {
            foo: 'bar',
            baz: 42,
          } as const;
        }
      `,
      },
      // Invalid case: with comments in object
      {
        code: `
        function getConfig() {
          return {
            // User settings
            user: {
              name: 'John',
              // User role
              role: 'admin'
            },
            /* System settings */
            system: {
              version: '1.0.0'
            }
          };
        }
      `,
        errors: [{ messageId: 'enforceAsConst' }],
        output: `
        function getConfig() {
          return {
            // User settings
            user: {
              name: 'John',
              // User role
              role: 'admin'
            },
            /* System settings */
            system: {
              version: '1.0.0'
            }
          } as const;
        }
      `,
      },
    ],
  },
);
