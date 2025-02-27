# Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion (`@blumintinc/blumint/enforce-assertSafe-object-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of `assertSafe(id)` when accessing object properties with computed keys that involve string interpolation or explicit string conversion.

## Rule Details

This rule aims to prevent potential security risks or unintended behavior caused by unvalidated dynamic keys when accessing object properties. It ensures consistency and readability in object key access and encourages developers to validate inputs before using them as object keys.

### Examples

#### ❌ Incorrect

```js
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

// Using String() for conversion
console.log(obj[String(id)]);

// Using template literals
console.log(obj[`${id}`]);
```

#### ✅ Correct

```js
import { assertSafe } from 'utils/assertions';

const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

// Using assertSafe for validation
console.log(obj[assertSafe(id)]);
```

## When Not To Use It

You might consider disabling this rule if:

1. You have a different validation mechanism for object keys
2. You're working in a context where all object keys are guaranteed to be safe
3. You have explicitly known safe identifiers that don't require validation

## Further Reading

- [Object Property Access Security](https://owasp.org/www-project-top-ten/2017/A1_2017-Injection)
- [JavaScript Property Access](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_Accessors)
