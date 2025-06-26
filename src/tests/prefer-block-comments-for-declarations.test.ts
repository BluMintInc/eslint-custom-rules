import { preferBlockCommentsForDeclarations } from '../rules/prefer-block-comments-for-declarations';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('prefer-block-comments-for-declarations', preferBlockCommentsForDeclarations, {
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

// Block comment ESLint directives should be ignored - single directive
    `/* eslint-disable */
    import { ComponentProps, ComponentType, FC, useMemo } from 'react';`,

// Multiple block comments should be ignored if they're ESLint directives
    `/* eslint-disable */
    /* eslint-enable */
    /* eslint-env browser */
    import { ComponentProps, ComponentType, FC, useMemo } from 'react';`,

    // Bug report case - multiple ESLint directive comments before import
    `/* eslint-disable */
    /* eslint-disable */
    /* eslint-disable */
    /* eslint-disable */
    /* eslint-disable */
    import { ComponentProps, ComponentType, FC, useMemo } from 'react';`,

    // ESLint directive with specific rule names (block comments)
    `/* eslint-disable no-console */
    const logger = console.log;`,

    // ESLint directive with multiple rule names (block comments)
    `/* eslint-disable no-console, no-alert */
    const utilities = { log: console.log, alert: alert };`,

    // ESLint directive comments with line comments
    `// eslint-disable no-console
    const logger = console.log;`,

    // ESLint directive comments with multiple rules (line comments)
    `// eslint-disable no-console, no-alert
    const utilities = { log: console.log, alert: alert };`,

    // ESLint enable directive (block comment)
    `/* eslint-enable no-console */
    const logger = console.log;`,

    // ESLint enable directive (line comment)
    `// eslint-enable no-console
    const logger = console.log;`,

    // ESLint env directive (block comment)
    `/* eslint-env node */
    const fs = require('fs');`,

    // ESLint env directive (line comment)
    `// eslint-env node
    const fs = require('fs');`,

    // Global directive (block comment)
    `/* global window, document */
    const element = document.getElementById('app');`,

    // Global directive (line comment)
    `// global window, document
    const element = document.getElementById('app');`,

    // Globals directive (block comment)
    `/* globals window, document */
    const element = document.getElementById('app');`,

    // Globals directive (line comment)
    `// globals window, document
    const element = document.getElementById('app');`,

    // Mixed ESLint directives and regular comments should ignore ESLint directives
    `/* eslint-disable */
    /* This is a regular comment that should be converted */
    function mixedComments() {
      return true;
    }`,

    // ESLint directive with extra whitespace
    `/*   eslint-disable   no-console   */
    const logger = console.log;`,

    // ESLint directive with extra whitespace (line comment)
    `//   eslint-disable   no-console
    const logger = console.log;`,

    // Already JSDoc comments should be ignored
    `/** This is already a JSDoc comment */
    function alreadyJSDoc() {
      return true;
    }`,

    // Multi-line JSDoc comments should be ignored
    `/**
     * This is already a multi-line JSDoc comment
     * @returns {boolean} Always returns true
     */
    function multiLineJSDoc() {
      return true;
    }`,

    // ESLint directive in JSDoc format should be ignored
    `/** eslint-disable no-console */
    const logger = console.log;`,

    // Comments not directly before declarations should be ignored
    `/* This comment is not directly before a declaration */

    function notDirectlyBefore() {
      return true;
    }`,

    // Comments with empty lines between should be ignored
    `// This comment has empty lines

    const withEmptyLines = true;`,

    // Comments on the same line should be ignored
    `const sameLine = true; // This comment is on the same line`,

    // ESLint directive with complex rule names
    `/* eslint-disable */
    const complexRules = {};`,

    // ESLint directive with scoped rule names
    `/* eslint-disable */
    const scopedRule = {};`,

    // ESLint directive with plugin prefixes
    `/* eslint-disable */
    const reactHooksRule = {};`,

    // ESLint directive with mixed case
    `/* eslint-disable */
    const mixedCase = console.log;`,

    // ESLint directive with numbers in rule names
    `/* eslint-disable max-len, max-params */
    const numbersInRules = {};`,

    // ESLint directive with underscores and dashes
    `/* eslint-disable */
    const underscoresAndDashes = {};`,

    // Comments inside template literals should be ignored
    `const template = \`
      // This comment is inside a template literal
      Hello world
    \`;`,

    // Comments inside string literals should be ignored
    `const stringWithComment = "// This is not a real comment";`,

    // Comments inside multi-line strings should be ignored
    `const multiLineString = \`
      /* This is not a real comment */
      Some content
    \`;`,

    // Export declarations with ESLint directives should be ignored
    `/* eslint-disable */
    export const namedExport = 'value';`,

    // Default export with ESLint directive should be ignored
    `/* eslint-disable */
    export default function defaultExport() {
      return true;
    }`,

    // Namespace declarations with ESLint directives should be ignored
    `/* eslint-disable */
    namespace TestNamespace {
      export const value = 'test';
    }`,

    // Module declarations with ESLint directives should be ignored
    `/* eslint-disable */
    declare module 'some-module' {
      export const value: string;
    }`,

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

    // Regular block comment should be converted to JSDoc
    {
      code: `/* This is a regular block comment */
      function regularBlockComment() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** This is a regular block comment */
      function regularBlockComment() {
        return true;
      }`,
    },

    // Regular block comment on import should be converted to JSDoc
    {
      code: `/* Import statement comment */
      import { ComponentProps } from 'react';`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Import statement comment */
      import { ComponentProps } from 'react';`,
    },

    // Regular block comment with extra whitespace should be converted
    {
      code: `/*   This has extra whitespace   */
      function extraWhitespace() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** This has extra whitespace */
      function extraWhitespace() {
        return true;
      }`,
    },

    // Multiple regular block comments should convert the last one
    {
      code: `/* First comment */
      /* Second comment */
      function multipleComments() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/* First comment */
      /** Second comment */
      function multipleComments() {
        return true;
      }`,
    },

    // Line comment with extra whitespace should be converted
    {
      code: `//   This has extra whitespace
      function extraWhitespaceLineComment() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** This has extra whitespace */
      function extraWhitespaceLineComment() {
        return true;
      }`,
    },

    // Regular block comment on type alias
    {
      code: `/* User type definition */
      type User = {
        id: number;
        name: string;
      };`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** User type definition */
      type User = {
        id: number;
        name: string;
      };`,
    },

    // Regular block comment on interface
    {
      code: `/* User interface definition */
      interface IUser {
        id: number;
        name: string;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** User interface definition */
      interface IUser {
        id: number;
        name: string;
      }`,
    },

    // Regular block comment on class
    {
      code: `/* User class definition */
      class UserClass {
        id: number;
        name: string;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** User class definition */
      class UserClass {
        id: number;
        name: string;
      }`,
    },

    // Regular block comment on enum
    {
      code: `/* Status enumeration */
      enum Status {
        ACTIVE,
        INACTIVE
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Status enumeration */
      enum Status {
        ACTIVE,
        INACTIVE
      }`,
    },

    // Regular block comment on variable declaration
    {
      code: `/* Configuration object */
      const config = {
        apiUrl: 'https://api.example.com'
      };`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Configuration object */
      const config = {
        apiUrl: 'https://api.example.com'
      };`,
    },

    // Regular block comment on property definition
    {
      code: `class TestClass {
        /* User identifier */
        userId: number;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `class TestClass {
        /** User identifier */
        userId: number;
      }`,
    },

    // Regular block comment on method definition
    {
      code: `class TestClass {
        /* Get user method */
        getUser() {
          return this.userId;
        }
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `class TestClass {
        /** Get user method */
        getUser() {
          return this.userId;
        }
      }`,
    },

    // Regular block comment on interface property
    {
      code: `interface TestInterface {
        /* User identifier */
        userId: number;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `interface TestInterface {
        /** User identifier */
        userId: number;
      }`,
    },

    // Regular block comment on export declaration
    {
      code: `/* Named export */
      export const namedExport = 'value';`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Named export */
      export const namedExport = 'value';`,
    },

    // Regular block comment on default export
    {
      code: `/* Default export function */
      export default function defaultExport() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Default export function */
      export default function defaultExport() {
        return true;
      }`,
    },

    // Regular block comment on namespace declaration
    {
      code: `/* Test namespace */
      namespace TestNamespace {
        export const value = 'test';
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Test namespace */
      namespace TestNamespace {
        export const value = 'test';
      }`,
    },

    // Regular block comment on module declaration
    {
      code: `/* Module declaration */
      declare module 'some-module' {
        export const value: string;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Module declaration */
      declare module 'some-module' {
        export const value: string;
      }`,
    },

    // Line comment on export declaration
    {
      code: `// Named export with line comment
      export const namedExport = 'value';`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Named export with line comment */
      export const namedExport = 'value';`,
    },

    // Line comment on default export
    {
      code: `// Default export with line comment
      export default function defaultExport() {
        return true;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Default export with line comment */
      export default function defaultExport() {
        return true;
      }`,
    },

    // Line comment on namespace declaration
    {
      code: `// Test namespace with line comment
      namespace TestNamespace {
        export const value = 'test';
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Test namespace with line comment */
      namespace TestNamespace {
        export const value = 'test';
      }`,
    },

    // Line comment on module declaration
    {
      code: `// Module declaration with line comment
      declare module 'some-module' {
        export const value: string;
      }`,
      errors: [{ messageId: 'preferBlockComment' }],
      output: `/** Module declaration with line comment */
      declare module 'some-module' {
        export const value: string;
      }`,
    },
  ],
});
