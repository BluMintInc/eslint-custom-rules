# Extract static constants and functions to the global scope when possible, and enforce type narrowing with as const for numeric literals in loops (`@blumintinc/blumint/extract-global-constants`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule flags two patterns you will see in reviews or CI:

- Constants or helper functions declared inside another function/block that never read from that scope.
- Numeric literals greater than 1 used directly inside loop boundaries (init, test, or update) without an `as const` assertion.

## Why this rule matters

- **Hidden reuse and extra allocations:** When you nest declarations that do not use local values, you recreate them on every call and hide that they are shared configuration or helpers that belong at module scope.
- **Magic numbers in loops:** When you use bare numeric literals in loop bounds, TypeScript widens them to `number`, so a small edit can change related loops before you notice. Naming the value and locking it with `as const` keeps the boundary explicit and synchronized.

## How to fix (what you should do)

- Hoist the declaration to module scope. Use `UPPER_SNAKE_CASE` for immutable constants so readers know the value is stable and importable.
- Extract loop literals to a named constant with `as const`, or append `as const` inline when a local constant is appropriate.

## Examples

```typescript
function renderPage() {
  const DEFAULT_PAGE_SIZE = 50; // ❌ you recreate it on every render
  return paginate(items, DEFAULT_PAGE_SIZE);
}

function loop() {
  for (let i = 2; i < items.length; i += 2) { // ❌ magic numbers with widened type
    console.log(items[i]);
  }
}
```

```typescript
const DEFAULT_PAGE_SIZE = 50 as const; // ✅ module-scoped and reusable
function renderPage() {
  return paginate(items, DEFAULT_PAGE_SIZE);
}

const START_INDEX = 2 as const;
const STEP_SIZE = 2 as const;
function loop() {
  for (let i = START_INDEX; i < items.length; i += STEP_SIZE) {
    console.log(items[i]);
  }
}

// Inline narrowing works when locality is clearer
function loopInline() {
  for (let i = 2 as const; i < items.length; i += 2 as const) {
    console.log(items[i]);
  }
}
```
