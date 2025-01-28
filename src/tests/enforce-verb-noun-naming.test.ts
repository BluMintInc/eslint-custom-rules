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
      }`,
    },

    // Ambiguous verb/noun names
    {
      code: `const update = { version: '1.0.0' };`, // update can be both verb and noun
    },
    {
      code: `function update() { }`, // update can be both verb and noun
    },
    {
      code: `const request = { url: '' };`, // request can be both verb and noun
    },
    {
      code: `function request() { }`, // request can be both verb and noun
    },

    // React components (noun phrases)
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

    // Invalid arrow function names (not verb phrases)
    {
      code: `const data = () => null;`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },

    // Invalid data type names (not noun phrases)
    {
      code: `const fetchUser = { id: 1 };`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },
    {
      code: `const processData = { value: true };`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },

    // Invalid class names (not noun phrases)
    {
      code: `class ProcessRequest { }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },
    {
      code: `class FetchData { }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },

    // Invalid class method names (not verb phrases)
    {
      code: `class Service {
        data() { }
      }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },

    // Invalid React component names (verb phrases)
    {
      code: `/** @jsx jsx */
      function FetchData() {
        return <div>Data</div>;
      }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const ProcessRequest = () => {
        return <div>Request</div>;
      }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
});
