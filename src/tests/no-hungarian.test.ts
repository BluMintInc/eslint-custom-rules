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
    function processText(text: string) {
      return text.replace(/strPattern/g, 'replacement');
    }
    `,

    // Test with array methods that have parameters with Hungarian notation
    `
    function processItems(items: string[]) {
      return items.filter(item => item.length > 0);
    }
    `,

    // Test with object methods that have parameters with Hungarian notation
    `
    function processReview(obj: Record<string, any>) {
      return Object.keys(obj).filter(key => key.startsWith('prefix'));
    }
    `,

    // Test with custom functions that have parameters without Hungarian notation
    `
    function custom(param: string) {
      return param.trim();
    }

    function callCustom() {
      return custom('test');
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
    function processText(text: string) {
      return text.replace(/strPattern/g, 'replacement')
        .split('strSeparator')
        .indexOf('strNeedle');
    }
    `,

    // Test 2: Array methods with parameters that use Hungarian notation
    `
    function processAll(items: string[]) {
      return items.filter(item => item.length > 0)
        .map(item => item.toUpperCase())
        .find(item => item.startsWith('A'));
    }
    `,

    // Test 3: Object methods with parameters that use Hungarian notation
    `
    function processIt(obj: Record<string, any>) {
      const keys = Object.keys(obj).filter(key => key.startsWith('prefix'));
      const values = Object.values(obj).filter(value => value !== null);
      return { keys, values };
    }
    `,

    // Test 4: Promise methods with parameters that use Hungarian notation
    `
    async function process() {
      return Promise.resolve().then(result => result)
        .catch(error => console.error(error));
    }
    `,

    // Test 5: DOM API methods with parameters that use Hungarian notation
    `
    function processDom() {
      document.querySelector('div').addEventListener('click', event => {
        const targetElement = event.target as HTMLElement;
        targetElement.setAttribute('dataString', 'value');
      });
    }
    `,

    // Test 7: Nested function calls with parameters that use Hungarian notation
    `
    function nestedCalls(text: string) {
      return text
        .split(',')
        .map(item => item.trim())
        .filter(item => customFunction(item, 2).length > 0);
    }
    `,

    // Test 8: Method chaining with parameters that use Hungarian notation
    `
    const result = ['a', 'b', 'c']
      .map(item => item.toUpperCase())
      .filter(item => item !== 'B')
      .reduce((acc, item) => acc + item, '');
    `,

    // Test 9: Class methods with parameters that use Hungarian notation
    `
    class Test {
      process(input: string) {
        return input.toLowerCase();
      }
    }

    const instance = new Test();
    instance.process('TEST');
    `,

    // Test 10: Imported functions with parameters that use Hungarian notation
    `
    import { processData } from './utils';

    const result = processData('inputString', 42);
    `,

    // Test 12: Arrow functions with parameters that use Hungarian notation
    `
    const formatText = (param: string) => param.trim();
    formatText('  test  ');
    `,

    // Test 13: Callback functions with parameters that use Hungarian notation
    `
    [1, 2, 3].forEach(function(item) {
      console.log(item * 2);
    });
    `,

    // Test 14: Event handlers with parameters that use Hungarian notation
    `
    document.addEventListener('click', function(event) {
      console.log(event.target);
    });
    `,

    // Test 15: Higher-order functions with parameters that use Hungarian notation
    `
    function createProcessor(transformFn: (param: string) => string) {
      return function(input: string) {
        return transformFn(input);
      };
    }

    const processor = createProcessor(param => param.toUpperCase());
    `,

    // Test 16: Function calls with object literals that have properties with Hungarian notation
    `
    function processConfig(config: any) {
      return config.name;
    }

    processConfig({ name: 'John', age: 30 });
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

    async function fetchData(url: string) {
      const response = await axios.get(url, {
        params: { param: 'value' }
      });
      return response.data;
    }
    `,

    // Test 22: Function calls with optional parameters that use Hungarian notation
    `
    function processWithOptions(text: string, options?: { trim?: boolean }) {
      return options?.trim ? text.trim() : text;
    }

    processWithOptions('  test  ', { trim: true });
    `,

    // Test 23: Function calls with default parameters that use Hungarian notation
    `
    function processWithDefaults(text: string, defaultValue: string = '') {
      return text || defaultValue;
    }

    processWithDefaults('', 'default');
    `,
    // Allow class names to appear in variable names
    'const userController = new Controller();',
    'const appController = new Controller();',
    'class UserController extends Controller { }',
    'type UserController = Controller;',
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
    {
      // Test with custom functions that have parameters with Hungarian notation
      code: `
      function customFunction(paramString: string) {
        return paramString.trim();
      }
  
      function callCustomFunction() {
        return customFunction('test');
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'customFunction' } },
        { messageId: 'noHungarian', data: { name: 'paramString' } },
        { messageId: 'noHungarian', data: { name: 'callCustomFunction' } },
      ],
    },
    {
      // Test 6: Custom functions with parameters that use Hungarian notation
      code: `
      function customFunction(paramString: string, paramNumber: number) {
        return paramString.repeat(paramNumber);
      }
  
      const result = customFunction('hello', 3);
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'customFunction' } },
        { messageId: 'noHungarian', data: { name: 'paramString' } },
        { messageId: 'noHungarian', data: { name: 'paramNumber' } },
      ],
    },
    {
      code: `
    class TestClass {
      process(inputString: string) {
        return inputString.toLowerCase();
      }
    }
    `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'TestClass' } },
        { messageId: 'noHungarian', data: { name: 'inputString' } },
      ],
    },
    {
      code: `const fn = func(param: string) {
      return param.trim();
    };

    fn('  test  ');
    `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'fn' } },
        { messageId: 'noHungarian', data: { name: 'func' } },
      ],
    },
  ],
});
