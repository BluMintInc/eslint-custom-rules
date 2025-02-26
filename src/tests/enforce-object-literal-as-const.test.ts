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
    ],
  },
);
