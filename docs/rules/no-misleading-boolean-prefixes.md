# Reserve boolean-style prefixes (is/has/should) for functions that actually return boolean values to avoid misleading call sites (`@blumintinc/blumint/no-misleading-boolean-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Reserve boolean-style prefixes like is, has, or should for functions that actually return boolean values. Boolean prefixes promise a yes/no answer; returning strings, objects, or void misleads callers about the contract and hides incorrect branching.

- **Type**: problem
- **Recommended**: error

## Why

- Boolean prefixes signal that the function answers a yes/no question. Returning non-boolean values makes call sites read as conditionals when they are not.
- Non-boolean returns with boolean prefixes hide logic errors (e.g., returning a string then checking it in an `if` silently coerces to `true`).
- Consistent prefixes keep APIs self-documenting and prevent subtle bugs caused by mistaken truthiness checks.

## Examples

Bad: names suggest booleans but return non-boolean values.
```javascript
function isAvailable() {
  return 'yes';
}

const hasItems = (arr) => arr.length;

async function shouldRefresh() {
  return 'false';
}

function isUser() {
  return { id: 1 };
}

function hasConfig() {
  return config || {};
}
```

Good: boolean prefixes return explicit booleans or use non-boolean names.
```javascript
function isAvailable() {
  return Math.random() > 0.5;
}

const hasItems = (arr) => arr.length > 0;

async function shouldRefresh() {
  const stale = await cache.isStale();
  return stale === true;
}

function getUser() {
  return { id: 1 };
}

function getConfig() {
  return config || {};
}
```

## Allowed patterns

- Type predicates (e.g., `function isUser(u): u is User { ... }`)
- Explicit `boolean` return types or `Promise<boolean>` (and unions with `null`/`undefined`/`void`)
- Obvious boolean expressions: comparisons (`>`, `===`), negations (`!x`, `!!x`), or `Boolean(x)`

## How to fix

- Return a real boolean: add a comparison, wrap with `Boolean(...)`, or ensure the annotated return type is `boolean`/`Promise<boolean>`.
- Rename the function to drop the boolean-style prefix if it legitimately returns a non-boolean value (e.g., `getUser`, `loadData`).
- Keep boolean prefixes reserved for functions that answer a yes/no question.

## Options

```json
{
  "@blumintinc/blumint/no-misleading-boolean-prefixes": [
    "error",
    { "prefixes": ["is", "has", "should"] }
  ]
}
```

- **prefixes**: string[] — prefixes considered boolean-like. Defaults to `["is", "has", "should"]`.
