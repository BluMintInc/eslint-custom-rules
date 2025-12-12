# All top-level const definitions, type definitions, and functions should be exported (`@blumintinc/blumint/export-if-in-doubt`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You must export every top-level const, function, and type alias. These declarations define your module's public surface; leaving them unexported usually signals dead code or a hidden utility. Export the symbol or move it into a narrower scope when it should stay private.

## Rule Details

This rule targets `VariableDeclaration`, `FunctionDeclaration`, and `TSTypeAliasDeclaration` nodes that sit directly under the `Program`. It reports any such declaration that is not exported, because:

- Top-level declarations are expected to form the module API; unexported symbols become invisible to other files and invite duplicate implementations.
- Hidden top-level code makes intent unclear—callers cannot tell whether the symbol is private or simply forgotten.
- Exporting or moving the code into a narrower scope clarifies ownership and prevents dead code from drifting through the codebase.

To satisfy the rule, either export the declaration (for example, `export const foo = ...`) or relocate it inside a function/inner block when it should remain private.

### Examples of incorrect code for this rule:

```typescript
const someVar = "Hello, world!";
function someFunc() { return someVar; }
type SomeType = { val: number };
```

### Examples of correct code for this rule:

```typescript
export const someVar = "Hello, world!";
export function someFunc() { return someVar; }
export type SomeType = { val: number };
```


```typescript
function buildCache() {
  const cache = new Map<string, number>();
  return cache;
}
```

In this example the declaration is intentionally private, so it is moved into a narrower scope instead of being exported.

