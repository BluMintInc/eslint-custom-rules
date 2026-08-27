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

### Examples of incorrect code

Names suggest booleans but return non-boolean values.

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

A type assertion changes no runtime value, so wrapping the same return in one
leaves the contract just as misleading. `as const`, `satisfies`, `!` and
`<T>value` are all seen through, including when nested:

```typescript
function isUser() {
  return { id: 1 } as const;
}

function hasProfile() {
  return { name: 'a' } satisfies Profile;
}

function shouldCache() {
  return ({ ttl: 1 } as const)!;
}
```

A class member spelled as a field holding a function is a function everywhere it
matters: `state.isReady()` reads the same whether the member was written as a
method or as a bound property, so the prefix makes the same promise to the same
call sites. Both spellings are judged, under every modifier:

```typescript
class SessionState {
  isReady = (): string => {
    return 'ready';
  };

  public hasItems = async () => {
    return this.items.length;
  };
}
```

### Examples of correct code

Boolean prefixes return explicit booleans, or the name drops the prefix.

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

function getConfig(config) {
  return config ?? {};
}
```

An assertion that declares a boolean-like type states the same contract an
explicit return annotation does, so it is accepted:

```typescript
function isReady(value: unknown) {
  return value as boolean;
}

function isEnabled() {
  return true as const;
}
```

The same holds for the class-field spelling — the remedy is a real boolean or a
name without the prefix, exactly as it is for a method:

```typescript
class SessionState {
  isReady = (): boolean => {
    return this.ready;
  };

  public hasItems = async (): Promise<boolean> => {
    return this.items.length > 0;
  };
}
```

## Allowed patterns

- Type predicates (e.g., `function isUser(u): u is User { ... }`)
- Explicit `boolean` return types or `Promise<boolean>` (and unions with `null`/`undefined`/`void`)
- Obvious boolean expressions: comparisons (`>`, `===`), negations (`!x`, `!!x`), or `Boolean(x)`
- Assertions declaring a boolean-like type (`value as boolean`, `value satisfies boolean`); an assertion naming any other type — or none, as with `as const` — leaves the asserted expression to decide
- Class fields that hold a value rather than a function (`isDone = false`, `hasItems = compute()`), and fields with no initializer at all (`declare`, `!:` and `abstract`): there is no return value to judge. A field's own value is the subject of `enforce-boolean-naming-prefixes`
- Members reached by a computed key (`['isDone'] = () => ...`) or a private name (`#isDone = () => ...`), where the checked name is not the one a call site writes

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
