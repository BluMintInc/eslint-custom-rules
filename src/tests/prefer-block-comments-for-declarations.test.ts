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

      // A trailing comment documents the statement it shares a line with, not
      // the declaration below it, so it is out of scope
      `const a = 1; // x
const b = 2;`,

      // The issue's shape: the note explains the value on its own line
      `export const SIDEBAR_WIDTH = 54 as const; // was 72
export const DRAWER_WIDTH = 72 as const;`,

      // A trailing comment on a line carrying only a closing brace still
      // belongs to the block it closes
      `function helper() {
  return 1;
} // end helper
export const AFTER = 1;`,

      // A trailing comment after the terminating semicolon of a type
      `type Legacy = { id: number }; // superseded by User
type User = { id: string };`,

      // Trailing comment on a class member, with a member below it
      `class Config {
  timeout = 5000; // milliseconds
  retries = 3;
}`,

      // The joined output of a multi-line run is itself valid, so the fix
      // converges in a single pass
      `/**
 * first line
 * second line
 */
export const X = 1;`,

      // The joined output of the ASCII-table run converges too
      `/**
 * ┌─────────────┬───────┐
 * │ Constant    │ Value │
 * └─────────────┴───────┘
 */
export const BORDER_RADIUS = { none: '0px' } as const;`,
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

      // Empty line comment falls back to a placeholder label
      {
        code: `//
      const EMPTY = true;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'declaration comment' },
          },
        ],
        output: `/** declaration comment */
      const EMPTY = true;`,
      },

      // Line comment containing closing token should not be auto-fixed
      {
        code: `// closes */ comment
      const value = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'closes */ comment' },
          },
        ],
        output: null,
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

