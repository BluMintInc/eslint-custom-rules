# Disallow Hungarian notation in locally declared variables, types, and classes (`@blumintinc/blumint/no-hungarian`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows embedding type information in identifier names (Hungarian notation) for locally declared variables, parameters, functions, classes, interfaces, and type aliases. Type prefixes and suffixes such as `str`, `num`, `bool`, `String`, or `Number` are flagged because they duplicate what the type system already communicates.

## Rule Details

### Why this matters

- Type-coded names drift as soon as the underlying type changes, leaving misleading hints that cause misuse and slow reviews.
- Prefixes and suffixes push the domain concept out of the name, making it harder to see what the value represents at a glance.
- Type information already lives in TypeScript annotations and runtime validation; duplicating it in names increases maintenance overhead without adding safety.

### What gets checked

- Locally declared identifiers that start or end with common type markers (camelCase, PascalCase, or SCREAMING_SNAKE_CASE).
- Class members and parameters that reuse the same markers.
- The rule allows common compound nouns (for example, `PhoneNumber`, `EmailAddress`) and descriptive suffixes like `Formatted`, `Parsed`, or `Converted`.
- Built-in methods and imported identifiers are ignored to avoid false positives for code you do not control.

### How to fix

Rename the identifier to a domain-focused term and keep the type information in the type annotation or inference. For example, use `email` or `customerEmail` instead of `emailString`, and `results` instead of `resultsArray`.

### Examples of **incorrect** code for this rule:

```js
const nameString = "John";
const ageNumber = 30;
const isActiveBoolean = true;
const userDataObject = { name: "John", age: 30 };
const itemsArray = ["apple", "banana"];

const USER_ROLES_ARRAY = ["admin", "user"];

function getUserObjectData() {
  const paramString = "value";
  return paramString;
}

class UserObjData {}
```

### Examples of **correct** code for this rule:

```js
const name = "John";
const age = 30;
const isActive = true;
const userData = { name: "John", age: 30 };
const items = ["apple", "banana"];

const userRoles = ["admin", "user"];

function getUserData() {
  const name = "John";
  const age = 30;
  const isActive = true;
  return { name, age, isActive };
}

// Built-in methods are ignored
function checkPath(pathname) {
  return pathname.startsWith('/sitemap');
}

// Imported identifiers are ignored
import { userDataString } from './module';
```

## When Not To Use It

If your team intentionally encodes types in identifiers, disable this rule. Modern TypeScript and linting make type prefixes unnecessary and often misleading during refactors.

## Further Reading

- [Hungarian Notation](https://en.wikipedia.org/wiki/Hungarian_notation)
- [Why Hungarian Notation Is Bad](https://www.joelonsoftware.com/2005/05/11/making-wrong-code-look-wrong/)
