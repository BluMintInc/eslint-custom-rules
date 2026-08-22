# Consolidate consecutive push calls on the same array into a single push with multiple arguments (`@blumintinc/blumint/flatten-push-calls`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Combine consecutive `push` calls on the same array into a single call so the batched intent is obvious and we avoid repeated function-call overhead.

## Rule Details

Array `push` accepts multiple arguments. Batching consecutive calls reduces repeated property access/call overhead and clarifies which values are appended together. The auto-fix only runs when the target is a simple identifier/member chain (no computed properties) and when the target/arguments have no side effects such as calls, `await`/`yield`, updates, or `delete`.

Every comment attached to a merged argument travels with it, so directives such as `eslint-disable-next-line` keep suppressing what they suppressed before the fix. The merged call stays on one line while it fits an 80-column print width and breaks one argument per line — with the trailing comma a formatter writes into any argument list it breaks — once it does not; a line comment, a comment spanning several lines, or an argument spanning several lines breaks the list whatever its width, because a line comment folded onto a single-line argument list would swallow the rest of the call. A single-line block comment rides along inline, glued to the argument it annotates.

### ❌ Incorrect

```typescript
const handlers = [];
handlers.push(fnA);
handlers.push(fnB);
handlers.push(fnC);
```

```typescript
const items = [];
items.push(first);
// ensure the next item is captured
items.push(second);
items.push(...more);
```

### ✅ Correct

```typescript
const handlers = [];
handlers.push(fnA, fnB, fnC);
```

```typescript
const items = [];
items.push(
  first,
  // ensure the next item is captured
  second,
  ...more,
);
```

```typescript
const items = [];
items.push(
  // eslint-disable-next-line no-console
  console.error,
  second,
);
```

```typescript
const values = [];
values.push(alpha /* measured in ms */, beta);
```

## When Not To Use It

Skip this rule if your style guide prefers one-argument pushes for logging or tracing purposes, even when they are consecutive.

## Limitations

- Targets that rely on computed properties (for example, `items[index].push(...)`) or that contain side-effectful evaluation are skipped because batching could change when getters, proxies, or argument side effects run.
- A comment parked somewhere the merged call cannot host it — between the callee and its argument list (`arr.push /* why */ (a)`), after a trailing comma, or between the closing parenthesis and the semicolon — is reported without an auto-fix rather than being dropped.
- An argument spanning several lines is carried across verbatim into a one-argument-per-line list. A formatter that hugs such an argument against the closing parenthesis — the shape `arr.push(x, {` opens — reformats the merged call once more.

## Implementation

- [Rule source](../../src/rules/flatten-push-calls.ts)
- [Test source](../../src/tests/flatten-push-calls.test.ts)
