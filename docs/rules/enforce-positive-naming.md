# Enforce positive naming for boolean variables and avoid negations (`@blumintinc/blumint/enforce-positive-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Negative boolean names force readers to mentally invert conditions (`if (!isNotReady)`) and often hide intent. This rule enforces positive, self-describing names for boolean variables, functions, parameters, properties, and class members.

## Rule Details

This rule reports when a boolean-like identifier starts with a negative prefix such as `not`, `no`, `non`, `un`, `in`, or `dis` (e.g., `isNotReady`, `hasNoAccess`, `shouldNotProceed`). It detects booleans by:

- Explicit `boolean` type annotations or boolean literal initializers.
- Common boolean prefixes (`is`, `has`, `can`, `should`, `will`, `does`) on identifiers, methods, properties, or parameters.

A class member is judged in every spelling it has: a method, a getter or setter, a **class field** — both the property-arrow form (`isNotAdmin = (user) => !user.admin`) and the plain data form (`isNotReady = false`, `shouldNotRetry!: boolean`) — and the `abstract` declaration of either. Writing `=` in front of a member changes nothing a reader has to mentally invert, so it does not change the answer.

The rule ignores:

- Non-TypeScript files, dotfiles, and config/rc files.
- Computed member keys (`[NAME] = false`), whose identifier is declared elsewhere and is judged at that declaration instead.
- `declare` class fields, which restate the type of a member owned by a base class or an ambient declaration, so the name is not the class's to choose.
- Words that incidentally contain these prefixes but are not negations (e.g., `index`, `display`, `input`), using curated exception lists to avoid false positives.
- `is`/`has`-prefixed functions whose return shape is not boolean—e.g. validator predicates that return `string | true` (an error message on rejection, `true` on acceptance). The value is not a boolean and its negated name (`isNotBlank`, `isNonNegative`) is the domain-correct term, so renaming it would invert the predicate's meaning. Detected via an explicit non-boolean return-type annotation or a `return` yielding a string/number/object/array literal. The return shape is read wherever the declaration puts it: on the function itself, or—for a declaration-only member with no value—on its inline function type, whether that member is a class field (`isNotBlank!: (value?: string) => string | true`) or an interface/type-literal property signature. A type-only wrapper around the value (`fn as T`, `fn satisfies T`, `fn!`, `<T>fn`) is looked through, since none of them changes what the function returns.
- `is`/`has`-prefixed functions whose returns yield no syntactic verdict at all, such as `const isNotBlank = (value?: string) => validate(value)`. Only a function *proven* to return a boolean—a boolean literal, a negation, a comparison, `Boolean(...)`, or a `boolean` return-type annotation—is flagged on its name. This matters because [`no-explicit-return-type`](./no-explicit-return-type.md) is recommended and fixable: it deletes the `string | true` annotation that carries the exemption above, and inferring "boolean" from the name alone would then report a rename that inverts the validator's meaning. Preferring a false negative here is deliberate.

### Examples of **incorrect** code for this rule:

```ts
const isNotReady = false;
let hasNoAccess: boolean;
function shouldNotContinue(): boolean { return errorCount > 0; }
type State = { isUnreachable: boolean; doesNotExist: boolean };
class Session { get isDisallowed() { return !this.isEnabled; } }
class Flags { isNotReady = false; isNotAdmin = (user: User) => !user.admin; }
abstract class Job { abstract shouldNotRetry: boolean; }
```

### Examples of **correct** code for this rule:

```ts
const isReady = true;
let hasAccess: boolean;
function shouldContinue(): boolean { return errorCount === 0; }
type State = { isReachable: boolean; doesExist: boolean };
class Session { get isAllowed() { return this.isEnabled; } }
class Flags { isReady = false; isAdmin = (user: User) => user.admin; }
abstract class Job { abstract shouldRetry: boolean; }

// Validator predicate: returns an error message or `true`, not a boolean.
const isNotBlank = (value?: string) =>
  value?.trim() ? true : 'Must not be blank';

// The same carve-out in class-member position, including the declaration-only
// spelling whose return shape lives solely in its annotation.
class Form {
  isNotBlank = (value?: string) => validate(value);
  isNotEmpty!: (value?: string) => string | true;
}

// A property signature is the same declaration-only spelling, so it reads the
// same annotation.
type FormValidators = {
  isNotBlank: (value?: string) => string | true;
};

// A type-only wrapper does not change what the function returns.
type Validator = (value?: string) => string | true;
const isNotEmpty = ((value?: string) => validate(value)) as Validator;
```

## When Not To Use It

- Codebases that intentionally encode negation in names for readability conventions.
- Transitional refactors where renaming booleans would break external contracts—disable locally while migrating.

## Further Reading

- [Clean Code: Meaningful Names](https://learning.oreilly.com/library/view/clean-code/9780136083238/chapter02.html)
