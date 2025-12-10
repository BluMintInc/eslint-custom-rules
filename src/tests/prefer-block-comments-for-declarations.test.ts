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
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'This function fetches user data' },
          },
        ],
        output: `/** This function fetches user data */
      function getUser() {
        return fetch('/api/user');
      }`,
      },

      // Variable with line comment
      {
        code: `// API base URL
      const BASE_URL = 'https://api.example.com';`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'API base URL' },
          },
        ],
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
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User type' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Name of user' },
          },
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
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User type alias' },
          },
        ],
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
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User class' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User ID' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User name' },
          },
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
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User roles' },
          },
        ],
        output: `/** User roles */
      enum Role {
        ADMIN,
        USER
      }`,
      },

      // Empty line comment should fix to empty block comment but message uses label
      {
        code: `//
      const EMPTY = true;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: '' },
          },
        ],
        output: `/** */
      const EMPTY = true;`,
      },
    ],
  },
);

// Additional valid cases to ensure ESLint directive comments are ignored
ruleTesterTs.run(
  'prefer-block-comments-for-declarations (eslint directives)',
  preferBlockCommentsForDeclarations,
  {
    valid: [
      // Top-of-file block ESLint disables before imports (should be ignored)
      `/* eslint-disable no-console */
/* eslint-disable eqeqeq */
/* eslint-disable max-params */
/* eslint-disable no-undef */
/* eslint-disable no-alert */
import { ComponentProps, ComponentType, FC, useMemo } from 'react';

// A real declaration after imports
/** description */
export type AfterImports = { a: number };`,

      // Block ESLint disable directly before a declaration
      `/* eslint-disable no-console */
function foo() { console.log('x'); }`,

      // Block ESLint enable directly before a declaration
      `/* eslint-enable no-console */
const value = 1;`,

      // Block eslint rule configuration before a declaration
      `/* eslint eqeqeq: "error", curly: "error" */
interface Cfg { id: number }`,

      // Block globals declaration
      `/* global window, document */
type Env = { w: typeof window; d: typeof document };`,

      // Block exported directive
      `/* exported SOME_CONST */
const SOME_CONST = 42;`,

      // Line eslint rule configuration before a declaration
      `// eslint eqeqeq: 0, curly: 0
class A {}`,

      // Line exported directive before a declaration
      `// exported FOO
const FOO = 'bar';`,

      // Line global directive (singular) before a declaration
      `// global process
enum E { A, B }`,

      // Ensure trimming/spacing is handled
      `   //    eslint-disable-next-line no-unused-vars
const X = 1;`,

      // Ensure weird spacing in block comment is ignored
      `/*eslint-disable no-alert*/
function alertUser() { /* noop */ }`,

      // Ensure eslint-enable-next-line style comments are ignored if present
      `// eslint-disable-next-line no-unused-vars
const unused = 0;`,
    ],
    invalid: [],
  },
);
