# Keep top-level functions grouped vertically so callers, exports, and helpers read top-down (`@blumintinc/blumint/vertically-group-related-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keep top-level functions together so readers can scan call chains from top to bottom without jumping around the file. The rule prefers grouping entry points (event handlers and exported functions) above the helpers they invoke and supports configurable grouping for exports, event handlers, and utilities.

### Rule Details

The rule looks at named, top-level function declarations and variable assignments whose initializer is an arrow/function expression. It ignores nested functions, inline callbacks, and methods defined inside object literals.

It reports when:
- Callers appear below the helpers they invoke (default `callers-first` dependency direction).
- Event handlers or exported functions are separated from the related helpers.
- Export placement does not match the configured preference (`top`/`bottom`).

### Options

```json
{
  "exportPlacement": "ignore | top | bottom",
  "dependencyDirection": "callers-first | callees-first",
  "groupOrder": ["event-handlers", "other", "utilities"],
  "eventHandlerPattern": "^(handle[A-Z]|on[A-Z])",
  "utilityPattern": "^(get|set|fetch|load|format|compute|transform|build|derive|prepare)"
}
```

- `exportPlacement` (default `ignore`): keep exported functions at the top or bottom of the function block.
- `dependencyDirection` (default `callers-first`): if set to `callees-first`, helpers may precede callers.
- `groupOrder` (default `["event-handlers", "other", "utilities"]`): preferred vertical grouping buckets.
- `eventHandlerPattern` / `utilityPattern`: regex strings used to classify functions for grouping. Patterns longer than 200 characters or containing nested greedy quantifiers are rejected with a warning and fall back to the safe defaults to avoid ReDoS-prone configurations.

### Examples of incorrect code for this rule

```typescript
// Default configuration (callers-first, event handlers first)
function fetchData() {
  return api.get('/data');
}

function processUserInput(input: string) {
  return sanitize(input);
}

function transformData(data: unknown[]) {
  return data.map((item) => (item as any).value);
}

function handleClick() {
  processUserInput(userInput);
}
```

```typescript
// exportPlacement: "bottom"
export function makeRequest() {}
function prepareRequest() {}
```

### Examples of correct code for this rule

```typescript
function handleClick() {
  processUserInput(userInput);
}

function processUserInput(input: string) {
  return sanitize(input);
}

function fetchData() {
  return api.get('/data');
}

function transformData(data: unknown[]) {
  return data.map((item) => (item as any).value);
}
```

```typescript
// exportPlacement: "bottom"
function prepareRequest() {}
export function makeRequest() {
  return prepareRequest();
}
```
