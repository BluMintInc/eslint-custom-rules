# Prefer using type alias over interface (`@blumintinc/blumint/prefer-type-over-interface`)

⚠️ This rule _warns_ in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule prefers the use of `Type` over `Interface` in Typescript.

## Rule Details

Examples of **incorrect** code for this rule:

```typescript
interface SomeInterface { field: string; };
interface AnotherInterface extends SomeInterface { otherField: number; };
```

Examples of **correct** code for this rule:

```typescript
type SomeType = { field: string; };
type AnotherType = SomeType & { otherField: number; };
```