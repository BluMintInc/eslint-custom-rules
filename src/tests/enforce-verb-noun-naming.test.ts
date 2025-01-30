import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

ruleTesterTs.run('enforce-verb-noun-naming', enforceVerbNounNaming, {
  valid: [
    // Function declarations with verb phrases
    {
      code: `function fetchUserData() { return null; }`,
    },
    {
      code: `function processRequest() { return null; }`,
    },
    {
      code: `function syncMembership() { return null; }`,
    },
    {
      code: `function fixBug() { return null; }`,
    },
    {
      code: `function setConfig() { return null; }`,
    },
    {
      code: `function getData() { return null; }`,
    },
    {
      code: `function getUser() { return null; }`,
    },
    {
      code: `function logError() { return null; }`,
    },
    {
      code: `function addUser() { return null; }`,
    },
    {
      code: `function mapData() { return null; }`,
    },
    {
      code: `function runTask() { return null; }`,
    },
    {
      code: `function useHook() { return null; }`,
    },
    {
      code: `function hasPermission() { return null; }`,
    },
    {
      code: `function isValid() { return null; }`,
    },
    {
      code: `function doAction() { return null; }`,
    },
    {
      code: `function goHome() { return null; }`,
    },

    // Arrow functions with verb phrases
    {
      code: `const fetchData = () => null;`,
    },
    {
      code: `const processInput = () => null;`,
    },

    // Functions starting with "to" or "with"
    {
      code: `function toNumber(value) { return +value; }`,
    },
    {
      code: `const withLogging = (fn) => (...args) => { console.log(...args); return fn(...args); }`,
    },
    {
      code: `class Converter { toString() { return ''; } }`,
    },

    // Data types with noun phrases
    {
      code: `const userProfile = { name: 'John' };`,
    },
    {
      code: `const requestProcessor = { handle: () => {} };`,
    },

    // Classes with noun phrases
    {
      code: `class UserService { }`,
    },
    {
      code: `class DataProcessor { }`,
    },

    // Class methods with verb phrases
    {
      code: `class Service {
        fetchData() { }
        processRequest() { }
        toString() { }
      }`,
    },

    // Variables that are not functions (should be ignored)
    {
      code: `const data = { value: true };`,
    },
    {
      code: `const userProfile = { name: 'John' };`,
    },
    {
      code: `class DataProcessor { }`,
    },

    // React components (should be ignored)
    {
      code: `/** @jsx jsx */
      function UserCard() {
        return <div>User</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const ProfileView = () => {
        return <div>Profile</div>;
      }`,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
  invalid: [
    // Invalid function names (not verb phrases)
    {
      code: `function userData() { return null; }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `function data() { return null; }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `function user() { return null; }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `function profile() { return null; }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },

    // Invalid arrow function names (not verb phrases)
    {
      code: `const data = () => null;`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `const user = () => null;`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },

    // Invalid class method names (not verb phrases)
    {
      code: `class Service {
        data() { }
        user() { }
      }`,
      errors: [
        { messageId: 'functionVerbPhrase' },
        { messageId: 'functionVerbPhrase' },
      ],
    },
  ],
});
