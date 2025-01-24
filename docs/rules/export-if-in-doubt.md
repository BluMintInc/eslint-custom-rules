# All top-level const definitions, type definitions, and functions should be exported (`@blumintinc/blumint/export-if-in-doubt`)

<!-- end auto-generated rule header -->

<!-- end auto-generated rule header -->

<!-- end auto-generated rule header -->

This rule enforces that all top-level const definitions, type definitions, and functions should always be exported. If not done, this rule will trigger a warning message suggesting to export the declaration.

## Rule Details

This rule targets `VariableDeclaration`, `FunctionDeclaration`, and `TSTypeAliasDeclaration` at the top-level of the file. It will issue a warning if these are not part of an `ExportNamedDeclaration`.

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

