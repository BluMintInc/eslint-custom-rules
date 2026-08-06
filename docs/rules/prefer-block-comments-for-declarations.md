# Enforce the use of block comments for declarations (`@blumintinc/blumint/prefer-block-comments-for-declarations`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Enforces the use of block comments (`/** */`) instead of single-line comments (`//`) for all declarations, including type declarations, variable declarations, and function declarations.

## Rule Details

Line comments placed directly above a declaration look like documentation but TypeScript and IDEs ignore them for hovers, signature help, and generated docs. Converting them to block comments keeps the text attached to the declaration so refactors and API exploration still show the intent.

- Reports line comments immediately before declarations (functions, variables, types, interfaces, classes, properties, enums) except inside function bodies.
- Covers exported declarations. A leading comment sits before the `export` keyword, so the comment is resolved against the `export` wrapper (`export`, `export default`) and an exported declaration is treated exactly like its unexported form. Exported declarations are the public API the rule exists to document, so an `export` must not hide the comment.
- Requires the comment to start its own line. A trailing comment (`const SIDEBAR_WIDTH = 54; // was 72`) documents the statement it shares a line with, not the declaration underneath it, so it is out of scope — reporting it would move the text onto code it was never written about.
- Treats a contiguous run of `//` lines as one comment. Consecutive line comments are separate AST nodes, so a rationale written as one paragraph — prose, a bullet list, an ASCII table — arrives as a run; converting only the line nearest the declaration would truncate the documentation and leave a mixed `//` + block header. The run ends at a blank line, a block comment, a directive, a change of indentation, or a trailing comment.
- Leaves existing block comments untouched, including block ESLint directives.
- Ignores ESLint directive comments so configuration comments remain untouched.
- Auto-fix rewrites `//` comments into `/** ... */` while preserving the text; whitespace-only comments become `/** declaration comment */` as a generic label so the declaration still has a visible doc stub.
- Auto-fix of a run swaps each `//` marker for ` *`, which is the same width, so indentation and column-aligned content such as a table survive verbatim. The fix is withheld — the report stands on its own — when the resulting block would contain the terminator `*/`, since escaping it would mean rewriting prose the rule does not own.

### ❌ Incorrect

```ts
// This function fetches user data
function getUser() {
  return fetch('/api/user');
}

// API base URL
const BASE_URL = 'https://api.example.com';

// User type
interface User {
  id: number;
  // Name of user
  name: string;
}

// Default handler
export default function handler() {
  return null;
}

// Sort direction
export enum Direction {
  ASC,
  DESC,
}

// Spacing scale
// ┌────────┬───────┐
// │ Token  │ Value │
// ├────────┼───────┤
// │ tight  │ 4px   │
// └────────┴───────┘
export const SPACING = { tight: '4px' } as const;
```

### Exceptions

ESLint directive comments are ignored by this rule so configuration stays intact.

```ts
// eslint-disable-next-line no-unused-vars
const ignored = true;
```

### ✅ Correct

```ts
/** This function fetches user data */
function getUser() {
  return fetch('/api/user');
}

/** API base URL */
const BASE_URL = 'https://api.example.com';

/** User type */
interface User {
  id: number;
  /** Name of user */
  name: string;
}

/** Default handler */
export default function handler() {
  return null;
}

/** Sort direction */
export enum Direction {
  ASC,
  DESC,
}

/**
 * Spacing scale
 * ┌────────┬───────┐
 * │ Token  │ Value │
 * ├────────┼───────┤
 * │ tight  │ 4px   │
 * └────────┴───────┘
 */
export const SPACING = { tight: '4px' } as const;

/** A trailing comment documents the statement it shares a line with */
export const SIDEBAR_WIDTH = 54 as const; // was 72
export const DRAWER_WIDTH = 72 as const;

/* Block comments of any kind are not checked by this rule */
/* eslint-disable no-console */
function log() {
  console.log('safe');
}
```

## When Not To Use It

You might consider disabling this rule if:

1. Your team has a different commenting convention that doesn't rely on JSDoc-style block comments.
1. Your development environment does not provide IDE tooltips or autocomplete features.
1. You're working on a project where documentation is primarily maintained outside the code.

## Further Reading

- [JSDoc Documentation](https://jsdoc.app/)
- [TypeScript Documentation Comments](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
