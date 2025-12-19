# Enforce positive naming for boolean variables and avoid negations (`@blumintinc/blumint/enforce-positive-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Negative boolean names force readers to mentally invert conditions (`if (!isNotReady)`) and often hide intent. This rule enforces positive, self-describing names for boolean variables, functions, parameters, properties, and class members.

## Rule Details

This rule reports when a boolean-like identifier starts with a negative prefix such as `not`, `no`, `non`, `un`, `in`, or `dis` (e.g., `isNotReady`, `hasNoAccess`, `shouldNotProceed`). It detects booleans by:

- Explicit `boolean` type annotations or boolean literal initializers.
- Common boolean prefixes (`is`, `has`, `can`, `should`, `will`, `does`) on identifiers, methods, properties, or parameters.

The rule ignores:

- Non-TypeScript files, dotfiles, and config/rc files.
- Words that incidentally contain these prefixes but are not negations (e.g., `index`, `display`, `input`), using curated exception lists to avoid false positives.

### Examples of **incorrect** code for this rule:

```ts
const isNotReady = false;
let hasNoAccess: boolean;
function shouldNotContinue(): boolean { return errorCount > 0; }
type State = { isUnreachable: boolean; doesNotExist: boolean };
class Session { get isDisallowed() { return !this.isEnabled; } }
```

### Examples of **correct** code for this rule:

```ts
const isReady = true;
let hasAccess: boolean;
function shouldContinue(): boolean { return errorCount === 0; }
type State = { isReachable: boolean; doesExist: boolean };
class Session { get isAllowed() { return this.isEnabled; } }
```

## Options

This rule does not have any options.

## When Not To Use It

- Codebases that intentionally encode negation in names for readability conventions.
- Transitional refactors where renaming booleans would break external contracts—disable locally while migrating.

## Further Reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
