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

### Interaction with inline disable comments

The `import { assertSafe } from '...';` statement is added once per file,
attached to the fix of the first violation that is **not** suppressed by an
inline `eslint-disable` directive. Suppressing an individual key access
therefore never strands the remaining `assertSafe(...)` calls without their
import:

```js
const obj = { alpha: 1, beta: 2 };

// eslint-disable-next-line @blumintinc/blumint/enforce-assert-safe-object-key
const first = obj[id]; // left alone

const second = obj[id]; // fixed, and carries the import
```

### When the fix is withheld

The fix wraps the key in a bare `assertSafe(...)` call and inserts
`import { assertSafe } from '...';`. Both halves break when the name
`assertSafe` already resolves to something else at the key access:

- A module-scope `const`/`function`/`class` named `assertSafe`, or an import of
  that name from another module, collides with the inserted import
  (TS2440 / TS2300).
- A shadowing parameter or block-scoped binding captures the emitted call with
  **no** compile error at all, so the key is validated by the shadow rather
  than by the helper.

The rule resolves `assertSafe` through the scope chain at the key access and
withholds the fix whenever the visible binding is anything other than a named
`assertSafe` specifier imported from the configured helper module (a namespace
or default import is a different value, so it counts as a collision too). The
`useAssertSafe` report still fires; only the automated edit is skipped, leaving
the clash for the author to resolve:

```js
const assertSafe = (key) => key; // a local of the same name

const obj = { alpha: 1, beta: 2 };
const value = obj[id]; // reported, but left untouched by --fix
```

A file that already imports the helper reuses that import instead of gaining a
second one, whichever spelling it uses: `../../assertSafe` and
`functions/src/util/assertSafe` resolve to one module. Because the imports are
read from the AST when the fix is built rather than from traversal order, a key
access that appears _before_ the import declaration does not add a duplicate
either.

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
