import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian', noHungarian, {
  valid: [
    // Regular variable names without Hungarian notation
    'const username: string = "abc";',
    'const isReady: boolean = true;',
    'const count: number = 5;',
    'let items: string[] = [];',

    // Class instances where variable name contains class name (allowed by default)
    'const controller = new Controller();',
    'const appController = new Controller();',
    'const controllerForApp = new Controller();',
    'const myCustomController = new Controller();',
    'const controllerInstance = new Controller();',

    // Destructuring assignments (should be ignored)
    'const { usernameString } = userData;',
    'const { countNumber, isReadyBoolean } = config;',
    'const { strName, intAge, boolIsActive } = user;',
    'function test({ itemsArray }) { return itemsArray.length; }',

    // Function parameters (should be ignored)
    'function processUser(nameString) { return nameString.toUpperCase(); }',
    'function calculateTotal(priceNumber, quantityNumber) { return priceNumber * quantityNumber; }',
    'const handleSubmit = (dataObject) => { console.log(dataObject); };',
    '(function(configObject) { return configObject.value; })({})',

    // Imported constants (should be ignored)
    'import { API_URL_STRING } from "./config";',
    'import { USER_ID_STRING, COUNT_NUMBER } from "./constants";',
    'import * as constants from "./constants"; const value = constants.DATA_OBJECT;',

    // Variables with same name as type (edge case)
    'const String = "abc";',
    'const Number = 123;',
    'const Boolean = true;',
    'const Array = [1, 2, 3];',
    'const Object = { key: "value" };',

    // Class methods and properties (should be ignored)
    'class User { nameString = "John"; getAgeNumber() { return 30; } }',
    'class Config { static API_URL_STRING = "https://api.example.com"; }',

    // Object properties (should be ignored)
    'const user = { nameString: "John", ageNumber: 30 };',
    'const config = { API_URL_STRING: "https://api.example.com" };',

    // Variables with type names in the middle (not Hungarian notation)
    'const myStringValue = "abc";',
    'const isNumberPositive = true;',
    'const hasArrayItems = true;',

    // Arrow functions with parameters (should be ignored)
    'const process = (nameString) => nameString.toUpperCase();',
    'items.map((itemObject) => itemObject.id);',

    // Callback parameters (should be ignored)
    'array.forEach(function(itemObject) { console.log(itemObject); });',
    'promise.then(function(responseObject) { return responseObject.data; });',

    // Function expressions with parameters (should be ignored)
    'const fn = function(dataString) { return dataString.trim(); };',

    // Class instances with complex names
    'const userProfileController = new UserProfileController();',
    'const authControllerInstance = new AuthController();',
    'const myAppControllerForUsers = new UserController();',

    // Variables with type names that are not actually using Hungarian notation
    'const stringifyData = JSON.stringify(data);',
    'const numberFormatter = new Intl.NumberFormat();',
    'const booleanLogic = x && y;',
    'const arrayMethods = ["map", "filter", "reduce"];',
    'const objectAssign = Object.assign({}, source);',

    // Variables with type names in camelCase (not Hungarian)
    'const myStringUtils = new StringUtils();',
    'const numberConverter = new NumberConverter();',
    'const booleanToggle = !previousValue;',
    'const arrayHelpers = new ArrayHelpers();',
    'const objectMapper = new ObjectMapper();',

    // Variables with custom class instances that have type-like names
    'const stringBuilder = new StringBuilder();',
    'const numberParser = new NumberParser();',
    'const booleanEvaluator = new BooleanEvaluator();',
    'const arrayCollection = new ArrayCollection();',
    'const objectPool = new ObjectPool();',

    // Variables with type names as part of a larger word
    'const strongPassword = generatePassword();',
    'const wrongAnswer = false;',
    'const longList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];',
    'const foreignKey = { country: "Canada" };',

    // Function call bug fix tests
    // The bug case: function call with a parameter that uses Hungarian notation
    // This should be valid because we're not defining the function, just calling it
    `
    function checkSitemap(pathname: string) {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    }
    `,

    // Test with string methods that have parameters with Hungarian notation
    `
    function processString(text: string) {
      return text.replace(/strPattern/g, 'replacement');
    }
    `,

    // Test with array methods that have parameters with Hungarian notation
    `
    function processArray(items: string[]) {
      return items.filter(itemString => itemString.length > 0);
    }
    `,

    // Test with object methods that have parameters with Hungarian notation
    `
    function processObject(obj: Record<string, any>) {
      return Object.keys(obj).filter(keyString => keyString.startsWith('prefix'));
    }
    `,

    // Test with custom functions that have parameters with Hungarian notation
    `
    function customFunction(paramString: string) {
      return paramString.trim();
    }

    function callCustomFunction() {
      return customFunction('test');
    }
    `,

    // Function call test cases
    // Next.js example
    `
    import type { NextRequest } from 'next/server';

    const checkSitemap = (pathname: string) => {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    };
    `,

    // Another example with a different built-in method
    `
    const isValidEmail = (email: string) => {
      return email.includes('@') && email.endsWith('.com');
    };
    `,

    // Example with multiple method calls
    `
    const formatText = (text: string) => {
      return text.toLowerCase().startsWith('a') ? text.toUpperCase() : text.trim();
    };
    `,

    // Test 1: String methods with parameters that use Hungarian notation
    `
    function processString(text: string) {
      return text.replace(/strPattern/g, 'replacement')
        .split('strSeparator')
        .indexOf('strNeedle');
    }
    `,

    // Test 2: Array methods with parameters that use Hungarian notation
    `
    function processArray(items: string[]) {
      return items.filter(itemString => itemString.length > 0)
        .map(itemString => itemString.toUpperCase())
        .find(itemString => itemString.startsWith('A'));
    }
    `,

    // Test 3: Object methods with parameters that use Hungarian notation
    `
    function processObject(obj: Record<string, any>) {
      const keys = Object.keys(obj).filter(keyString => keyString.startsWith('prefix'));
      const values = Object.values(obj).filter(valueObject => valueObject !== null);
      return { keys, values };
    }
    `,

    // Test 4: Promise methods with parameters that use Hungarian notation
    `
    async function processPromise() {
      return Promise.resolve().then(resultObject => resultObject)
        .catch(errorObject => console.error(errorObject));
    }
    `,

    // Test 5: DOM API methods with parameters that use Hungarian notation
    `
    function processDom() {
      document.querySelector('div').addEventListener('click', eventObject => {
        const targetElement = eventObject.target as HTMLElement;
        targetElement.setAttribute('dataString', 'value');
      });
    }
    `,

    // Test 6: Custom functions with parameters that use Hungarian notation
    `
    function customFunction(paramString: string, paramNumber: number) {
      return paramString.repeat(paramNumber);
    }

    const result = customFunction('hello', 3);
    `,

    // Test 7: Nested function calls with parameters that use Hungarian notation
    `
    function nestedCalls(text: string) {
      return text
        .split(',')
        .map(itemString => itemString.trim())
        .filter(itemString => customFunction(itemString, 2).length > 0);
    }
    `,

    // Test 8: Method chaining with parameters that use Hungarian notation
    `
    const result = ['a', 'b', 'c']
      .map(itemString => itemString.toUpperCase())
      .filter(itemString => itemString !== 'B')
      .reduce((accString, itemString) => accString + itemString, '');
    `,

    // Test 9: Class methods with parameters that use Hungarian notation
    `
    class TestClass {
      process(inputString: string) {
        return inputString.toLowerCase();
      }
    }

    const instance = new TestClass();
    instance.process('TEST');
    `,

    // Test 10: Imported functions with parameters that use Hungarian notation
    `
    import { processData } from './utils';

    const result = processData('inputString', 42);
    `,

    // Test 11: Function expressions with parameters that use Hungarian notation
    `
    const fn = function(paramString: string) {
      return paramString.trim();
    };

    fn('  test  ');
    `,

    // Test 12: Arrow functions with parameters that use Hungarian notation
    `
    const formatText = (paramString: string) => paramString.trim();
    formatText('  test  ');
    `,

    // Test 13: Callback functions with parameters that use Hungarian notation
    `
    [1, 2, 3].forEach(function(itemNumber) {
      console.log(itemNumber * 2);
    });
    `,

    // Test 14: Event handlers with parameters that use Hungarian notation
    `
    document.addEventListener('click', function(eventObject) {
      console.log(eventObject.target);
    });
    `,

    // Test 15: Higher-order functions with parameters that use Hungarian notation
    `
    function createProcessor(transformFn: (paramString: string) => string) {
      return function(input: string) {
        return transformFn(input);
      };
    }

    const processor = createProcessor(paramString => paramString.toUpperCase());
    `,

    // Test 16: Function calls with object literals that have properties with Hungarian notation
    `
    function processConfig(config: any) {
      return config.name;
    }

    processConfig({ nameString: 'John', ageNumber: 30 });
    `,

    // Test 17: Function calls with array literals that contain elements with Hungarian notation
    `
    function processItems(items: string[]) {
      return items.join(', ');
    }

    processItems(['itemString1', 'itemString2', 'itemString3']);
    `,

    // Test 18: Function calls with template literals that contain expressions with Hungarian notation
    `
    function processTemplate(template: string) {
      return template.trim();
    }

    const name = 'John';
    processTemplate(\`Hello, \${name}!\`);
    `,

    // Test 19: Function calls with spread operators that use variables with Hungarian notation
    `
    function processArgs(...args: any[]) {
      return args.join(', ');
    }

    const items = [1, 2, 3];
    processArgs(...items);
    `,

    // Test 20: Function calls with destructuring that use variables with Hungarian notation
    `
    function processUser({ name, age }: { name: string, age: number }) {
      return \`\${name} is \${age} years old\`;
    }

    const userData = { name: 'John', age: 30 };
    processUser(userData);
    `,

    // Test 21: External library function calls with parameters that use Hungarian notation
    `
    import axios from 'axios';

    async function fetchData(urlString: string) {
      const response = await axios.get(urlString, {
        params: { paramString: 'value' }
      });
      return response.data;
    }
    `,

    // Test 22: Function calls with optional parameters that use Hungarian notation
    `
    function processWithOptions(text: string, optionsObject?: { trim?: boolean }) {
      return optionsObject?.trim ? text.trim() : text;
    }

    processWithOptions('  test  ', { trim: true });
    `,

    // Test 23: Function calls with default parameters that use Hungarian notation
    `
    function processWithDefaults(text: string, defaultValueString: string = '') {
      return text || defaultValueString;
    }

    processWithDefaults('', 'default');
    `,
  ],
  invalid: [
    // Variables with Hungarian notation suffixes
    {
      code: 'const usernameString: string = "abc";',
      errors: [{ messageId: 'noHungarian', data: { name: 'usernameString' } }],
    },
    {
      code: 'const isReadyBoolean: boolean = true;',
      errors: [{ messageId: 'noHungarian', data: { name: 'isReadyBoolean' } }],
    },
    {
      code: 'const countNumber: number = 5;',
      errors: [{ messageId: 'noHungarian', data: { name: 'countNumber' } }],
    },
    {
      code: 'let itemsArray: string[] = [];',
      errors: [{ messageId: 'noHungarian', data: { name: 'itemsArray' } }],
    },
    {
      code: 'const userDataObject = { name: "John", age: 30 };',
      errors: [{ messageId: 'noHungarian', data: { name: 'userDataObject' } }],
    },

    // Variables with Hungarian notation in different contexts
    {
      code: 'function test() { const resultString = "test"; return resultString; }',
      errors: [{ messageId: 'noHungarian', data: { name: 'resultString' } }],
    },
    {
      code: 'if (condition) { let countNumber = 0; countNumber++; }',
      errors: [{ messageId: 'noHungarian', data: { name: 'countNumber' } }],
    },
    {
      code: 'for (let indexNumber = 0; indexNumber < 10; indexNumber++) { console.log(indexNumber); }',
      errors: [{ messageId: 'noHungarian', data: { name: 'indexNumber' } }],
    },
    // Class properties should be ignored in our implementation

    // Variables with Hungarian notation prefixes
    {
      code: 'const strName = "John";',
      errors: [{ messageId: 'noHungarian', data: { name: 'strName' } }],
    },
    {
      code: 'const intAge = 30;',
      errors: [{ messageId: 'noHungarian', data: { name: 'intAge' } }],
    },
    {
      code: 'const boolIsActive = true;',
      errors: [{ messageId: 'noHungarian', data: { name: 'boolIsActive' } }],
    },

    // Multiple variables with Hungarian notation in one declaration
    {
      code: 'const nameString = "John", ageNumber = 30;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'nameString' } },
        { messageId: 'noHungarian', data: { name: 'ageNumber' } },
      ],
    },

    // Variables with Hungarian notation in different scopes
    {
      code: `
        const outerString = "outer";
        function test() {
          const innerString = "inner";
          if (true) {
            const nestedString = "nested";
          }
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'outerString' } },
        { messageId: 'noHungarian', data: { name: 'innerString' } },
        { messageId: 'noHungarian', data: { name: 'nestedString' } },
      ],
    },

    // Test with disabling allowClassInstances
    {
      code: 'const userController = new Controller();',
      options: [{ allowClassInstances: false }],
      errors: [{ messageId: 'noHungarian', data: { name: 'userController' } }],
    },
    {
      code: 'const appController = new Controller();',
      options: [{ allowClassInstances: false }],
      errors: [{ messageId: 'noHungarian', data: { name: 'appController' } }],
    },

    // Edge case: variable name contains multiple type names
    {
      code: 'const userObjectArray = [{ name: "John" }];',
      errors: [{ messageId: 'noHungarian', data: { name: 'userObjectArray' } }],
    },

    // Edge case: variable name with type name as prefix
    {
      code: 'const arrayOfItems = ["a", "b", "c"];',
      errors: [{ messageId: 'noHungarian', data: { name: 'arrayOfItems' } }],
    },
  ],
});
