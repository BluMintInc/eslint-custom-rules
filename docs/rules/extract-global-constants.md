# Extract static constants and functions to the global scope when possible (`@blumintinc/blumint/extract-global-constants`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule suggests that if a constant or a function within a function or block scope doesn't depend on any other identifiers in that scope, it should be moved to the global scope. This aims to improve the readability of the code and the possibility of reuse.

## Rule Details

This rule enforces that all `const` declarations and `FunctionDeclaration` at a non-global scope, which have no dependencies on other identifiers within the scope, should be extracted to the global scope.

### Examples of incorrect code for this rule:

```typescript
function someFunc() {
  const SOME_CONST = "Hello, world!";
}

function parentFunc() {
  function childFunc() { return "Hello, world!"; }
}
```

### Examples of correct code for this rule:

```typescript
const SOME_CONST = "Hello, world!";
function someFunc() { /* ... */ }

function childFunc() { return "Hello, world!"; }
function parentFunc() { /* ... */ }
```

In the correct examples, each declaration is moved to the global scope since they don't depend on any identifier in their previous block or function scope. This aligns with the rule and promotes potential reuse of these declarations.
