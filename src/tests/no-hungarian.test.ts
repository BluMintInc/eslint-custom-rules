import type { TestCaseError } from '@typescript-eslint/utils/dist/ts-eslint';
import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

const messageFor = (name: string) =>
  `Identifier "${name}" encodes its type through a prefix or suffix (Hungarian notation). Type-coded names hide the domain concept and become misleading when the underlying type changes. Rename it to a domain-focused name without the type marker and rely on TypeScript for type information.`;

const errorFor = (name: string): TestCaseError<'noHungarian'> =>
  ({
    message: messageFor(name),
  } as unknown as TestCaseError<'noHungarian'>);

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

    // Test for allowed descriptive suffixes
    `
    // Formatted suffix
    const date = new Date();
    const dateFormatted = format(date);
    const priceFormatted = formatter.format(price);

    // Parsed suffix
    const dateParsed = strict.parseDate(date);
    const authUserParsed = escapedParse(authUser);

    // Processed suffix
    const initialUrlProcessed = useRef(false);

    // Transformed suffix
    const hitsTransformed = transformHits(hits);

    // Converted suffix
    const hitsConverted = useConvertedHits(hits);
    const priceConverted = generatePrice(price);

    // Rendered suffix
    const tabsRendered = useMemo(() => { return null; });
    const cardRendered = renderCard(hit);

    // Display/Displayed suffix
    const rankDisplayed = useDisplayedRank({ rank });
    const authOptionsDisplay = useAuthMethodsDisplay();
    `,

    // Test for the specific bug report example
    `
    function ChannelGroupSidebar() {
      const date = new Date();
      const dateFormatted = date ? format(date) : undefined;
      return dateFormatted;
    }
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

    // Valid test for imported function with Hungarian notation parameters
    {
      code: `
        import { processDataWithHungarianParams, variableString } from './external-module';
        
        // Using the imported function with Hungarian notation parameters
        const result = processDataWithHungarianParams(variableString, 5, true);
        
        function foo(data: string) {
          // Local function with clean parameters
          return processDataWithHungarianParams(variableString, 10, false);
        }
      `,
    },
  ],
  invalid: [
    {
      code: 'const usernameString: string = "abc";',
      errors: [errorFor('usernameString')],
    },
    {
      code: 'const isReadyBoolean: boolean = true;',
      errors: [errorFor('isReadyBoolean')],
    },
    {
      code: 'const countNumber: number = 5;',
      errors: [errorFor('countNumber')],
    },
    {
      code: 'let itemsArray: string[] = [];',
      errors: [errorFor('itemsArray')],
    },
    {
      code: 'const userDataObject = { name: "John", age: 30 };',
      errors: [errorFor('userDataObject')],
    },

    {
      code: 'function test() { const resultString = "test"; return resultString; }',
      errors: [errorFor('resultString')],
    },
    {
      code: 'if (condition) { let countNumber = 0; countNumber++; }',
      errors: [errorFor('countNumber')],
    },
    {
      code: 'for (let indexNumber = 0; indexNumber < 10; indexNumber++) { console.log(indexNumber); }',
      errors: [errorFor('indexNumber')],
    },

    {
      code: 'const strName = "John";',
      errors: [errorFor('strName')],
    },
    {
      code: 'const intAge = 30;',
      errors: [errorFor('intAge')],
    },
    {
      code: 'const boolIsActive = true;',
      errors: [errorFor('boolIsActive')],
    },

    {
      code: 'const nameString = "John", ageNumber = 30;',
      errors: [errorFor('nameString'), errorFor('ageNumber')],
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
        errorFor('outerString'),
        errorFor('innerString'),
        errorFor('nestedString'),
      ],
    },

    {
      code: 'const userObjectArray = [{ name: "John" }];',
      errors: [errorFor('userObjectArray')],
    },

    {
      code: 'const arrayOfItems = ["a", "b", "c"];',
      errors: [errorFor('arrayOfItems')],
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
        errorFor('customFunction'),
        errorFor('paramString'),
        errorFor('callCustomFunction'),
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
        errorFor('customFunction'),
        errorFor('paramString'),
        errorFor('paramNumber'),
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
      errors: [errorFor('TestClass'), errorFor('inputString')],
    },
    {
      code: `const fnF = function(param: string) {
      return param.trim();
    };

    fnF('  test  ');`,
      errors: [errorFor('fnF')],
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
      errors: [errorFor('getNameString')],
    },
    {
      code: `
        class DataProcessor {
          processArrayItems(itemsArray: string[]) {
            return itemsArray.join(", ");
          }
        }
      `,
      errors: [errorFor('processArrayItems'), errorFor('itemsArray')],
    },
    {
      code: `
        class Config {
          static getOptionsObject() {
            return { key: "value" };
          }
        }
      `,
      errors: [errorFor('getOptionsObject')],
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
        errorFor('nameString'),
        errorFor('ageNumber'),
        errorFor('isActiveBoolean'),
      ],
    },
    {
      code: `
        class Config {
          static apiUrlString: string = "https://api.example.com";
          static maxCountNumber: number = 100;
        }
      `,
      errors: [errorFor('apiUrlString'), errorFor('maxCountNumber')],
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
        errorFor('dataArray'),
        errorFor('objItem'),
        errorFor('getItemsArray'),
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
        errorFor('STR_USERNAME'),
        errorFor('NUM_ACCESS_LEVEL'),
        errorFor('BOOL_IS_ACTIVE'),
        errorFor('GET_STR_FULL_NAME'),
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
      errors: [errorFor('STR_API_KEY')],
    },
    {
      code: 'const NUM_MAX_RETRY = 5;',
      errors: [errorFor('NUM_MAX_RETRY')],
    },
    {
      code: 'const BOOL_IS_PRODUCTION = true;',
      errors: [errorFor('BOOL_IS_PRODUCTION')],
    },
    {
      code: 'const ARR_USER_ROLES = ["admin", "user", "guest"];',
      errors: [errorFor('ARR_USER_ROLES')],
    },
    {
      code: 'export const OBJ_DATABASE_CONFIG = { host: "localhost", port: 3306 };',
      errors: [errorFor('OBJ_DATABASE_CONFIG')],
    },
    {
      code: `
      class ConfigClass {
        static INT_MAX_CONNECTIONS = 100;
        static NUM_DEFAULT_TIMEOUT = 30000;
      }
      `,
      errors: [
        errorFor('ConfigClass'),
        errorFor('INT_MAX_CONNECTIONS'),
        errorFor('NUM_DEFAULT_TIMEOUT'),
      ],
    },
    {
      code: `
      function getEnvConfig() {
        const STR_ENV_MODE = process.env.NODE_ENV;
        return { mode: STR_ENV_MODE };
      }
      `,
      errors: [errorFor('STR_ENV_MODE')],
    },
    {
      code: 'const API_KEY_STRING = "abc123";',
      errors: [errorFor('API_KEY_STRING')],
    },
    {
      code: 'const MAX_RETRY_NUMBER = 5;',
      errors: [errorFor('MAX_RETRY_NUMBER')],
    },
    {
      code: 'const IS_PRODUCTION_BOOLEAN = true;',
      errors: [errorFor('IS_PRODUCTION_BOOLEAN')],
    },
    {
      code: 'const USER_ROLES_ARRAY = ["admin", "user", "guest"];',
      errors: [errorFor('USER_ROLES_ARRAY')],
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
        errorFor('GET_STR_API_KEY'),
        errorFor('SET_NUM_MAX_RETRY'),
        errorFor('ARR_ALLOWED_DOMAINS'),
        errorFor('OBJ_DEFAULT_SETTINGS'),
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
        errorFor('STR_USERNAME'),
        errorFor('NUM_ACCESS_LEVEL'),
        errorFor('BOOL_IS_ACTIVE'),
        errorFor('GET_STR_FULL_NAME'),
      ],
    },
    // Type markers in the middle of camelCase names (word boundary with uppercase following)
    {
      code: 'const userStrName = "John";',
      errors: [errorFor('userStrName')],
    },
    {
      code: 'const dataNumCount = 42;',
      errors: [errorFor('dataNumCount')],
    },
    {
      code: 'const userBoolIsActive = true;',
      errors: [errorFor('userBoolIsActive')],
    },
    {
      code: 'function getUserObjData() { return {}; }',
      errors: [errorFor('getUserObjData')],
    },
    {
      code: 'const configArrOptions = [];',
      errors: [errorFor('configArrOptions')],
    },

    // Type markers in the middle of SCREAMING_SNAKE_CASE names
    {
      code: 'const USER_STR_NAME = "John";',
      errors: [errorFor('USER_STR_NAME')],
    },
    {
      code: 'const DATA_NUM_COUNT = 42;',
      errors: [errorFor('DATA_NUM_COUNT')],
    },
    {
      code: 'const CONFIG_OBJ_SETTINGS = {};',
      errors: [errorFor('CONFIG_OBJ_SETTINGS')],
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
      errors: [errorFor('getUserStrName'), errorFor('userNumAge')],
    },

    // PascalCase with type markers in the middle
    {
      code: 'class UserObjData {}',
      errors: [errorFor('UserObjData')],
    },
    {
      code: 'interface ConfigArrSettings {}',
      errors: [errorFor('ConfigArrSettings')],
    },
    {
      code: 'type UserStrName = string;',
      errors: [errorFor('UserStrName')],
    },

    // Full Words with Capitalization
    {
      code: 'const userStringName = "John";',
      errors: [errorFor('userStringName')],
    },
    {
      code: 'const dataNumberCount = 42;',
      errors: [errorFor('dataNumberCount')],
    },
    {
      code: 'function getUserObjectData() { return {}; }',
      errors: [errorFor('getUserObjectData')],
    },
    {
      code: 'const configArrayOptions = [];',
      errors: [errorFor('configArrayOptions')],
    },

    // Full words with SCREAMING_SNAKE_CASE
    {
      code: 'const USER_STRING_NAME = "John";',
      errors: [errorFor('USER_STRING_NAME')],
    },
    {
      code: 'const CONFIG_ARRAY_OPTIONS = [];',
      errors: [errorFor('CONFIG_ARRAY_OPTIONS')],
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
      errors: [errorFor('transformFn')],
    },
  ],
});
