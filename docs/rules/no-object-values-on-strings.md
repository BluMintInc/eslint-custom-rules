# no-object-values-on-strings

Disallows using `Object.values()` on strings to prevent unintended behavior.

## Rule Details

This rule aims to prevent the unintended use of `Object.values()` on string values. When `Object.values()` is called on a string, JavaScript treats the string as an array of characters, which is likely not the intended behavior and can lead to subtle bugs.

### Examples

#### ❌ Incorrect

```js
// Using Object.values() on a string literal
Object.values("hello");
// Returns ['h', 'e', 'l', 'l', 'o']

// Using Object.values() on a template literal
Object.values(`template literal`);
// Returns ['t', 'e', 'm', 'p', 'l', 'a', 't', 'e', ' ', 'l', 'i', 't', 'e', 'r', 'a', 'l']
```

#### ✅ Correct

```js
// Using Object.values() on objects
const obj = { a: 1, b: 2 };
Object.values(obj);
// Returns [1, 2]

// Using Object.values() on arrays
const arr = [1, 2, 3];
Object.values(arr);
// Returns [1, 2, 3]

// Using Object.values() on Map entries
const map = new Map();
map.set('a', 1);
map.set('b', 2);
Object.values(Object.fromEntries(map));
// Returns [1, 2]
```

## When Not To Use It

If you intentionally want to convert a string to an array of characters, you should use the spread operator or `Array.from()` instead:

```js
// Better alternatives for converting a string to an array of characters
const str = "hello";
const chars1 = [...str]; // ['h', 'e', 'l', 'l', 'o']
const chars2 = Array.from(str); // ['h', 'e', 'l', 'l', 'o']
```

## Further Reading

- [Object.values() - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/values)
- [Spread syntax - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax)
- [Array.from() - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from)
