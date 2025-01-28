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

    // React components (PascalCase)
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
      code: `function request() { return null; }`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },

    // Invalid arrow function names (not verb phrases)
    {
      code: `const data = () => null;`,
      errors: [{ messageId: 'functionVerbPhrase' }],
    },
    {
      code: `const userList = () => null;`,
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
      code: `class processRequest { }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },
    {
      code: `class fetchData { }`,
      errors: [{ messageId: 'dataTypeNounPhrase' }],
    },

    // Invalid class method names (not verb phrases)
    {
      code: `class Service {
        data() { }
        request() { }
      }`,
      errors: [
        { messageId: 'functionVerbPhrase' },
        { messageId: 'functionVerbPhrase' },
      ],
    },

    // Invalid React component names (not PascalCase)
    {
      code: `/** @jsx jsx */
      function userCard() {
        return <div>User</div>;
      }`,
      errors: [{ messageId: 'reactComponentPascalCase' }],
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    {
      code: `/** @jsx jsx */
      const profileView = () => {
        return <div>Profile</div>;
      }`,
      errors: [{ messageId: 'reactComponentPascalCase' }],
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  ],
});
