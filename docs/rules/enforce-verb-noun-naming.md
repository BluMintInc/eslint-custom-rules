# Enforce verb phrases for functions and methods (`@blumintinc/blumint/enforce-verb-noun-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Functions and methods are actions, so their names should start with an action verb followed by the thing they act on. Verb-first naming makes callable APIs predictable, keeps them distinct from data holders, and prevents teams from shipping symbols whose purpose is unclear at the call site.

## Why this rule?

- Verb-first names signal behavior and reduce ambiguity between functions and plain data.
- Consistent verb-noun phrasing makes call sites self-documenting and easier to scan in reviews and search results.
- Naming the action clarifies intent (fetch/process/validate) and avoids accidental misuse of a function that looks like a value.

## What this rule checks

- Function declarations.
- Functions or arrow functions assigned to identifiers.
- Class methods (excluding getters and constructors).
- React components are exempted based on PascalCase + JSX heuristics so component names can stay noun-based.
- Converter and wrapper patterns starting with prepositions such as `to` or `with` are allowed (e.g., `toNumber`, `withLogging`).

The rule validates the first word against a curated verb list and falls back to NLP tagging; it only reports when a verb phrase is not detected.

## Examples

### ❌ Incorrect

```ts
function userData() { return null; }
const data = () => null;
class Service { data() {} }
```

Example message:

```
Function "userData" should start with an action verb followed by the thing it acts on. Verb-first names tell readers this symbol performs work instead of representing data, which keeps APIs predictable and prevents accidental misuse. Rename "userData" to a verb-noun phrase such as "fetchUsers" or "processRequest".
```

### ✅ Correct

```ts
function fetchUserData() { return null; }
const processRequest = () => null;
class Service { processData() {} }
function toNumber(value) { return +value; } // converter pattern allowed
```

## When not to use it

- If your project intentionally names command functions with nouns or uses a different naming convention for functions and methods.
