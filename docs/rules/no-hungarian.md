# Disallow Hungarian notation in locally declared variables, types, and classes (`@blumintinc/blumint/no-hungarian`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule disallows the use of Hungarian notation in variable names, which is the practice of adding a prefix or suffix that indicates the type of the variable.

## Rule Details

This rule aims to prevent the use of Hungarian notation, which is considered an outdated practice in modern TypeScript and JavaScript development. With type annotations and modern tooling, Hungarian notation adds unnecessary verbosity to code.

The rule detects both common prefixes (like `str`, `num`, `bool`) and suffixes (like `String`, `Number`, `Boolean`) that indicate variable types.

### Important Note

The rule will **ignore**:
1. Built-in JavaScript methods (like `String.prototype.startsWith`, `Array.prototype.map`, etc.)
2. Identifiers imported from external modules
3. Object properties (only variables, parameters, and declarations are checked)

This ensures that we don't get false positives for code we don't control.

### Examples of **incorrect** code for this rule:

```js
const nameString = "John";
const ageNumber = 30;
const isActiveBoolean = true;
const userDataObject = { name: "John", age: 30 };
const itemsArray = ["apple", "banana"];

function getUserDataObject() {
  const strName = "John";
  const intAge = 30;
  const boolIsActive = true;
  return { strName, intAge, boolIsActive };
}

class UserClass {}
```

### Examples of **correct** code for this rule:

```js
const name = "John";
const age = 30;
const isActive = true;
const userData = { name: "John", age: 30 };
const items = ["apple", "banana"];

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

If your team has an established convention that uses Hungarian notation, you might want to disable this rule. However, we strongly recommend moving away from Hungarian notation, especially in TypeScript projects.

## Further Reading

- [Hungarian Notation](https://en.wikipedia.org/wiki/Hungarian_notation)
- [Why Hungarian Notation Is Bad](https://www.joelonsoftware.com/2005/05/11/making-wrong-code-look-wrong/)
