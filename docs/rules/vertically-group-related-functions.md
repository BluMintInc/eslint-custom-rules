# Keep top-level functions grouped vertically so callers, exports, and helpers read top-down (`@blumintinc/blumint/vertically-group-related-functions`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

Keep top-level functions together so readers can scan call chains from top to bottom without jumping around the file. The rule prefers grouping entry points (event handlers and exported functions) above the helpers they invoke and supports configurable grouping for exports, event handlers, and utilities.

The **call graph takes precedence over `groupOrder`**: `dependencyDirection` orders any functions related by a call, and the name-prefix buckets (`groupOrder`, `eventHandlerPattern`, `utilityPattern`) only settle ties among functions the call graph does not relate. A caller is therefore never placed below the helpers it invokes on account of its verb prefix — so a diamond fan-out (one caller invoking several independent helper chains) reads cleanly in its natural callers-first order.

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

// Lint: vertically-group-related-functions - "processUserInput" should appear below its caller "onSubmit"
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

// Lint: vertically-group-related-functions - "onSubmit" (event handler) should appear at the top of the file
function onSubmit() {
  const input = "example input";
  processUserInput(input);
}
```

```typescript
// eslint-options: {"exportPlacement": "bottom"}
export function makeRequest() {
  return prepareRequest();
}

function prepareRequest() {}
```

## Examples of correct code for this rule

```typescript
// Default configuration (callers-first, event handlers first)
function onSubmit() {
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
// eslint-options: {"exportPlacement": "bottom"}
function prepareRequest() {}

export function makeRequest() {
  return prepareRequest();
}
```

## Declarations with sibling bindings

A function declared alongside other bindings — `const helper = () => 1, offset = 2;` —
is ordered and reported on like any other function: a sibling declarator changes
what the statement holds, not whether the file reads top-down.

The autofix is withheld for such a file. Relocating `helper` means splitting the
declaration, and the sibling's initializer cannot be moved along with it or left
behind without changing when it runs, so the reorder is left to the author.
Where one statement declares several function-like bindings, only the first is
ordered, since the rest cannot move independently of it.

## Module-scope callers of a moved helper

The reorder pins non-function statements in place and swaps functions among
their own slots. When a pinned statement reads a `const`-declared helper at
module evaluation time — an initializer such as
`const CHAMPION = buildHit('champion')`, a bare top-level call, an IIFE, or an
`export default` of the binding — carrying that helper below the pinned
statement would emit a file that parses and type-checks yet throws
`ReferenceError: Cannot access '…' before initialization` the moment anything
imports it.

The autofix is withheld for such a file; the misorder is still reported and the
reorder is left to the author. References inside function bodies stay deferred
to call time and never withhold the fix — callers reading helpers from their
bodies is exactly the shape this rule enforces — and demoting a hoisted
`function` declaration past its module-scope caller stays loadable, so it is
not declined either.

## Shebang files

A `#!` shebang belongs to the file rather than to the statement beneath it, so
the reordering fix never moves it: it stays on line 1 even when the first
function in the file is the one being relocated. Anywhere else, `#!` is a syntax
error (`TS18026`) and the file stops being executable.
