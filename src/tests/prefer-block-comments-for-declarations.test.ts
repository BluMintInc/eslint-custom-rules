import { preferBlockCommentsForDeclarations } from '../rules/prefer-block-comments-for-declarations';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run(
  'prefer-block-comments-for-declarations',
  preferBlockCommentsForDeclarations,
  {
    valid: [
      // Function with block comment
      `/** This function fetches user data */
    function getUser() {
      return fetch('/api/user');
    }`,

      // Variable with block comment
      `/** API base URL */
    const BASE_URL = 'https://api.example.com';`,

      // ESLint directive comment should be ignored - disable-next-line
      `export type MatchSettingsElimination = Omit<
      MatchSettings<ConditionEliminationGame, ConditionEliminationMatch>,
      'maxTeamsPerMatch'
    > & {
      // eslint-disable-next-line no-unused-vars
      includesRedemption?: boolean;
      maxTeamsPerMatch: number;
    };`,

      // ESLint directive comment should be ignored - disable
      `// eslint-disable
    export type MatchSettingsEliminationWithDisable = {
      includesRedemption?: boolean;
      maxTeamsPerMatch: number;
    };
    // eslint-enable`,

      // ESLint directive comment should be ignored - eslint-env
      `// eslint-env node, browser
    export type EnvironmentType = {
      isNode: boolean;
      isBrowser: boolean;
    };`,

      // ESLint directive comment should be ignored - globals
      `// globals document, window
    export type BrowserGlobals = {
      doc: typeof document;
      win: typeof window;
    };`,
      // Interface with block comment
      `/** User type */
    interface User {
      id: number;
      /** Name of user */
      name: string;
    }`,

      // Type alias with block comment
      `/** User type alias */
    type UserType = {
      id: number;
      name: string;
    };`,

      // Class with block comment
      `/** User class */
    class User {
      /** User ID */
      id: number;

      /** User name */
      name: string;
    }`,

      // Enum with block comment
      `/** User roles */
    enum Role {
      ADMIN,
      USER
    }`,

      // Comments within function bodies should be ignored
      `function process() {
      // This is an inline comment that should be ignored
      const x = 5;
      return x;
    }`,

      // Multi-line block comments
      `/**
     * This is a multi-line block comment
     * that describes a function
     */
    function multiLineCommentFunction() {
      return true;
    }`,
    ],
    invalid: [
      // Function with line comment
      {
        code: `// This function fetches user data
      function getUser() {
        return fetch('/api/user');
      }`,
        errors: [{ messageId: 'preferBlockComment' }],
        output: `/** This function fetches user data */
      function getUser() {
        return fetch('/api/user');
      }`,
      },

      // Variable with line comment
      {
        code: `// API base URL
      const BASE_URL = 'https://api.example.com';`,
        errors: [{ messageId: 'preferBlockComment' }],
        output: `/** API base URL */
      const BASE_URL = 'https://api.example.com';`,
      },

      // Interface with line comment
      {
        code: `// User type
      interface User {
        id: number;
        // Name of user
        name: string;
      }`,
        errors: [
          { messageId: 'preferBlockComment' },
          { messageId: 'preferBlockComment' },
        ],
        output: `/** User type */
      interface User {
        id: number;
        /** Name of user */
        name: string;
      }`,
      },

      // Type alias with line comment
      {
        code: `// User type alias
      type UserType = {
        id: number;
        name: string;
      };`,
        errors: [{ messageId: 'preferBlockComment' }],
        output: `/** User type alias */
      type UserType = {
        id: number;
        name: string;
      };`,
      },

      // Class with line comment
      {
        code: `// User class
      class User {
        // User ID
        id: number;

        // User name
        name: string;
      }`,
        errors: [
          { messageId: 'preferBlockComment' },
          { messageId: 'preferBlockComment' },
          { messageId: 'preferBlockComment' },
        ],
        output: `/** User class */
      class User {
        /** User ID */
        id: number;

        /** User name */
        name: string;
      }`,
      },

      // Enum with line comment
      {
        code: `// User roles
      enum Role {
        ADMIN,
        USER
      }`,
        errors: [{ messageId: 'preferBlockComment' }],
        output: `/** User roles */
      enum Role {
        ADMIN,
        USER
      }`,
      },
    ],
  },
);
