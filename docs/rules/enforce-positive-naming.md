# Suggest positive naming for boolean variables and avoid negations (`@blumintinc/blumint/enforce-positive-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Negative boolean names can force readers to mentally invert conditions (`if (!isNotReady)`) and often hide intent. This rule suggests positive, self-describing names for boolean variables, functions, parameters, properties, and class members.

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

Example message:

```text
Variable "isNotReady" uses negative naming, which can make logic harder to follow (e.g., "if (!isNotReady)"). This rule is a suggestion; some concepts are naturally negative (like "isUnauthorized"). If this name is the clearest choice, please use an // eslint-disable-next-line @blumintinc/blumint/enforce-positive-naming comment. Otherwise, consider a positive alternative like isReady.
```

### Examples of **correct** code for this rule:

```ts
const isReady = true;
let hasAccess: boolean;
function shouldContinue(): boolean { return errorCount === 0; }
type State = { isReachable: boolean; doesExist: boolean };
class Session { get isAllowed() { return this.isEnabled; } }
```

### ✅ Correct (With disable comment if negative naming is clearest)

```ts
// eslint-disable-next-line @blumintinc/blumint/enforce-positive-naming
const isUnauthorized = true;
```

## When Not To Use It

- Codebases that intentionally encode negation in names for readability conventions.
- If a concept is inherently negative and a positive name would be more confusing.
- Transitional refactors where renaming booleans would break external contracts—disable locally while migrating with an `// eslint-disable-next-line @blumintinc/blumint/enforce-positive-naming` comment.

## Further Reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
