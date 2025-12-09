# Extract static constants and functions to the global scope when possible, and enforce type narrowing with as const for numeric literals in loops (`@blumintinc/blumint/extract-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule flags two patterns:

- Constants or helper functions declared inside another function/block that never read from that scope.
- Numeric literals greater than 1 used directly inside loop boundaries (init, test, or update) without an `as const` assertion.

## Why this rule matters

- **Hidden reuse and extra allocations:** Nested declarations that do not use local values are recreated on every call, hiding that they are shared configuration or helpers that belong at module scope.
- **Magic numbers in loops:** Bare numeric literals are widened to `number`, so small edits can change related loops in surprising ways. Naming the value and locking it with `as const` documents the boundary and prevents accidental drift.

## How to fix

- Hoist the declaration to module scope. Use `UPPER_SNAKE_CASE` for immutable constants to signal their stability.
- Extract loop literals to a named constant with `as const`, or append `as const` inline when a local constant is appropriate.

## Examples

```typescript
function renderPage() {
  const DEFAULT_PAGE_SIZE = 50; // ❌ recreated every render
  return paginate(items, DEFAULT_PAGE_SIZE);
}

function loop() {
  for (let i = 2; i < items.length; i += 2) { // ❌ magic numbers with widened type
    console.log(items[i]);
  }
}
```

```typescript
const DEFAULT_PAGE_SIZE = 50;
function renderPage() {
  return paginate(items, DEFAULT_PAGE_SIZE);
}

const START = 2 as const;
const STEP = 2 as const;
function loop() {
  for (let i = START; i < items.length; i += STEP) {
    console.log(items[i]);
  }
}
```
