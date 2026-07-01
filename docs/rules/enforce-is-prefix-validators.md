# Enforce the `is` (or other allowed predicate) prefix for exported validators in **/validators/**/*.ts files (`@blumintinc/blumint/enforce-is-prefix-validators`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

BluMint's validation system is built on composable validators that return `true | string`. By convention every exported validator uses a predicate prefix (`is`, `not`, or `are`) that communicates the function answers a yes-or-no question about its input. The `validate`, `check`, `verify`, and `ensure` prefixes are explicitly prohibited because they imply a procedural action, not a predicate.

## Rule Details

This rule only applies inside files whose path matches the `targetPaths` glob (default `**/validators/**/*.ts`) and whose name is **not** matched by `excludePatterns` (defaults exclude test files). It examines exported `const` and `function` declarations and flags those whose names start with a disallowed prefix or lack any allowed predicate prefix.

### What the rule flags

- `export const validateDecreaseOnly = ...` — disallowed `validate` prefix
- `export const checkTokenCount = ...` — disallowed `check` prefix
- `export function verifyEmail(...)` — disallowed `verify` prefix
- `export const ensureNonEmpty = ...` — disallowed `ensure` prefix
- `export const emailValidator = ...` — no recognized predicate prefix and a callable initializer

### What the rule allows

- `export const isEmail = ...`, `export function isPositive(...)` — compliant `is` prefix
- `export const notContainsUrl = ...` — allowed `not` predicate prefix (negative form)
- `export const areBothPositiveIntegers = ...` — allowed `are` predicate prefix (plural form)
- `export const EMAIL_REGEX = /…/` and other non-function constants — exempt (primitive, regex, array, or object literals)
- `export type Validate<T> = ...`, `export interface ValidatorOptions { ... }`, `export class ValidatorPipeline` — type/interface/class exports are never flagged
- Non-exported helpers (`const parseAmount = ...`, `const cleanEmail = ...`) — rule only checks exported bindings
- Any export in a file outside `**/validators/**/*.ts` — rule does not apply
- Test files (`*.test.ts`, `*.spec.ts`) — excluded by default
- `export { x } from '...'` — re-exports from external modules are always exempt

## Examples

### Incorrect

```typescript
// functions/src/util/edit/validators/token-selection/validateDecreaseOnly.ts

// BAD: uses 'validate' prefix instead of 'is'
export const validateDecreaseOnly = (before = {}) => {
  return (after = {}) => {
    return true;
  };
};

// BAD: uses 'check' prefix
export const checkTokenCount = (selection: unknown) => {
  return true;
};

// BAD: uses 'verify' prefix
export function verifyEmail(value: string) {
  return true;
}
```

### Correct

```typescript
// functions/src/util/edit/validators/token-selection/isDecreaseOnly.ts

// GOOD: uses 'is' prefix
export const isDecreaseOnly = (before = {}) => {
  return (after = {}) => {
    return true;
  };
};

// GOOD: uses 'is' prefix
export const isValidTokenCount = (selection: unknown) => {
  return true;
};

// GOOD: non-function constant — exempt
export const EMAIL_REGEX = /^[\w%+.-]+@[\d.A-Za-z-]+\.[A-Za-z]{2,}$/;

// GOOD: 'not' predicate prefix — negative form
export const notContainsUrl = (value: string) => {
  return true;
};

// GOOD: 'are' predicate prefix — plural form
export const areBothPositiveIntegers = (value: { min: number; max: number }) => {
  return true;
};

// GOOD: private helper — not exported, exempt from rule
const parseAmount = (raw: string) => parseFloat(raw);
```

## Options

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/enforce-is-prefix-validators': [
    'error',
    {
      // Glob patterns for files where the rule applies (default shown)
      targetPaths: ['**/validators/**/*.ts'],
      // The required/recommended predicate prefix
      requiredPrefix: 'is',
      // All allowed predicate prefixes (disallowed check runs first)
      allowedPrefixes: ['is', 'not', 'are'],
      // Prefixes that produce a targeted error with a rename suggestion
      disallowedPrefixes: ['validate', 'check', 'verify', 'ensure'],
      // Named exports to exclude from the rule
      excludeNames: [
        'ValidatorPipeline',
        'ValidatorFactory',
        'ValidatorFactorySync',
        'Validate',
        'ValidateSync',
      ],
      // File glob patterns to exclude (e.g. test files)
      excludePatterns: ['**/*.test.ts', '**/*.spec.ts'],
    }
  ]
}
```

### `targetPaths`

Type: `string[]` | Default: `['**/validators/**/*.ts']`

Glob patterns (matched with minimatch) for files where the rule applies. The rule is a no-op for all other files.

### `requiredPrefix`

Type: `string` | Default: `'is'`

The canonical predicate prefix used in rename suggestions and error messages.

### `allowedPrefixes`

Type: `string[]` | Default: `['is', 'not', 'are']`

All predicate prefixes that satisfy the rule. Names starting with any of these at a proper camelCase boundary are allowed. The `not` and `are` prefixes accommodate the established `notContains*` and `areBoth*` patterns in the codebase.

### `disallowedPrefixes`

Type: `string[]` | Default: `['validate', 'check', 'verify', 'ensure']`

Prefixes that are explicitly prohibited. When a name matches one of these, the rule emits the `disallowedPrefix` message with a targeted rename suggestion. This check runs before the `allowedPrefixes` check.

### `excludeNames`

Type: `string[]` | Default: `['ValidatorPipeline', 'ValidatorFactory', 'ValidatorFactorySync', 'Validate', 'ValidateSync']`

Exact export names that are excluded from the rule. Use this for infrastructure utilities that live in `validators/` directories but are not validators themselves.

### `excludePatterns`

Type: `string[]` | Default: `['**/*.test.ts', '**/*.spec.ts']`

File glob patterns to exclude from the rule entirely. Test files are excluded by default.

## When to disable this rule

You should rarely need to disable this rule. If you have an exported function in a `validators/` directory that is not a validator (e.g. a utility helper like `catchBigInt`), add its name to the `excludeNames` option rather than disabling the rule.

```javascript
// .eslintrc.js
{
  '@blumintinc/blumint/enforce-is-prefix-validators': [
    'error',
    {
      excludeNames: [
        'ValidatorPipeline',
        'ValidatorFactory',
        'ValidatorFactorySync',
        'Validate',
        'ValidateSync',
        'catchBigInt', // utility helper, not a validator
      ],
    }
  ]
}
```
