# Prefer using type alias over interface (`@blumintinc/blumint/prefer-type-over-interface`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

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