# All top-level variable declarations, type definitions, and functions should be exported (`@blumintinc/blumint/export-if-in-doubt`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

You must export every top-level variable (const/let/var), function, and type alias. These declarations define your module's public surface; leaving them unexported usually signals dead code or a hidden utility. Export the symbol or move it into a narrower scope when it should stay private.

## Rule Details

This rule checks for unexported top-level const, function, and type-alias declarations (AST nodes `VariableDeclaration`, `FunctionDeclaration`, and `TSTypeAliasDeclaration`) that sit directly under the `Program`. It reports any such declaration that is not exported, because:

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
export function getCachedScore(id: string) {
  function buildCache() {
    const cache = new Map<string, number>();
    return cache;
  }

  return buildCache().get(id);
}
```

In this example, the declaration is intentionally private, so it is moved into a narrower scope instead of being exported. Only top-level declarations are reported, so nesting `buildCache` inside the exported function satisfies the rule without widening the module's public API.

```typescript
const handleRequest = async () => {
  return 'ok';
};

export default handleRequest;
```

A declaration named by `export default` is part of the module API, so it is not reported.

### A name passed into the default export is still reported

Only the bare `export default <identifier>` form counts. Where the declaration is an argument to a wrapper rather than the exported value itself, it stays unimportable and the rule still reports it:

```typescript
const handleRequest = async () => {
  return 'ok';
};

// `handleRequest` is not importable from this module — only the wrapped result is
export default withLogging(handleRequest);
```

Export it as well (`export const handleRequest = ...`) if callers need it.
