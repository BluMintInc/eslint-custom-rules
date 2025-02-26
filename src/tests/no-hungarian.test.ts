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

    // Destructuring assignments (should be ignored)
    'const { usernameString } = userData;',

    // Function parameters (should be ignored)
    'function processUser(nameString) { return nameString.toUpperCase(); }',

    // Imported constants (should be ignored)
    'import { API_URL_STRING } from "./config";',

    // Variables with same name as type (edge case)
    'const String = "abc";',
    'const Number = 123;',
    'const Boolean = true;',
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

    // Test with custom prefixes
    {
      code: 'const strName = "John";',
      options: [{ disallowedPrefixes: ['str', 'int', 'bool'] }],
      errors: [{ messageId: 'noHungarian', data: { name: 'strName' } }],
    },

    // Test with disabling allowClassInstances
    {
      code: 'const userController = new Controller();',
      options: [{ allowClassInstances: false }],
      errors: [{ messageId: 'noHungarian', data: { name: 'userController' } }],
    },
  ],
});
