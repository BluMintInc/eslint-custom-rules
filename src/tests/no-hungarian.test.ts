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

    // Issue #1217 Category 1: TypeScript generic type parameters with a `T`
    // prefix are a TS naming convention ("Type parameter"), never Hungarian.
    // The declaration and any reference to it must be exempt.
    'function identity<TNumber>(x: TNumber): TNumber { return x; }',
    'type ExtendFunctionProps<TFunc, TNewParams> = TFunc;',
    'interface Container<TElement> { item: TElement; }',
    'const wrap = <TKey,>(k: TKey): TKey => k;',
    'function first<TArr extends unknown[]>(a: TArr) { return a; }',
    'class Box<TValue> { value!: TValue; }',
    'type Resolve<TArgs, TReturn> = (...args: TArgs[]) => TReturn;',
    'type Paths<TObj, TDepth extends number = 5> = keyof TObj;',
    'type ArrayOfLength<TLength extends number, TKeys> = TLength;',
    'type Identity<TData> = TData;',
    // Type parameter referenced inside a function body (must also be exempt)
    'function clone<TObj>(o: TObj) { const copy: TObj = o; return copy; }',
    // infer-introduced type parameters
    'type Unwrap<TUnresolved> = TUnresolved extends (...a: infer TArgs) => infer TReturn ? TArgs : TReturn;',

    // Issue #1217 Category 2: compound descriptive names where a type-like word
    // carries domain meaning rather than tagging the entity's type.
    // Plural domain nouns ("Numbers"/"Integers") describe what is validated.
    'function areBothFiniteNumbers(a: number, b: number) { return true; }',
    'function areBothPositiveIntegers(a: number, b: number) { return true; }',
    // A FULL type word as an interior SCREAMING_SNAKE segment qualifies a variant.
    'const EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT = { isEditing: true };',
    // The rule judges the identifier name, never the type annotation text.
    'type TeamSize = Readonly<Range<number>>;',
    // Type-utility / conversion names: the type-word denotes a type concept.
    'type StringToNumber<T extends string> = T extends `${infer N extends number}` ? N : never;',
    'type ExtractNumber<T> = T;',
    'type FuncKeys<T> = { [K in keyof T]: T[K] extends (...args: readonly any[]) => any ? K : never }[keyof T];',
    'type PromiseOrValue<T> = T extends Promise<infer U> ? Promise<U> : Promise<T> | T;',
    'type CapitalizedString = `${Capitalize<string>}`;',

    // Issue #1246: false positives when an abbreviation marker is a substring
    // inside a real word (not a standalone camelCase token).
    `export type GuardFlowIdWelcomeMintCongrats = string;`,
    `export const printBanner = 'printing';`,
    `export const sprintCount = 0;`,
    `export const mintToken = 'mint';`,
    `export const pointValue = 0;`,
    `export const streamData = new ReadableStream();`,
    `export const enumerateItems = () => [];`,
    `export const marriageDate = new Date();`,
    `type WelcomeMintDialog = { open: boolean };`,
    // Words that merely contain an abbreviation marker as a substring of a
    // real English word — none of these are whole camelCase tokens.
    `const objective = 'goal';`,
    `const functional = () => {};`,
    `const numeral = 1;`,
    `const integer = 1;`,
    `const stringent = 'strict';`,
    `const printQueue = [];`,
    `const constraint = 'x';`,
    `const sprintBacklog = [];`,

    // Issue #1250: full-type-word markers must not be flagged when they
    // appear as middle camelCase segments (domain nouns, not type tags).
    'export function useRegistrationFunctionBase() { return { a: 1 }; }',
    'const useRegistrationFunctionBase = () => ({ a: 1 });',
    'const cloudFunctionRegistry = {};',
    'function registrationFunctionFactory() { return () => 1; }',
    'const serverlessFunctionConfig = {};',
    // Middle-segment occurrences of other full-type-words are also domain nouns.
    'const userStringName = "John";',
    'const dataNumberCount = 42;',
    'function getUserObjectData() { return {}; }',
    'const configArrayOptions = [];',
    'const checkBooleanResult = true;',
    'const parsePromiseValue = () => {};',
    'const getObjectMergeResult = () => {};',
    // React hooks with a full-type-word as a middle segment.
    'export const useCloudFunctionHandler = () => {};',
    'function useAsyncFunctionQueue() { return []; }',
    // Full-type-word as middle segment in multi-segment names (various positions).
    'const registrationFunctionFactory = () => () => 1;',
    'const cloudFunctionConfig = {};',
    'const httpFunctionRegistry = {};',

    // Issue #1255: Fn/Func/Function are function-ROLE designators (like
    // callback/handler/predicate), not rot-prone type tags — a *Fn value is
    // intrinsically and permanently callable, so the marker never misleads.
    // compareFn/mapFn are the ECMAScript/MDN-canonical parameter names.
    'const checkFn = checkFunctions[0];',
    'const compareFn = (a: number, b: number) => a - b;',
    'const mapFn = (x: number) => x * 2;',
    'const sortFn = (a: number, b: number) => a - b;',
    'const handlerFn = () => {};',
    'const transformFn = (input: string) => input.toUpperCase();',
    // Func / Function full-word variants of the same role-suffix class.
    'const renderFunc = () => null;',
    'const onCompleteFunction = () => undefined;',
    // customFunction is a function-role name (verb/domain + Function), exempt.
    'function customFunction(param: string) { return param; }',
    'const callCustomFunction = () => customFunction("test");',
    // Fn as a parameter, mirroring the ECMAScript sort(compareFn) convention.
    'function runSorted(items: number[], sortFn: (a: number, b: number) => number) { return [...items].sort(sortFn); }',
    'function createProcessor(transformFn: (p: string) => string) { return (i: string) => transformFn(i); }',
    // Fn/Func on class methods and members.
    'class Runner { runFn = () => {}; buildFunc() { return 1; } }',

    // Issue #1258: a real English word whose terminal camelCase segment merely
    // ENDS WITH an abbreviation marker (e.g. "Hint" ends with "int") must not be
    // flagged. The segment's initial capital doubles as the raw suffix-boundary
    // char, which previously short-circuited the exact-segment guard.
    `const appendHoldHint = (hints: readonly string[]) => {
      return [...hints, 'hold'];
    };`,
    'const showTapHint = () => undefined;',
    "const raceCheckpoint = { id: 'cp1' };",
    'function applyWetPaint(surface: string) { return surface; }',
    // A plain const with a "Hint" tail is domain wording, not Hungarian.
    "const iosHoldHint = 'x';",
    // Additional terminal "int"-marker English-word tails (Blueprint, Waypoint,
    // Checkpoint, Footprint, Constraint, Viewpoint, Fingerprint).
    'const renderBlueprint = () => null;',
    'const nextWaypoint = { x: 0, y: 0 };',
    'const savedCheckpoint = { id: 1 };',
    'const drawFootprint = () => {};',
    "const applyConstraint = 'x';",
    'const cameraViewpoint = { angle: 0 };',
    "const scanFingerprint = () => 'match';",
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
      // customFunction/callCustomFunction are function-role names and no longer
      // fire (#1255); the incidental primitive tag paramString still does.
      errors: [errorFor('paramString')],
    },
    {
      code: `
      function customFunction(paramString: string, paramNumber: number) {
        return paramString.repeat(paramNumber);
      }

      const result = customFunction('hello', 3);
      `,
      // customFunction is a function-role name and no longer fires (#1255); the
      // incidental primitive tags paramString/paramNumber still do.
      errors: [errorFor('paramString'), errorFor('paramNumber')],
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
      // processArrayItems has Array as a MIDDLE segment (process·Array·Items)
      // — a domain description, not a type tag. Only itemsArray fires (suffix).
      errors: [errorFor('itemsArray')],
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

    // Issue #1217 regression guards: genuine Hungarian MUST still fire after the
    // false-positive fixes above.
    // Single-letter type prefixes (b=boolean, i=integer/index).
    {
      code: 'const bIsActive = true;',
      errors: [errorFor('bIsActive')],
    },
    {
      code: 'const bActive = true;',
      errors: [errorFor('bActive')],
    },
    {
      code: 'const iCount = 0;',
      errors: [errorFor('iCount')],
    },
    // Abbreviation prefixes.
    {
      code: 'const strName = "John";',
      errors: [errorFor('strName')],
    },
    {
      code: 'const numCount = 5;',
      errors: [errorFor('numCount')],
    },
    {
      code: 'const arrItems = [];',
      errors: [errorFor('arrItems')],
    },
    {
      code: 'const arrUsers = [];',
      errors: [errorFor('arrUsers')],
    },
    {
      code: 'const objConfig = {};',
      errors: [errorFor('objConfig')],
    },
    // Full type-word SUFFIX (the canonical Hungarian suffix form).
    {
      code: 'const nameString = "John";',
      errors: [errorFor('nameString')],
    },
    // Abbreviation marker inside a TYPE name still fires (StringToNumber-style
    // exemption is for FULL type-words only, not abbreviations).
    {
      code: 'type UserStrName = string;',
      errors: [errorFor('UserStrName')],
    },
    {
      code: 'interface ConfigArrSettings { value: string; }',
      errors: [errorFor('ConfigArrSettings')],
    },
    {
      code: 'class UserObjData {}',
      errors: [errorFor('UserObjData')],
    },
    // A FULL type word in a TYPE name that is NOT a multi-word semantic concept
    // (no other descriptive segment) still fires.
    {
      code: 'const stringValue = "x";',
      errors: [errorFor('stringValue')],
    },
    // Issue #1246: genuine Hungarian abbreviation markers MUST still fire after
    // the false-positive fix (exact camelCase token match, not substring).
    {
      code: 'export const intValue = 42;',
      errors: [errorFor('intValue')],
    },
    {
      code: 'export const strName = "";',
      errors: [errorFor('strName')],
    },
    {
      code: 'export const arrItems = [];',
      errors: [errorFor('arrItems')],
    },
    // Abbreviation marker as middle camelCase token still fires.
    {
      code: 'const userIntCount = 0;',
      errors: [errorFor('userIntCount')],
    },
    // Abbreviation marker as suffix token still fires.
    {
      code: 'const valueStr = "";',
      errors: [errorFor('valueStr')],
    },

    // Issue #1258 regression guards: genuine Hungarian where the abbreviation
    // marker IS a full camelCase segment MUST still fire after reordering the
    // exact-segment guard ahead of the raw prefix/suffix boundary checks.
    {
      code: 'const resultStr = compute();',
      errors: [errorFor('resultStr')],
    },
    {
      code: 'const countNum = 5;',
      errors: [errorFor('countNum')],
    },
    {
      code: 'const intValue = 42;',
      errors: [errorFor('intValue')],
    },
    {
      code: 'const objData = {};',
      errors: [errorFor('objData')],
    },
    {
      code: 'const boolFlag = true;',
      errors: [errorFor('boolFlag')],
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

    // Issue #1217: a FULL type word as an interior SCREAMING_SNAKE segment (not
    // prefix, suffix, or directly before the final noun) qualifies a variant and
    // is descriptive, not Hungarian.
    'const EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT = { isEditing: true };',
    'const SELECTED_STRING_FILTER_OPTIONS = [];',

    // Issue #1250: camelCase names where a full-type-word is a MIDDLE segment
    // are domain names, not Hungarian notation. These must NOT be flagged.
    'const userStringName = "John";',
    'const dataNumberCount = 42;',
    'function getUserObjectData() { return {}; }',
    'const configArrayOptions = [];',
    // Function as middle segment in varied positions.
    'const cloudFunctionRegistry = {};',
    'const serverlessFunctionConfig = {};',
    'function registrationFunctionFactory() { return () => 1; }',
    'export function useRegistrationFunctionBase() { return { a: 1 }; }',
    // Boolean / Promise / Array as middle segments.
    'const checkBooleanResult = true;',
    'const parsePromiseValue = () => {};',
    'const configArraySettings = {};',
    // Multi-segment names where the full-type-word is neither first nor last.
    'const getObjectMergeResult = () => {};',
    'function processStringParser() { return ""; }',
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

    // Full-type-words as TRUE prefix or suffix still fire (Issue #1250 only
    // exempts MIDDLE-segment occurrences). Function is excluded from this set
    // entirely — it is a function-role designator, not a rot-prone type tag
    // (#1255) — so functionFactory/userFunction are valid, tested below.
    // String as prefix and suffix.
    {
      code: 'const stringValue = "x";',
      errors: [errorFor('stringValue')],
    },
    {
      code: 'const userString = "x";',
      errors: [errorFor('userString')],
    },
    // Number as prefix and suffix.
    {
      code: 'const numberCount = 0;',
      errors: [errorFor('numberCount')],
    },
    {
      code: 'const userNumber = 0;',
      errors: [errorFor('userNumber')],
    },
    // Boolean as prefix and suffix.
    {
      code: 'const booleanValue = true;',
      errors: [errorFor('booleanValue')],
    },
    {
      code: 'const activeBoolean = true;',
      errors: [errorFor('activeBoolean')],
    },
    // Array as prefix and suffix.
    {
      code: 'const arrayResults = [];',
      errors: [errorFor('arrayResults')],
    },
    {
      code: 'const resultArray = [];',
      errors: [errorFor('resultArray')],
    },

    // Full words with SCREAMING_SNAKE_CASE.
    // A FULL type word directly before the final noun (..._STRING_NAME) tags that
    // noun -> Hungarian. (Contrast EDITABLE_WRAPPER_NUMBER_PROPS_DEFAULT in the
    // valid set, where NUMBER is buried with multiple trailing segments.)
    {
      code: 'const USER_STRING_NAME = "John";',
      errors: [errorFor('USER_STRING_NAME')],
    },
    {
      code: 'const CONFIG_ARRAY_OPTIONS = [];',
      errors: [errorFor('CONFIG_ARRAY_OPTIONS')],
    },
    // Issue #1217: an ABBREVIATION marker as an interior SCREAMING_SNAKE segment
    // is always Hungarian (no English word is spelled STR/OBJ/...), even when a
    // FULL type word in the same position would be exempt.
    {
      code: 'const APP_STR_LABEL_DEFAULT = "x";',
      errors: [errorFor('APP_STR_LABEL_DEFAULT')],
    },
    {
      code: 'const WRAPPER_OBJ_PROPS_DEFAULT = {};',
      errors: [errorFor('WRAPPER_OBJ_PROPS_DEFAULT')],
    },
  ],
});