// Exported declarations: the `export` keyword owns the leading comment, so the
// rule must resolve comments against the export wrapper rather than the inner
// declaration. Every shape below must match its unexported counterpart.
ruleTesterTs.run(
  'prefer-block-comments-for-declarations (exported declarations)',
  preferBlockCommentsForDeclarations,
  {
    valid: [
      // Block comment before an exported declaration stays untouched
      `/** This function fetches user data */
export function getUser() {
  return fetch('/api/user');
}`,

      // Declarations inside a function body remain out of scope
      `function process() {
  // This is an inline comment that should be ignored
  const x = 5;
  // Nested declarations are not documentation targets
  function inner() {
    return x;
  }
  return inner;
}`,

      // A comment separated from the exported declaration by a blank line is
      // not attached to it
      `// A standalone note about the module

export const BASE_URL = 'https://api.example.com';`,

      // ESLint directive before an exported declaration
      `// eslint-disable-next-line no-unused-vars
export const unused = 0;`,

      // TypeScript directive before an exported declaration
      `// @ts-expect-error legacy shape
export const legacy = globalThis.legacy;`,

      // Triple-slash directive before an exported declaration
      `/// <reference types="node" />
export type NodeEnv = typeof process.env;`,

      // Export specifier lists carry no declaration to document
      `const a = 1;
// Re-export the value
export { a };`,

      // A default-exported expression is not a declaration
      `// The answer
export default 42;`,
    ],
    invalid: [
      // export function
      {
        code: `// This function fetches user data
export function getUser() {
  return fetch('/api/user');
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'This function fetches user data' },
          },
        ],
        output: `/** This function fetches user data */
export function getUser() {
  return fetch('/api/user');
}`,
      },

      // export async function
      {
        code: `// Loads the session
export async function loadSession() {
  return null;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Loads the session' },
          },
        ],
        output: `/** Loads the session */
export async function loadSession() {
  return null;
}`,
      },

      // export const
      {
        code: `// API base URL
export const BASE_URL = 'https://api.example.com';`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'API base URL' },
          },
        ],
        output: `/** API base URL */
export const BASE_URL = 'https://api.example.com';`,
      },

      // export interface, including a nested property comment
      {
        code: `// User type
export interface User {
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
export interface User {
  id: number;
  /** Name of user */
  name: string;
}`,
      },

      // export type
      {
        code: `// User type alias
export type UserType = {
  id: number;
};`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User type alias' },
          },
        ],
        output: `/** User type alias */
export type UserType = {
  id: number;
};`,
      },

      // export class, including a class property comment
      {
        code: `// User class
export class User {
  // User ID
  id: number;
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
        ],
        output: `/** User class */
export class User {
  /** User ID */
  id: number;
}`,
      },

      // export abstract class
      {
        code: `// Base repository
export abstract class Repository {}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Base repository' },
          },
        ],
        output: `/** Base repository */
export abstract class Repository {}`,
      },

      // export enum
      {
        code: `// User roles
export enum Role {
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
export enum Role {
  ADMIN,
  USER
}`,
      },

      // export const enum
      {
        code: `// Sort direction
export const enum Direction {
  ASC,
  DESC
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Sort direction' },
          },
        ],
        output: `/** Sort direction */
export const enum Direction {
  ASC,
  DESC
}`,
      },

      // export declare const
      {
        code: `// Injected at build time
export declare const BUILD_ID: string;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Injected at build time' },
          },
        ],
        output: `/** Injected at build time */
export declare const BUILD_ID: string;`,
      },

      // export default function
      {
        code: `// Default handler
export default function handler() {
  return null;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Default handler' },
          },
        ],
        output: `/** Default handler */
export default function handler() {
  return null;
}`,
      },

      // export default anonymous function
      {
        code: `// Default anonymous handler
export default function () {
  return null;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Default anonymous handler' },
          },
        ],
        output: `/** Default anonymous handler */
export default function () {
  return null;
}`,
      },

      // export default class
      {
        code: `// Default widget
export default class Widget {}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Default widget' },
          },
        ],
        output: `/** Default widget */
export default class Widget {}`,
      },

      // Exported declaration inside a namespace
      {
        code: `namespace Api {
  // Request timeout
  export const TIMEOUT = 5000;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Request timeout' },
          },
        ],
        output: `namespace Api {
  /** Request timeout */
  export const TIMEOUT = 5000;
}`,
      },

      // A multi-line // run before an exported declaration converts as one
      // block, exactly as it does for an unexported declaration, and the
      // `export` keyword is left untouched.
      {
        code: `// Creates the rule
// with a docs url
export const createRule = ESLintUtils.RuleCreator(getUrl);`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Creates the rule' },
          },
        ],
        output: `/**
 * Creates the rule
 * with a docs url
 */
export const createRule = ESLintUtils.RuleCreator(getUrl);`,
      },

      // The same run before an unexported declaration behaves identically
      {
        code: `// Creates the rule
// with a docs url
const createRule = ESLintUtils.RuleCreator(getUrl);`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Creates the rule' },
          },
        ],
        output: `/**
 * Creates the rule
 * with a docs url
 */
const createRule = ESLintUtils.RuleCreator(getUrl);`,
      },

      // Comment containing a closing token is still reported but not fixed
      {
        code: `// closes */ comment
export const value = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'closes */ comment' },
          },
        ],
        output: null,
      },

      // The issue's module: every exported declaration reports, matching the
      // unexported form report for report
      {
        code: `// This function fetches user data
export function getUser() {
  return fetch('/api/user');
}

// API base URL
export const BASE_URL = 'https://api.example.com';

// User type
export interface User {
  id: number;
  // Name of user
  name: string;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'This function fetches user data' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'API base URL' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'User type' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Name of user' },
          },
        ],
        output: `/** This function fetches user data */
export function getUser() {
  return fetch('/api/user');
}

/** API base URL */
export const BASE_URL = 'https://api.example.com';

/** User type */
export interface User {
  id: number;
  /** Name of user */
  name: string;
}`,
      },
    ],
  },
);

