import { noHungarian } from '../rules/no-hungarian';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-hungarian', noHungarian, {
  valid: [
    // Regular variable names without Hungarian notation
    'const username: string = "abc";',
    'const isReady: boolean = true;',
    'const count: number = 5;',
    'let items: string[] = [];',

    // Variables containing "stream" should not be flagged as Hungarian notation
    'const streamer = { name: "John" };',
    'const streamers = await getStreamers();',
    'const streamId = "abc123";',
    'const livestream = new LiveStream();',
    'const streamingService = getStreamingService();',

    // Bug report example - simplified for testing
    'const streamers = await db.collection(USER_COLLECTION).where("hidden.transmittingPlaybackId", "==", playbackId).limit(1).get();',
    'const streamer = streamers.docs[0];',

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

    // Edge case: variable name with type name as prefix - this is no longer considered Hungarian notation
    // since we're now checking for word boundaries and legitimate words
    // {
    //   code: 'const arrayOfItems = ["a", "b", "c"];',
    //   errors: [{ messageId: 'noHungarian', data: { name: 'arrayOfItems' } }],
    // },
  ],
});
