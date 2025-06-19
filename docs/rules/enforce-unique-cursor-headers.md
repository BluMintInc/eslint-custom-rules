# Enforce unique cursor headers and prevent duplicates in files (`@blumintinc/blumint/enforce-unique-cursor-headers`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule enforces proper cursor header management in TypeScript/JavaScript files. It detects and flags when cursor headers (file-level comment blocks that typically contain metadata, descriptions, or standardized information) are either duplicated within a file or completely missing when required.

Cursor headers are important for BluMint's codebase because they provide consistent file documentation, metadata tracking, and help maintain code organization standards across the large monorepo. Duplicate headers create confusion and maintenance overhead, while missing headers reduce code discoverability and documentation quality.

## Examples

### ❌ Incorrect

```typescript
/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

export const validateUser = (userId: string) => {
  // implementation
};
```

```typescript
// No header comment block at all
import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};
```

### ✅ Correct

```typescript
/**
 * @fileoverview User authentication utilities
 * @author BluMint Team
 */

import { HttpsError } from '../errors/HttpsError';

export const validateUser = (userId: string) => {
  // implementation
};
```

## Options

This rule accepts an options object with the following properties:

### `requireHeader` (default: `true`)

When `true`, the rule will require files to have a cursor header. When `false`, the rule will only check for duplicates.

### `filePatterns` (default: `["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]`)

An array of glob patterns that specify which files should be checked by this rule.

### `requiredFields` (default: `["@fileoverview"]`)

An array of required fields that must be present in cursor headers. Common fields include:
- `@fileoverview` - Description of the file's purpose
- `@author` - Author information
- `@since` - Version or date when the file was created
- `@version` - Current version of the file

### `allowMultipleBlocks` (default: `false`)

When `false`, the rule will flag multiple cursor header blocks as duplicates. When `true`, multiple non-duplicate header blocks are allowed.

### `excludePatterns` (default: `["**/node_modules/**", "**/*.d.ts", "**/*.generated.*", "**/*.min.*"]`)

An array of patterns for files that should be excluded from this rule.

## Configuration Examples

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-unique-cursor-headers": "error"
  }
}
```

```json
{
  "rules": {
    "@blumintinc/blumint/enforce-unique-cursor-headers": [
      "error",
      {
        "requireHeader": true,
        "requiredFields": ["@fileoverview", "@author"],
        "allowMultipleBlocks": false,
        "filePatterns": ["src/**/*.ts", "src/**/*.tsx"],
        "excludePatterns": ["**/*.test.ts", "**/*.spec.ts"]
      }
    ]
  }
}
```

## When Not To Use It

You might want to disable this rule if:

- Your project doesn't use standardized file headers
- You prefer a different documentation approach
- You're working with a legacy codebase where adding headers would be disruptive