// Trailing comments: a comment sharing a line with code documents THAT code.
// Line adjacency alone hands it to the declaration below, so the text ends up
// describing something it was never written about.
ruleTesterTs.run(
  'prefer-block-comments-for-declarations (trailing comments)',
  preferBlockCommentsForDeclarations,
  {
    valid: [
      // The issue's shape
      `export const SIDEBAR_WIDTH = 54 as const; // was 72
export const DRAWER_WIDTH = 72 as const;`,

      // Unexported counterpart
      `const a = 1; // x
const b = 2;`,

      // A line carrying only a closing brace still counts as code
      `function helper() {
  return 1;
} // end helper
export const AFTER = 1;`,

      // Trailing comment on an interface member, with a member below it
      `interface Config {
  timeout: number; // milliseconds
  retries: number;
}`,

      // Trailing comment on a class property, with a property below it
      `class Config {
  timeout = 5000; // milliseconds
  retries = 3;
}`,

      // Trailing comment on an enum member, with a declaration below it
      `enum Role {
  ADMIN, // full access
}
const DEFAULT_ROLE = Role.ADMIN;`,

      // A block comment sharing the line makes the following line comment a
      // trailing one too
      `/* mode */ // legacy
const value = 1;`,

      // Trailing comment on the last line of a multi-line initializer
      `const config = {
  retries: 3,
}; // tuned for flaky uploads
const other = 1;`,
    ],
    invalid: [
      // A trailing comment on the declaration's own line is untouched while its
      // leading comment converts
      {
        code: `// doc
const a = 1; // trailing`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'doc' },
          },
        ],
        output: `/** doc */
const a = 1; // trailing`,
      },

      // The run walk must stop at a trailing comment rather than swallowing it
      // into the block, which would move it off the statement it describes
      {
        code: `const a = 1; // trailing
// leading
const b = 2;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'leading' },
          },
        ],
        output: `const a = 1; // trailing
/** leading */
const b = 2;`,
      },
    ],
  },
);

// Contiguous `//` runs: consecutive line comments are separate comment nodes,
// so a rationale written as one paragraph must convert as one block. Converting
// only the adjacent node truncates the documentation to its last line.
ruleTesterTs.run(
  'prefer-block-comments-for-declarations (comment runs)',
  preferBlockCommentsForDeclarations,
  {
    valid: [
      // Converted runs are themselves valid, so the fix converges in one pass
      `/**
 * one
 * two
 * three
 */
const X = 1;`,

      `interface User {
  /**
   * the user's
   * display name
   */
  name: string;
}`,

      // A run that ends a line short of the declaration is not attached to it
      `// a standalone note
// spanning two lines

const X = 1;`,
    ],
    invalid: [
      // Two-line run
      {
        code: `// first line
// second line
export const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'first line' },
          },
        ],
        output: `/**
 * first line
 * second line
 */
export const X = 1;`,
      },

      // Three-line run
      {
        code: `// one
// two
// three
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'one' },
          },
        ],
        output: `/**
 * one
 * two
 * three
 */
const X = 1;`,
      },

      // The ASCII-table shape from src/styles/layout.ts, where converting only
      // the last line turned the table's closing row into the whole comment.
      // The ` *` marker is the same width as `//`, so every column holds.
      {
        code: `// =============================================================================
// BORDER RADIUS
// =============================================================================
// M3 Shape Scale — full 10-level shape system.
// ┌─────────────┬───────┬───────────────────────────┐
// │ Constant    │ Value │ Use Case                  │
// ├─────────────┼───────┼───────────────────────────┤
// │ none        │ 0px   │ Sharp corners             │
// └─────────────┴───────┴───────────────────────────┘
export const BORDER_RADIUS = { none: '0px' } as const;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: {
              commentText:
                '=============================================================================',
            },
          },
        ],
        output: `/**
 * =============================================================================
 * BORDER RADIUS
 * =============================================================================
 * M3 Shape Scale — full 10-level shape system.
 * ┌─────────────┬───────┬───────────────────────────┐
 * │ Constant    │ Value │ Use Case                  │
 * ├─────────────┼───────┼───────────────────────────┤
 * │ none        │ 0px   │ Sharp corners             │
 * └─────────────┴───────┴───────────────────────────┘
 */
export const BORDER_RADIUS = { none: '0px' } as const;`,
      },

      // A bare `//` line inside a run is a paragraph break: it stays as an
      // empty line rather than being dropped or labelled
      {
        code: `// one
//
// three
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'one' },
          },
        ],
        output: `/**
 * one
 *
 * three
 */
const X = 1;`,
      },

      // A run that opens with a bare `//` takes its label from the first line
      // carrying text
      {
        code: `//
// actual text
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'actual text' },
          },
        ],
        output: `/**
 *
 * actual text
 */
const X = 1;`,
      },

      // A blank line separates two blocks, so only the attached one converts
      {
        code: `// standalone note

// attached doc
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'attached doc' },
          },
        ],
        output: `// standalone note

/** attached doc */
const X = 1;`,
      },

      // A directive's `//` form is load-bearing, so the walk stops there
      {
        code: `// eslint-disable-next-line no-unused-vars
// attached doc
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'attached doc' },
          },
        ],
        output: `// eslint-disable-next-line no-unused-vars
/** attached doc */
const X = 1;`,
      },

      // A block comment above the run is already a block: it is not re-wrapped
      {
        code: `/* a block */
// attached doc
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'attached doc' },
          },
        ],
        output: `/* a block */
/** attached doc */
const X = 1;`,
      },

      // Differently-indented comments are not one visual block, and joining
      // them would re-indent text this rule does not own
      {
        code: `  // indented
// flush
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'flush' },
          },
        ],
        output: `  // indented
/** flush */
const X = 1;`,
      },

      // An indented run inside an interface keeps its indentation
      {
        code: `interface User {
  // the user's
  // display name
  name: string;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: "the user's" },
          },
        ],
        output: `interface User {
  /**
   * the user's
   * display name
   */
  name: string;
}`,
      },

      // Tab indentation survives, because the indent is taken from the source
      // rather than rebuilt from the column
      {
        code: `class C {
\t// one
\t// two
\tvalue = 1;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'one' },
          },
        ],
        output: `class C {
\t/**
\t * one
\t * two
\t */
\tvalue = 1;
}`,
      },

      // Interior indentation is content, so it is preserved verbatim
      {
        code: `// Options:
//   - alpha
//   - beta
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Options:' },
          },
        ],
        output: `/**
 * Options:
 *   - alpha
 *   - beta
 */
const X = 1;`,
      },

      // A run carrying the block terminator anywhere is reported but not fixed
      {
        code: `// closes */ here
// second line
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'closes */ here' },
          },
        ],
        output: null,
      },

      // A run line whose text starts with `/` would form the terminator against
      // the ` *` marker, so the fix is withheld rather than the text respaced
      {
        code: `// doc
/// not a directive
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'doc' },
          },
        ],
        output: null,
      },

      // A `/` after the marker's space is safe
      {
        code: `// doc
// /usr/local/bin
const X = 1;`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'doc' },
          },
        ],
        output: `/**
 * doc
 * /usr/local/bin
 */
const X = 1;`,
      },

      // Independent runs in one file convert independently
      {
        code: `// first declaration
// second line
const A = 1;

// third declaration
// fourth line
function b() {}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'first declaration' },
          },
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'third declaration' },
          },
        ],
        output: `/**
 * first declaration
 * second line
 */
const A = 1;

/**
 * third declaration
 * fourth line
 */
function b() {}`,
      },

      // A run before an exported declaration inside a namespace
      {
        code: `namespace Api {
  // Request timeout
  // in milliseconds
  export const TIMEOUT = 5000;
}`,
        errors: [
          {
            messageId: 'preferBlockComment',
            data: { commentText: 'Request timeout' },
          },
        ],
        output: `namespace Api {
  /**
   * Request timeout
   * in milliseconds
   */
  export const TIMEOUT = 5000;
}`,
      },
    ],
  },
);
