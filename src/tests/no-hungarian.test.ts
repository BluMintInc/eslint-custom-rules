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
    'class Config { static API_URL = "https://api.example.com"; }',
    'const config = { API_URL_STRING: "https://api.example.com" };',

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

    // Valid tests for class methods and properties
    `
    class User {
      name: string = "John";
      age: number = 30;
      isActive: boolean = true;
      
      getName() {
        return this.name;
      }
      
      setAge(age: number) {
        this.age = age;
      }
      
      toggleActive() {
        this.isActive = !this.isActive;
      }
    }
    `,

    `
    class Config {
      static apiUrl: string = "https://api.example.com";
      static maxCount: number = 100;
      
      static getApiUrl() {
        return Config.apiUrl;
      }
      
      static setMaxCount(count: number) {
        Config.maxCount = count;
      }
    }
    `,

    `
    class DataProcessor {
      process(items: string[]) {
        return items.map(item => item.toUpperCase());
      }
      
      filter(items: string[], predicate: (item: string) => boolean) {
        return items.filter(predicate);
      }
    }
    `,

    `
    class EventHandler {
      private listeners: Map<string, Function[]> = new Map();
      
      addEventListener(event: string, callback: Function) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
      }
      
      removeEventListener(event: string, callback: Function) {
        const callbacks = this.listeners.get(event) || [];
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      }
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
    // Tests for class methods with Hungarian notation
    {
      code: `
        class User {
          getNameString() {
            return "John";
          }
        }
      `,
      errors: [{ messageId: 'noHungarian', data: { name: 'getNameString' } }],
    },
    {
      code: `
        class DataProcessor {
          processArrayItems(itemsArray: string[]) {
            return itemsArray.join(", ");
          }
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'processArrayItems' } },
        { messageId: 'noHungarian', data: { name: 'itemsArray' } },
      ],
    },
    {
      code: `
        class Config {
          static getOptionsObject() {
            return { key: "value" };
          }
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'getOptionsObject' } },
      ],
    },
    // Tests for class properties with Hungarian notation
    {
      code: `
        class User {
          nameString: string = "John";
          ageNumber: number = 30;
          isActiveBoolean: boolean = true;
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'nameString' } },
        { messageId: 'noHungarian', data: { name: 'ageNumber' } },
        { messageId: 'noHungarian', data: { name: 'isActiveBoolean' } },
      ],
    },
    {
      code: `
        class Config {
          static apiUrlString: string = "https://api.example.com";
          static maxCountNumber: number = 100;
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'apiUrlString' } },
        { messageId: 'noHungarian', data: { name: 'maxCountNumber' } },
      ],
    },
    {
      code: `
        class DataStore {
          private dataArray: any[] = [];
          
          addItem(objItem: any) {
            this.dataArray.push(objItem);
          }
          
          getItemsArray() {
            return this.dataArray;
          }
        }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'dataArray' } },
        { messageId: 'noHungarian', data: { name: 'objItem' } },
        { messageId: 'noHungarian', data: { name: 'getItemsArray' } },
      ],
    },
    {
      code: `
      class User {
        STR_USERNAME = "admin";
        NUM_ACCESS_LEVEL = 5;
        BOOL_IS_ACTIVE = true;
        
        GET_STR_FULL_NAME() {
          return "Admin User";
        }
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'STR_USERNAME' } },
        { messageId: 'noHungarian', data: { name: 'NUM_ACCESS_LEVEL' } },
        { messageId: 'noHungarian', data: { name: 'BOOL_IS_ACTIVE' } },
        { messageId: 'noHungarian', data: { name: 'GET_STR_FULL_NAME' } },
      ],
    },
  ],
});

// Add tests for SCREAMING_SNAKE_CASE syntax
ruleTesterTs.run('no-hungarian-screaming-snake-case', noHungarian, {
  valid: [
    // Valid SCREAMING_SNAKE_CASE examples - no Hungarian notation
    'const API_KEY = "abc123";',
    'const MAX_RETRY_COUNT = 5;',
    'const IS_PRODUCTION = process.env.NODE_ENV === "production";',
    'const USER_ROLES = ["admin", "user", "guest"];',
    'export const DATABASE_CONFIG = { host: "localhost", port: 3306 };',
    'const { API_URL, TOKEN_EXPIRY } = config;',
    `
    class Config {
      static MAX_CONNECTIONS = 100;
      static DEFAULT_TIMEOUT = 30000;
    }
    `,
    `
    function getConfig() {
      const ENV_MODE = process.env.NODE_ENV;
      return { mode: ENV_MODE };
    }
    `,
    `
    enum LogLevel {
      DEBUG,
      INFO,
      WARN,
      ERROR
    }
    `,
    `
    const APP_CONSTANTS = {
      MAX_FILE_SIZE: 5 * 1024 * 1024,
      ALLOWED_EXTENSIONS: ['.jpg', '.png', '.gif']
    };
    `,

    // Valid test cases for class methods and properties in SCREAMING_SNAKE_CASE
    `
    class Constants {
      static API_URL = "https://api.example.com";
      static MAX_CONNECTIONS = 100;
      
      static GET_API_URL() {
        return Constants.API_URL;
      }
      
      static SET_MAX_CONNECTIONS(value: number) {
        Constants.MAX_CONNECTIONS = value;
      }
    }
    `,

    `
    class Configuration {
      DEFAULT_TIMEOUT = 30000;
      ERROR_MESSAGES = {
        NOT_FOUND: "Resource not found",
        UNAUTHORIZED: "Unauthorized access"
      };
      
      GET_TIMEOUT() {
        return this.DEFAULT_TIMEOUT;
      }
      
      GET_ERROR_MESSAGE(code: string) {
        return this.ERROR_MESSAGES[code as keyof typeof this.ERROR_MESSAGES];
      }
    }
    `,

    `
    class Logger {
      static LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3
      };
      
      static FORMAT_LOG_MESSAGE(level: string, message: string) {
        return \`[\${level}] \${message}\`;
      }
    }
    `,

    // Valid cases where type markers might appear as part of normal words
    'const strawberry = "fruit";',
    'const booking = { id: 123 };',
    'const stringify = (obj) => JSON.stringify(obj);',
    'const strongPassword = "p@ssw0rd";',
    'function interact(element) { return element; }',
    'class Instructor { teach() {} }',
    'const mapLocation = { lat: 0, lng: 0 };',
    'const boolesk = "Swedish book";', // made-up word
    'const classroom = "101";',
    'const setTimeoutToZero = () => {};',

    // Valid multi-word identifiers without type markers separated by boundaries
    'const userDataInfo = { name: "John" };',
    'const mapViewHelper = new Helper();',
    'function calculateTotalSum() {}',
    'class DataViewManager {}',
    'const colorBlue = "#0000FF";',

    // Valid usage of type-like words
    'const Stringent = "strict";',
    'function parseIntended() {}',
  ],
  invalid: [
    // Invalid SCREAMING_SNAKE_CASE examples - with Hungarian notation
    {
      code: 'const STR_API_KEY = "abc123";',
      errors: [{ messageId: 'noHungarian', data: { name: 'STR_API_KEY' } }],
    },
    {
      code: 'const NUM_MAX_RETRY = 5;',
      errors: [{ messageId: 'noHungarian', data: { name: 'NUM_MAX_RETRY' } }],
    },
    {
      code: 'const BOOL_IS_PRODUCTION = true;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'BOOL_IS_PRODUCTION' } },
      ],
    },
    {
      code: 'const ARR_USER_ROLES = ["admin", "user", "guest"];',
      errors: [{ messageId: 'noHungarian', data: { name: 'ARR_USER_ROLES' } }],
    },
    {
      code: 'export const OBJ_DATABASE_CONFIG = { host: "localhost", port: 3306 };',
      errors: [
        { messageId: 'noHungarian', data: { name: 'OBJ_DATABASE_CONFIG' } },
      ],
    },
    {
      code: `
      class ConfigClass {
        static INT_MAX_CONNECTIONS = 100;
        static NUM_DEFAULT_TIMEOUT = 30000;
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'ConfigClass' } },
        { messageId: 'noHungarian', data: { name: 'INT_MAX_CONNECTIONS' } },
        { messageId: 'noHungarian', data: { name: 'NUM_DEFAULT_TIMEOUT' } },
      ],
    },
    {
      code: `
      function getEnvConfig() {
        const STR_ENV_MODE = process.env.NODE_ENV;
        return { mode: STR_ENV_MODE };
      }
      `,
      errors: [{ messageId: 'noHungarian', data: { name: 'STR_ENV_MODE' } }],
    },
    {
      code: 'const API_KEY_STRING = "abc123";',
      errors: [{ messageId: 'noHungarian', data: { name: 'API_KEY_STRING' } }],
    },
    {
      code: 'const MAX_RETRY_NUMBER = 5;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'MAX_RETRY_NUMBER' } },
      ],
    },
    {
      code: 'const IS_PRODUCTION_BOOLEAN = true;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'IS_PRODUCTION_BOOLEAN' } },
      ],
    },
    {
      code: 'const USER_ROLES_ARRAY = ["admin", "user", "guest"];',
      errors: [
        { messageId: 'noHungarian', data: { name: 'USER_ROLES_ARRAY' } },
      ],
    },
    // Test cases for class methods and properties with Hungarian notation in SCREAMING_SNAKE_CASE
    {
      code: `
      class ConfigManager {
        static GET_STR_API_KEY() {
          return "abc123";
        }
        
        static SET_NUM_MAX_RETRY(value: number) {
          return value;
        }
        
        static ARR_ALLOWED_DOMAINS = ["example.com", "test.com"];
        static OBJ_DEFAULT_SETTINGS = { timeout: 3000 };
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'GET_STR_API_KEY' } },
        { messageId: 'noHungarian', data: { name: 'SET_NUM_MAX_RETRY' } },
        { messageId: 'noHungarian', data: { name: 'ARR_ALLOWED_DOMAINS' } },
        { messageId: 'noHungarian', data: { name: 'OBJ_DEFAULT_SETTINGS' } },
      ],
    },
    {
      code: `
      class User {
        STR_USERNAME = "admin";
        NUM_ACCESS_LEVEL = 5;
        BOOL_IS_ACTIVE = true;
        
        GET_STR_FULL_NAME() {
          return "Admin User";
        }
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'STR_USERNAME' } },
        { messageId: 'noHungarian', data: { name: 'NUM_ACCESS_LEVEL' } },
        { messageId: 'noHungarian', data: { name: 'BOOL_IS_ACTIVE' } },
        { messageId: 'noHungarian', data: { name: 'GET_STR_FULL_NAME' } },
      ],
    },
    // Type markers in the middle of camelCase names (word boundary with uppercase following)
    {
      code: 'const userStrName = "John";',
      errors: [{ messageId: 'noHungarian', data: { name: 'userStrName' } }],
    },
    {
      code: 'const dataNumCount = 42;',
      errors: [{ messageId: 'noHungarian', data: { name: 'dataNumCount' } }],
    },
    {
      code: 'const userBoolIsActive = true;',
      errors: [
        { messageId: 'noHungarian', data: { name: 'userBoolIsActive' } },
      ],
    },
    {
      code: 'function getUserObjData() { return {}; }',
      errors: [{ messageId: 'noHungarian', data: { name: 'getUserObjData' } }],
    },
    {
      code: 'const configArrOptions = [];',
      errors: [
        { messageId: 'noHungarian', data: { name: 'configArrOptions' } },
      ],
    },

    // Type markers in the middle of SCREAMING_SNAKE_CASE names
    {
      code: 'const USER_STR_NAME = "John";',
      errors: [{ messageId: 'noHungarian', data: { name: 'USER_STR_NAME' } }],
    },
    {
      code: 'const DATA_NUM_COUNT = 42;',
      errors: [{ messageId: 'noHungarian', data: { name: 'DATA_NUM_COUNT' } }],
    },
    {
      code: 'const CONFIG_OBJ_SETTINGS = {};',
      errors: [
        { messageId: 'noHungarian', data: { name: 'CONFIG_OBJ_SETTINGS' } },
      ],
    },

    // Class methods and properties with type markers in the middle
    {
      code: `
      class User {
        getUserStrName() {
          return "John";
        }
        userNumAge = 30;
      }
      `,
      errors: [
        { messageId: 'noHungarian', data: { name: 'getUserStrName' } },
        { messageId: 'noHungarian', data: { name: 'userNumAge' } },
      ],
    },

    // PascalCase with type markers in the middle
    {
      code: 'class UserObjData {}',
      errors: [{ messageId: 'noHungarian', data: { name: 'UserObjData' } }],
    },
    {
      code: 'interface ConfigArrSettings {}',
      errors: [
        { messageId: 'noHungarian', data: { name: 'ConfigArrSettings' } },
      ],
    },
    {
      code: 'type UserStrName = string;',
      errors: [{ messageId: 'noHungarian', data: { name: 'UserStrName' } }],
    },

    // Full Words with Capitalization
    {
      code: 'const userStringName = "John";',
      errors: [{ messageId: 'noHungarian', data: { name: 'userStringName' } }],
    },
    {
      code: 'const dataNumberCount = 42;',
      errors: [{ messageId: 'noHungarian', data: { name: 'dataNumberCount' } }],
    },
    {
      code: 'function getUserObjectData() { return {}; }',
      errors: [
        { messageId: 'noHungarian', data: { name: 'getUserObjectData' } },
      ],
    },
    {
      code: 'const configArrayOptions = [];',
      errors: [
        { messageId: 'noHungarian', data: { name: 'configArrayOptions' } },
      ],
    },

    // Full words with SCREAMING_SNAKE_CASE
    {
      code: 'const USER_STRING_NAME = "John";',
      errors: [
        { messageId: 'noHungarian', data: { name: 'USER_STRING_NAME' } },
      ],
    },
    {
      code: 'const CONFIG_ARRAY_OPTIONS = [];',
      errors: [
        { messageId: 'noHungarian', data: { name: 'CONFIG_ARRAY_OPTIONS' } },
      ],
    },
    {
      code: `
      function createProcessor(transformFn: (param: string) => string) {
        return function(input: string) {
          return transformFn(input);
        };
      }
  
      const processor = createProcessor(param => param.toUpperCase());
      `,
      errors: [{ messageId: 'noHungarian', data: { name: 'transformFn' } }],
    },
  ],
});
