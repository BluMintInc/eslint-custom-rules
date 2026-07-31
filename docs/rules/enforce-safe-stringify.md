# Enforce using safe-stable-stringify instead of JSON.stringify to handle circular references and ensure deterministic output. JSON.stringify can throw errors on circular references and produce inconsistent output for objects with the same properties in different orders. safe-stable-stringify handles these cases safely (`@blumintinc/blumint/enforce-safe-stringify`)

💼 This rule is enabled in the ✅ `recommended` config.

💡 This rule is manually fixable by [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

<!-- end auto-generated rule header -->

## Rule Details

`JSON.stringify` throws on circular references and serializes object keys in
insertion order, so two structurally equal objects can produce different strings
(breaking cache keys, hashes, and snapshot comparisons).
[`safe-stable-stringify`](https://www.npmjs.com/package/safe-stable-stringify)
handles cycles and sorts keys deterministically.

### Examples of **incorrect** code for this rule:
```ts
const key = JSON.stringify(payload);
```

### Examples of **correct** code for this rule:
```ts
import stringify from 'safe-stable-stringify';

const key = stringify(payload) ?? '';
```

## The rewrite is a suggestion, not an auto-fix

`stringify` returns `string | undefined` (its `undefined` overload fires for
`any`, `unknown`, and `... | undefined` arguments) where `JSON.stringify`
returns `string`. A batch `--fix` would silently widen the return type and break
`: string` contracts (TS2322/TS2345) — lint passing while `tsc` fails. The
migration is therefore offered per call site as an editor suggestion, so the
author handles the possible `undefined` (`stringify(obj) ?? ''`).

## When the suggestion is withheld

The suggestion rewrites the call to a bare `stringify` and inserts
`import stringify from 'safe-stable-stringify';`. Both halves break when the
name `stringify` already resolves to something else at the call site:

* A module-scope `const`/`function`/`class` named `stringify`, or a named import
  of `stringify` from another module, collides with the inserted import
  (TS2440 / TS2300).
* A shadowing parameter or local binding captures the replacement with **no**
  compile error at all, so the rewritten call quietly invokes the shadow instead
  of the module.

The rule resolves `stringify` through the scope chain at the call site and
withholds the suggestion whenever the visible binding is anything other than a
default or named `stringify` specifier imported from `safe-stable-stringify`
(a namespace import is not callable, so it is treated as a collision too). The
`useStableStringify` report still fires, leaving the migration to the author.

Because the file's imports are read from the AST when the suggestion is built
rather than from traversal order, a `JSON.stringify` that appears *before* the
`safe-stable-stringify` import does not add a duplicate import.


