# Reserve boolean-style prefixes (is/has/should) for functions that actually return boolean values to avoid misleading call sites (`@blumintinc/blumint/no-misleading-boolean-prefixes`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Reserve boolean-style prefixes like is, has, or should for functions that actually return boolean values. This maintains clarity and sets accurate expectations about a function's return type.

- **Type**: problem
- **Recommended**: error

## Why

Boolean-style prefixes communicate that a function answers a yes/no question. If such functions return non-boolean values (like numbers, strings, or objects), it misleads readers and makes call sites harder to understand.

## Examples

Bad:

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
```

Good:

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
```

## Allowed patterns

- Type predicates (e.g., `function isUser(u): u is User { ... }`)
- Explicit `boolean` return types or `Promise<boolean>` (and unions with `null`/`undefined`/`void`)
- Obvious boolean expressions: comparisons (`>`, `===`), negations (`!x`, `!!x`), or `Boolean(x)`

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
