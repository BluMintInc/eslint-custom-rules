# Keep top-level functions grouped vertically so callers, exports, and helpers read top-down (`@blumintinc/blumint/vertically-group-related-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keep top-level functions together so readers can scan call chains from top to bottom without jumping around the file. The rule prefers grouping entry points (event handlers and exported functions) above the helpers they invoke and supports configurable grouping for exports, event handlers, and utilities.

## Rule Details

You'll see this rule applied to named, top-level function declarations and variable declarations whose initializer is an arrow/function expression. The rule ignores nested functions, inline callbacks, and methods defined inside object literals.

The rule reports violations when:
- You have callers below the helpers they invoke (default `callers-first` dependency direction).
- You separate event handlers or exported functions from their related helpers.
- Your export placement does not match your configured preference (`top`/`bottom`).

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `exportPlacement` | `"ignore" \| "top" \| "bottom"` | `"ignore"` | Keep exported functions at the top or bottom of the function block |
| `dependencyDirection` | `"callers-first" \| "callees-first"` | `"callers-first"` | If set to `callees-first`, helpers may precede callers |
| `groupOrder` | `string[]` | `["event-handlers", "other", "utilities"]` | Preferred vertical grouping buckets |
| `eventHandlerPattern` | `string` | `"^(handle[A-Z]\|on[A-Z])"` | Regex pattern to classify event handler functions |
| `utilityPattern` | `string` | `"^(get\|set\|fetch\|load\|format\|compute\|transform\|build\|derive\|prepare)"` | Regex pattern to classify utility functions |

Patterns longer than 200 characters or containing nested greedy quantifiers are rejected with a warning and fall back to the safe defaults to avoid ReDoS-prone configurations.

## Examples of incorrect code for this rule

```typescript
// Default configuration (callers-first, event handlers first)

// Lint: vertically-group-related-functions - "processUserInput" should appear below its caller "handleClick"
function processUserInput(input: string) {
  const sanitized = sanitizeInput(input);
  return validateInput(sanitized);
}

// Lint: vertically-group-related-functions - "sanitizeInput" should appear below its caller "processUserInput"
function sanitizeInput(input: string) {
  return input.trim().toLowerCase();
}

// Lint: vertically-group-related-functions - "validateInput" should appear below its caller "processUserInput"
function validateInput(input: string) {
  return input.length > 0;
}

// Lint: vertically-group-related-functions - "handleClick" (event handler) should appear at the top of the file
function handleClick() {
  const input = "example input";
  processUserInput(input);
}
```

```typescript
// exportPlacement: "bottom"
export function makeRequest() {
  return prepareRequest();
}

function prepareRequest() {}
```

## Examples of correct code for this rule

```typescript
// Default configuration (callers-first, event handlers first)
function handleClick() {
  const input = "example input";
  processUserInput(input);
}

function processUserInput(input: string) {
  const sanitized = sanitizeInput(input);
  return validateInput(sanitized);
}

function sanitizeInput(input: string) {
  return input.trim().toLowerCase();
}

function validateInput(input: string) {
  return input.length > 0;
}
```

```typescript
// exportPlacement: "bottom"
function prepareRequest() {}

export function makeRequest() {
  return prepareRequest();
}
```
