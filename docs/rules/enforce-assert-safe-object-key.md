# Enforce the use of assertSafe(id) when accessing object properties with computed keys that involve string interpolation or explicit string conversion (`@blumintinc/blumint/enforce-assert-safe-object-key`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces the use of `assertSafe(id)` when accessing object properties with computed keys that involve string interpolation or explicit string conversion.

## Rule Details

Dynamic keys that come from variables, string conversions, or template literals can point to unintended properties (including `__proto__` and other prototype fields) and make lookups brittle or unsafe. `assertSafe()` validates the key before it is used so property access stays within the allowed surface area.

Use `assertSafe()` whenever you index objects with a non-literal key. The rule auto-fixes by wrapping the key and inserting the import if needed. The inserted import specifier is computed relative to the file being fixed (for example `../util/assertSafe`), so it resolves regardless of how deeply the file is nested — a bare specifier such as `functions/src/util/assertSafe` would not resolve inside a project whose `baseUrl` is `functions/`.

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
import { assertSafe } from '../util/assertSafe';

const obj = { key1: 'value1', key2: 'value2' };
const id = 'key1';

console.log(obj[assertSafe(id)]);
console.log(obj[assertSafe(`${id}_suffix`)]);
const hasKey = assertSafe(id) in obj;
```

Caching the validated value in a variable is also accepted — the rule recognises
identifiers that are initialised directly from `assertSafe(...)` and does not
require a second wrapping:

```js
import { assertSafe } from '../util/assertSafe';

// safeKey holds an already-validated key; obj[safeKey] is fine.
const safeKey = assertSafe(rawKey);
const a = objA[safeKey];
const b = objB[safeKey];
const c = objC[safeKey];
```

## Options

- `assertSafeImportPath` (string, default: `functions/src/util/assertSafe`): the location of the `assertSafe` helper, given as a path anchored at the repo root (relative to the working directory eslint runs from). The fixer derives a specifier relative to the file being fixed from this value rather than emitting it verbatim, so the inserted import resolves from any nesting depth. Set this to your helper's repo-root-relative path when consuming the plugin outside BluMint.

## When Not To Use It

You might consider disabling this rule if:

1. You have a different validation mechanism for object keys
1. You're working in a context where all object keys are guaranteed to be safe
1. You have explicitly known safe identifiers that don't require validation

## Further Reading

- [Object Property Access Security](https://owasp.org/www-project-top-ten/2017/A1_2017-Injection)
- [JavaScript Property Access](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Property_Accessors)
