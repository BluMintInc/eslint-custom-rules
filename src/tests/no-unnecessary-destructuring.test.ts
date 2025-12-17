import type { TSESLint } from '@typescript-eslint/utils';
import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryDestructuring } from '../rules/no-unnecessary-destructuring';

const formatMessage = (source: string, target: string) =>
  [
    `Destructuring only the rest of "${source}" into "${target}" just clones the entire object.`,
    'The shallow copy adds allocations and hides that you keep every property unchanged.',
    `Assign the object directly instead, for example \`${target} = ${source}\`.`,
  ].join(' ');

const expectError = (
  source: string,
  target: string,
): TSESLint.TestCaseError<'noUnnecessaryDestructuring'> =>
  ({
    message: formatMessage(source, target),
  } as unknown as TSESLint.TestCaseError<'noUnnecessaryDestructuring'>);

const ruleTester = ruleTesterTs;

ruleTester.run('no-unnecessary-destructuring', noUnnecessaryDestructuring, {
  valid: [
    // Multiple properties destructured - valid
    `const { foo, bar } = obj;`,

    // Omitting properties - valid
    `const { omitted, ...rest } = obj;`,

    // Function parameters - valid
    `function getValue({ value }) { return value; }`,

    // Object spread in object creation - valid
    `const newObj = { ...oldObj, newProp: 123 };`,

    // Regular assignment - valid
    `const value = data;`,

    // Destructuring with specific property - valid
    `const { value } = data;`,

    // Arrow function with destructuring parameter - valid
    `const arrowFn = ({ prop }) => prop;`,

    // Method with destructuring parameter - valid
    `class Example { method({ value }) { return value; } }`,

    // Nested destructuring - valid
    `const { nested: { prop } } = complexObj;`,

    // Array destructuring - valid (different syntax)
    `const [first, ...rest] = array;`,

    // Destructuring with default values - valid
    `const { prop = 'default' } = obj;`,

    // Destructuring with renamed variables - valid
    `const { originalName: newName } = obj;`,

    // Multiple rest elements in different destructuring patterns - second one is valid because it has multiple properties
    `const { a, ...obj2 } = data2;`,

    // Destructuring in for-of loop - valid
    `for (const { prop } of items) { console.log(prop); }`,

    // Destructuring in catch clause - valid
    `try {} catch ({ message }) { console.error(message); }`,

    // Object spread in array - valid
    `const arr = [...oldArray, newItem];`,

    // Object spread in function arguments - valid
    `functionCall(...args);`,

    // Destructuring with computed property - valid
    `const { [computedKey]: value } = obj;`,

    // Destructuring with complex property path - valid
    `const { 'dot.notation': value } = obj;`,

    // Destructuring with numeric property - valid
    `const { 123: value } = obj;`,

    // Multiple variable declarations - valid
    `const { a } = obj1, { b } = obj2;`,

    // Destructuring with TypeScript type annotation - valid
    `const { value }: { value: string } = obj;`,

    // Destructuring in a complex assignment pattern - valid
    `[{ a }, { b }] = [obj1, obj2];`,
  ],
  invalid: [
    // Basic case - invalid
    {
      code: `const { ...value } = data;`,
      errors: [expectError('data', 'value')],
      output: `const value = data;`,
    },
    // Using let - invalid
    {
      code: `let { ...obj } = someObject;`,
      errors: [expectError('someObject', 'obj')],
      output: `let obj = someObject;`,
    },
    // Using var - invalid
    {
      code: `var { ...result } = getResult();`,
      errors: [expectError('getResult()', 'result')],
      output: `var result = getResult();`,
    },
    // With function call - invalid
    {
      code: `const { ...config } = getConfiguration();`,
      errors: [expectError('getConfiguration()', 'config')],
      output: `const config = getConfiguration();`,
    },
    // With object property access - invalid
    {
      code: `const { ...settings } = user.preferences;`,
      errors: [expectError('user.preferences', 'settings')],
      output: `const settings = user.preferences;`,
    },
    // With complex expression - invalid
    {
      code: `const { ...result } = condition ? objA : objB;`,
      errors: [expectError('condition ? objA : objB', 'result')],
      output: `const result = condition ? objA : objB;`,
    },
    // With nested member expression - invalid
    {
      code: `const { ...data } = response.body.data;`,
      errors: [expectError('response.body.data', 'data')],
      output: `const data = response.body.data;`,
    },
    // With array index - invalid
    {
      code: `const { ...item } = items[0];`,
      errors: [expectError('items[0]', 'item')],
      output: `const item = items[0];`,
    },
    // With computed property - invalid
    {
      code: `const { ...value } = obj[propName];`,
      errors: [expectError('obj[propName]', 'value')],
      output: `const value = obj[propName];`,
    },
    // With template literal - invalid
    {
      code: 'const { ...config } = configs[`${env}-settings`];',
      errors: [expectError('configs[`${env}-settings`]', 'config')],
      output: 'const config = configs[`${env}-settings`];',
    },
    // With new expression - invalid
    {
      code: `const { ...instance } = new MyClass();`,
      errors: [expectError('new MyClass()', 'instance')],
      output: `const instance = new MyClass();`,
    },
    // With TypeScript cast - invalid
    {
      code: `const { ...typedObj } = obj as SomeType;`,
      errors: [expectError('obj as SomeType', 'typedObj')],
      output: `const typedObj = obj as SomeType;`,
    },
    // With TypeScript generic - invalid
    {
      code: `const { ...result } = getData<User>();`,
      errors: [expectError('getData<User>()', 'result')],
      output: `const result = getData<User>();`,
    },
    // In a for loop initialization - invalid
    {
      code: `for (let { ...item } = getNext(); item; { ...item } = getNext()) { console.log(item); }`,
      errors: [
        expectError('getNext()', 'item'),
        expectError('getNext()', 'item'),
      ],
      output: `for (let item = getNext(); item; item = getNext()) { console.log(item); }`,
    },

    // Assignment expression - invalid
    {
      code: `let obj; ({ ...obj } = source);`,
      errors: [expectError('source', 'obj')],
      output: `let obj; (obj = source);`,
    },
    // Multiple declarations with one invalid - invalid
    {
      code: `const { prop } = obj1, { ...all } = obj2;`,
      errors: [expectError('obj2', 'all')],
      output: `const { prop } = obj1, all = obj2;`,
    },
    // With JSX expression - invalid
    {
      code: `const { ...props } = React.useContext(ThemeContext);`,
      errors: [expectError('React.useContext(ThemeContext)', 'props')],
      output: `const props = React.useContext(ThemeContext);`,
    },
  ],
});
