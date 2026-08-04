# Enforce positive naming for boolean variables and avoid negations (`@blumintinc/blumint/enforce-positive-naming`)

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
- `is`/`has`-prefixed functions whose return shape is not boolean—e.g. validator predicates that return `string | true` (an error message on rejection, `true` on acceptance). The value is not a boolean and its negated name (`isNotBlank`, `isNonNegative`) is the domain-correct term, so renaming it would invert the predicate's meaning. Detected via an explicit non-boolean return-type annotation or a `return` yielding a string/number/object/array literal.
- `is`/`has`-prefixed functions whose returns yield no syntactic verdict at all, such as `const isNotBlank = (value?: string) => validate(value)`. Only a function *proven* to return a boolean—a boolean literal, a negation, a comparison, `Boolean(...)`, or a `boolean` return-type annotation—is flagged on its name. This matters because [`no-explicit-return-type`](./no-explicit-return-type.md) is recommended and fixable: it deletes the `string | true` annotation that carries the exemption above, and inferring "boolean" from the name alone would then report a rename that inverts the validator's meaning. Preferring a false negative here is deliberate.

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

// Validator predicate: returns an error message or `true`, not a boolean.
const isNotBlank = (value?: string) =>
  value?.trim() ? true : 'Must not be blank';
```

## When Not To Use It

- Codebases that intentionally encode negation in names for readability conventions.
- Transitional refactors where renaming booleans would break external contracts—disable locally while migrating.

## Further Reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
