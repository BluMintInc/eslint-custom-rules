# Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion (`@blumintinc/blumint/enforce-assert-safe-object-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of `assertSafe(id)` when accessing object properties with computed keys that involve string interpolation or explicit string conversion.

## Rule Details

Dynamic keys that come from variables, string conversions, or template literals can point to unintended properties (including `__proto__` and other prototype fields) and make lookups brittle or unsafe. `assertSafe()` validates the key before it is used so property access stays within the allowed surface area.

Use `assertSafe()` whenever you index objects with a non-literal key. The rule auto-fixes by wrapping the key and inserting the import if needed.

### Examples

#### ❌ Incorrect

```js
const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

console.log(obj[String(id)]);
console.log(obj[`${id}`]);
console.log(obj[id]);
```

#### ✅ Correct

```js
import { assertSafe } from 'functions/src/util/assertSafe';

const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

console.log(obj[assertSafe(id)]);
console.log(obj[assertSafe(`${id}_suffix`)]);
const hasKey = assertSafe(id) in obj;
```

## When Not To Use It

You might consider disabling this rule if:

1. You have a different validation mechanism for object keys
2. You're working in a context where all object keys are guaranteed to be safe
3. You have explicitly known safe identifiers that don't require validation

## Further Reading

- [Object Property Access Security](https://owasp.org/www-project-top-ten/2017/A1_2017-Injection)
- [JavaScript Property Access](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_Accessors)