// Issue #1277: <entity>Number compounds are NOT Hungarian notation. The trailing
// "Number" is the head noun of the domain concept (the number OF an issue/line/
// round/version — GitHub's REST field is literally `issue_number`), not a type
// marker. Removing it yields a wrong name (`issue` = the whole object), so per
// the rule's stated purpose the suffix CARRIES the domain concept rather than
// hiding it. This generalizes the #640 PhoneNumber/EmailAddress/PostalCode
// carve-out to the whole category. Scoped to the full-word `Number` marker only.
ruleTesterTs.run('no-hungarian-domain-number-compounds', noHungarian, {
  valid: [
    // "Number" is the head noun of the domain concept, not a type marker.
    `function disableRule(rule: string, issueNumber: number) { return \`\${rule}#\${issueNumber}\`; }`,
    // Same identifier in variable position (Number(...) callee is unchecked).
    `const issueNumber = Number(raw);`,
    // Analogous domain compounds outside the hardcoded 3-entry allowlist.
    `function jumpToLine(lineNumber: number) { return lineNumber + 1; }`,
    `function advanceRound(roundNumber: number) { return roundNumber + 1; }`,
    // The suffix carries the concept even when the annotated type is `string`;
    // the rule is purely lexical and never inspects the type annotation.
    `function pinRelease(versionNumber: string) { return versionNumber; }`,
    // Further category members named in the issue.
    `const accountNumber = getAccount().id;`,
    `function scoreMatch(matchNumber: number) { return matchNumber; }`,
    `const orderNumber = 1001;`,
    // Prefixed variants generalize via the LAST head segment.
    `const githubIssueNumber = 42;`,
    `function goTo(currentLineNumber: number) { return currentLineNumber; }`,

    // Regression: the #640 ALLOWED_COMPOUND_NOUNS entries must still pass. These
    // were previously untested — locking them in.
    `const phoneNumber = user.phone;`,
    `function contact(phoneNumber: string) { return phoneNumber; }`,
    `const emailAddress = user.email;`,
    `const postalCode = address.zip;`,
    // A compound-noun preceded by a non-type word remains allowed.
    `const userPhoneNumber = user.phone;`,
  ],
  invalid: [
    // The fix is scoped to `Number` ONLY. Every other type marker still fires.
    // Abbreviation markers (str / num / obj / arr / bool) are unchanged.
    { code: 'const strName = "John";', errors: [errorFor('strName')] },
    // `num` (abbreviation) is distinct from the full word `Number`: numValue is
    // still Hungarian, whereas issueNumber (above) is a domain compound.
    { code: 'const numValue = 42;', errors: [errorFor('numValue')] },
    { code: 'const objData = {};', errors: [errorFor('objData')] },
    { code: 'const arrItems = [];', errors: [errorFor('arrItems')] },
    { code: 'const boolFlag = true;', errors: [errorFor('boolFlag')] },
    // Full-word type markers other than Number, as a suffix, still fire.
    { code: 'const nameString = "x";', errors: [errorFor('nameString')] },
    { code: 'const resultArray = [];', errors: [errorFor('resultArray')] },

    // Numeric-QUANTITY heads keep firing: here "Number" is a redundant type tag,
    // not the head noun of a concept (count/age/index ARE the number). Removing
    // it leaves a valid, equivalent name (count/age/index), which is the exact
    // signature of Hungarian notation.
    { code: 'const countNumber = 5;', errors: [errorFor('countNumber')] },
    { code: 'const ageNumber = 30;', errors: [errorFor('ageNumber')] },
    {
      code: 'for (let indexNumber = 0; indexNumber < 3; indexNumber++) {}',
      errors: [errorFor('indexNumber')],
    },
    {
      code: 'const maxCountNumber = 100;',
      errors: [errorFor('maxCountNumber')],
    },
    // A generic (non-entity) head keeps firing — the head noun is not a domain
    // concept that "has a number".
    { code: 'const resultNumber = 5;', errors: [errorFor('resultNumber')] },
    // Prefix `Number` is unaffected (out of scope): still Hungarian.
    { code: 'const numberCount = 0;', errors: [errorFor('numberCount')] },
    // A type-marker prefix glued to an allowed compound noun still fires: the
    // leading `str` is an unambiguous abbreviation tag.
    {
      code: 'const strPhoneNumber = "x";',
      errors: [errorFor('strPhoneNumber')],
    },

    // KNOWN, ACCEPTED TRADE-OFF (false negative): because the rule is purely
    // lexical and never compares the suffix to the declared type, a genuinely
    // mistyped domain compound such as `issueNumber: string` no longer fires.
    // Per this repo's philosophy (false negatives acceptable, false positives
    // not) this is the intended cost of unflagging the whole category. Documented
    // here so the trade-off is explicit; there is no assertion for it.
  ],
});
