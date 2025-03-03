import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian', noHungarian, {
  valid: [
    'const username: string = "abc";',
    'const isReady: boolean = true;',
    'const count: number = 5;',
    'let items: string[] = [];',

    'const controller = new Controller();',
    'const appController = new Controller();',
    'const controllerForApp = new Controller();',
    'const myCustomController = new Controller();',
    'const controllerInstance = new Controller();',

    'const { usernameString } = userData;',
    'const { countNumber, isReadyBoolean } = config;',
    'const { strName, intAge, boolIsActive } = user;',

    'import { API_URL_STRING } from "./config";',
    'import { USER_ID_STRING, COUNT_NUMBER } from "./constants";',
    'import * as constants from "./constants"; const value = constants.DATA_OBJECT;',

    'class User { nameString = "John"; getAgeNumber() { return 30; } }',
    'class Config { static API_URL_STRING = "https://api.example.com"; }',

    'const user = { nameString: "John", ageNumber: 30 };',
    'const config = { API_URL_STRING: "https://api.example.com" };',

    'const myStringValue = "abc";',
    'const isNumberPositive = true;',
    'const hasArrayItems = true;',

    'const userProfileController = new UserProfileController();',
    'const authControllerInstance = new AuthController();',
    'const myAppControllerForUsers = new UserController();',

    'const stringifyData = JSON.stringify(data);',

    'const strongPassword = generatePassword();',
    'const wrongAnswer = false;',
    'const longList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];',
    'const foreignKey = { country: "Canada" };',

    `
    function checkSitemap(pathname: string) {
      return pathname == 'sitemap';
    }
    `,

    `
    function processText(text: string) {
      return text.replace(/strPattern/g, 'replacement');
    }
    `,

    `
    function processItems(items: string[]) {
      return items.filter(item => item.length > 0);
    }
    `,

    `
    function processReview(obj: Record<string, any>) {
      return Object.keys(obj).filter(key => key.startsWith('prefix'));
    }
    `,

    `
    function custom(param: string) {
      return param.trim();
    }

    function callCustom() {
      return custom('test');
    }
    `,

    `
    import type { NextRequest } from 'next/server';

    const checkSitemap = (pathname: string) => {
      return pathname.startsWith('/sitemap') && pathname.endsWith('.xml');
    };
    `,

    `
    const isValidEmail = (email: string) => {
      return email.includes('@') && email.endsWith('.com');
    };
    `,

    `
    const formatText = (text: string) => {
      return text.toLowerCase().startsWith('a') ? text.toUpperCase() : text.trim();
    };
    `,

    `
    function processText(text: string) {
      return text.replace(/strPattern/g, 'replacement')
        .split('strSeparator')
        .indexOf('strNeedle');
    }
    `,

    `
    function processAll(items: string[]) {
      return items.filter(item => item.length > 0)
        .map(item => item.toUpperCase())
        .find(item => item.startsWith('A'));
    }
    `,

    `
    function processIt(obj: Record<string, any>) {
      const keys = Object.keys(obj).filter(key => key.startsWith('prefix'));
      const values = Object.values(obj).filter(value => value !== null);
      return { keys, values };
    }
    `,

    `
    async function process() {
      return Promise.resolve().then(result => result)
        .catch(error => console.error(error));
    }
    `,

    `
    function processDom() {
      document.querySelector('div').addEventListener('click', event => {
        const targetElement = event.target as HTMLElement;
        targetElement.setAttribute('dataString', 'value');
      });
    }
    `,

    `
    function nestedCalls(text: string) {
      return text
        .split(',')
        .map(item => item.trim())
        .filter(item => customFunction(item, 2).length > 0);
    }
    `,

    `
    const result = ['a', 'b', 'c']
      .map(item => item.toUpperCase())
      .filter(item => item !== 'B')
      .reduce((acc, item) => acc + item, '');
    `,

    `
    class Test {
      process(input: string) {
        return input.toLowerCase();
      }
    }

    const instance = new Test();
    instance.process('TEST');
    `,

    `
    import { processData } from './utils';

    const result = processData('inputString', 42);
    `,

    `
    const formatText = (param: string) => param.trim();
    formatText('  test  ');
    `,

    `
    [1, 2, 3].forEach(function(item) {
      console.log(item * 2);
    });
    `,

    `
    document.addEventListener('click', function(event) {
      console.log(event.target);
    });
    `,

    `
    function createProcessor(transformFn: (param: string) => string) {
      return function(input: string) {
        return transformFn(input);
      };
    }

    const processor = createProcessor(param => param.toUpperCase());
    `,

    `
    function processConfig(config: any) {
      return config.name;
    }

    processConfig({ name: 'John', age: 30 });
    `,

    `
    function processItems(items: string[]) {
      return items.join(', ');
    }

    processItems(['itemString1', 'itemString2', 'itemString3']);
    `,

    `
    function processTemplate(template: string) {
      return template.trim();
    }

    const name = 'John';
    processTemplate(\`Hello, \${name}!\`);
    `,

    `
    function processArgs(...args: any[]) {
      return args.join(', ');
    }

    const items = [1, 2, 3];
    processArgs(...items);
    `,

    `
    function processUser({ name, age }: { name: string, age: number }) {
      return \`\${name} is \${age} years old\`;
    }

    const userData = { name: 'John', age: 30 };
    processUser(userData);
    `,

    `
    import axios from 'axios';

    async function fetchData(url: string) {
      const response = await axios.get(url, {
        params: { param: 'value' }
      });
      return response.data;
    }
    `,

    `
    function processWithOptions(text: string, options?: { trim?: boolean }) {
      return options?.trim ? text.trim() : text;
    }

    processWithOptions('  test  ', { trim: true });
    `,

    `
    function processWithDefaults(text: string, defaultValue: string = '') {
      return text || defaultValue;
    }

    processWithDefaults('', 'default');
    `,

    'const userController = new Controller();',
    'const appController = new Controller();',
    'class UserController extends Controller { }',
    'type UserController = Controller;',

    `
    function checkPath(pathnamepathname: string) {
      return pathnamepathname.startsWith('/sitemap') && pathnamepathname.endsWith('.xml');
    }
    `,

    `
    function processData(userData: any) {
      return userData.nameString || userData.ageNumber || '';
    }
    `,

    `
    import { userDataString, configNumber } from './module';
    
    function process() {
      return userDataString + configNumber;
    }
    `,

    `
    import { formatString, parseNumber } from './formatters';
    
    function process(input: string) {
      return formatString(input) + parseNumber(input);
    }
    `,
  ],
  invalid: [
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

    {
      code: 'const nameString = "John", ageNumber = 30;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'nameString' } },
        { messageId: 'noHungarian', data: { name: 'ageNumber' } },
      ],
    },

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

    {
      code: 'const userObjectArray = [{ name: "John" }];',
      errors: [{ messageId: 'noHungarian', data: { name: 'userObjectArray' } }],
    },

    {
      code: 'const arrayOfItems = ["a", "b", "c"];',
      errors: [{ messageId: 'noHungarian', data: { name: 'arrayOfItems' } }],
    },
    {
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
      code: `const fnF = function(param: string) {
      return param.trim();
    };

    fnF('  test  ');`,
      errors: [{ messageId: 'noHungarian', data: { name: 'fnF' } }],
    },
  ],
});
