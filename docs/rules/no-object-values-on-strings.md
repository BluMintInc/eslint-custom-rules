# Disallow Object.values() on strings as it treats strings as arrays of characters, which is likely unintended behavior (`@blumintinc/blumint/no-object-values-on-strings`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

`Object.values()` expects an object and returns its enumerable property values. When the argument is string-like, JavaScript treats the string as an array of characters and returns each character. That usually means the data shape is wrong—callers think they are iterating object values but instead get individual characters—so downstream logic silently processes text one character at a time.

## Rule Details

- Flags any `Object.values()` call where the argument is a string literal, string-producing expression, or parameter typed as string (including unions that contain string).
- Prevents bugs where object-specific logic runs against characters, leading to empty results, incorrect counts, or broken mappings.
- Encourages using explicit string helpers when the goal is to work with text, or passing actual objects when enumerating values.

### Examples

#### ❌ Incorrect

```js
Object.values("hello"); // → ['h', 'e', 'l', 'l', 'o']

const name = "world";
Object.values(`hello ${name}`); // returns characters, not words

const label = getLabel(); // returns a string
const values = Object.values(label); // values is a character array, not option values
```

#### ✅ Correct

```js
// Enumerating object values
const obj = { a: 1, b: 2 };
Object.values(obj);

// Converting entries to an object before enumerating
const entries = new Map([
  ['name', 'Ada'],
  ['role', 'Engineer'],
]);
Object.values(Object.fromEntries(entries));

// Working with text explicitly
const str = "hello";
const chars = Array.from(str); // clear intent to work with characters
```

## How to Fix

- Pass an object (for example, a `Record` or the result of `Object.fromEntries`) to `Object.values`.
- If you need characters, use string helpers such as `Array.from(str)`, `[...str]`, or `str.split('')`.
- Tighten types so string values are not passed where objects are expected.

## When Not To Use It

Disable this rule only when you deliberately rely on `Object.values` returning characters—prefer explicit string helpers instead so the intent is clear.

## Further Reading

- [Object.values() - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/values)
- [Spread syntax - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Array.from() - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from)
